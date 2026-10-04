export const recordFields = ['note','story','hero','need','pressure','interpretation'] as const;
export type RecordField = typeof recordFields[number];
export type CardRecord = Partial<Record<RecordField,string>>;
export type CardRecords = Record<string,CardRecord>;
export const fieldLabels: Record<RecordField,string> = {note:'실시 메모',story:'이야기 원문',hero:'주인공',need:'욕구',pressure:'압력',interpretation:'해석'};
export const fieldLimits: Record<RecordField,number> = {note:12000,story:40000,hero:6000,need:6000,pressure:6000,interpretation:16000};
export type RecordChange = {card:string;fields:CardRecord;expected:CardRecord};
export function applyRecordChanges(current:CardRecords, order:string[], changes:unknown):CardRecords {
 if(!Array.isArray(changes)||!changes.length||changes.length>31)throw new Error('저장할 도판 기록을 확인해 주세요.');
 const next={...current};const seen=new Set<string>();
 for(const change of changes){
  if(!change||typeof change.card!=='string'||!order.includes(change.card)||seen.has(change.card)||!change.fields||typeof change.fields!=='object'||Array.isArray(change.fields)||!change.expected||typeof change.expected!=='object')throw new Error('도판 기록 형식을 확인해 주세요.');
  seen.add(change.card);const record={...(current[change.card]||{})};
  const keys=Object.keys(change.fields);if(!keys.length)throw new Error('저장할 내용이 없습니다.');
  for(const key of keys){
   if(!recordFields.includes(key as RecordField))throw new Error('지원하지 않는 기록 항목입니다.');
   const field=key as RecordField,value=change.fields[field];
   if(typeof value!=='string'||value.length>fieldLimits[field])throw new Error(`${fieldLabels[field]}의 길이를 확인해 주세요.`);
   if(typeof change.expected[field]!=='string'||(record[field]||'')!==change.expected[field])throw new Error('다른 창에서 이 기록을 수정했습니다. 작성 내용을 복사한 뒤 검사 기록을 다시 열어 주세요.');
   record[field]=value;
  }next[change.card]=record;
 }if(JSON.stringify(next).length>900000)throw new Error('검사 기록의 전체 용량을 확인해 주세요.');return next;
}
// Excel clipboard TSV: quoted tabs, escaped quotes and multiline cells are preserved.
export function parseTsv(text:string):string[][] {
 if(text.length>1000000)throw new Error('붙여넣은 내용이 너무 큽니다.');
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c==='"'&&!cell&&!closed){quoted=true;continue;}
  if(c==='\t'){row.push(cell);cell='';closed=false;continue;}
  if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';closed=false;continue;}
  if(closed)throw new Error('따옴표로 묶인 셀 뒤의 구분자를 확인해 주세요.');cell+=c;
 }if(quoted)throw new Error('셀의 따옴표가 닫히지 않았습니다. 엑셀에서 표를 다시 복사해 주세요.');
 if(cell||row.length){row.push(cell);rows.push(row);}return rows.filter(r=>r.some(c=>c.trim()));
}
export type ImportedRecord={card:string;fields:CardRecord};
export function parseRecordImport(text:string,order:string[]):ImportedRecord[]{
 const rows=parseTsv(text.replace(/^\uFEFF/,''));if(!rows.length)throw new Error('엑셀에서 표를 복사해 붙여넣어 주세요.');
 const first=rows[0].map(c=>c.trim());const header=['도판','도판 번호','card'].includes(first[0].toLowerCase());
 let columns:RecordField[]=['story','hero','need','pressure','interpretation'];
 if(header){const aliases:Record<string,RecordField>={'이야기':'story','이야기 원문':'story','주인':'hero','주인공':'hero','욕구':'need','압력':'pressure','해석':'interpretation','실시 메모':'note','관찰 메모':'note','메모':'note'};columns=first.slice(1).map(c=>{const field=aliases[c]||(recordFields.includes(c as RecordField)?c as RecordField:undefined);if(!field)throw new Error(`알 수 없는 열 제목: ${c}`);return field;});if(new Set(columns).size!==columns.length)throw new Error('중복된 열 제목이 있습니다.');rows.shift();}
 const seen=new Set<string>();return rows.map((row,index)=>{
  if(row.length<2||row.length!==columns.length+1)throw new Error(`${index+1}행의 열 수를 확인해 주세요. 도판 번호와 ${columns.length}개 기록 열이 필요합니다.`);
  const card=row[0].trim().toUpperCase().replace(/^(?:도판\s*)/,'').replace(/^0+(?=\d)/,'');
  if(!order.includes(card))throw new Error(`${index+1}행: ${card} 도판은 이 검사에 포함되어 있지 않습니다.`);
  if(seen.has(card))throw new Error(`${card} 도판이 중복되었습니다.`);seen.add(card);
  const fields:CardRecord={};columns.forEach((field,n)=>{const value=row[n+1];if(value.length>fieldLimits[field])throw new Error(`${card} 도판 ${fieldLabels[field]}가 너무 깁니다.`);fields[field]=value;});return {card,fields};
 });
}
