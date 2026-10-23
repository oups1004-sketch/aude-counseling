export const rorschachCards = ['I','II','III','IV','V','VI','VII','VIII','IX','X'] as const;
export type RorschachResponse = {id:string;card:string;response:string;inquiry:string;location:string;orientation:string;observation:string;coding:string};
export type RorschachDraft = {examDate:string;responses:RorschachResponse[];summary:string};
export type RorschachPoint = {x:number;y:number};
export type RorschachMark = {id:string;points:RorschachPoint[]};
export type RorschachRoom = {codeHash:string;expiresAt:string;endedAt?:string;joinedAt?:string;stage:'response'|'inquiry';card:string;hidden:boolean;revision:number;activeResponseId?:string;view?:{card:string;angle:number;scale:number;at:string};marks:Record<string,RorschachMark[]>};
export type RorschachData = RorschachDraft & {recordsVersion?:number;room?:RorschachRoom;type:'rorschach-record';clientId:string;clientName:string;creationNonce:string;creationSignature:string;version:number};
export type RorschachRow = {id:string;created_at:string;data:RorschachData};
export function validateDraft(input:unknown):RorschachDraft {
 if(!input||typeof input!=='object')throw new Error('기록 내용을 확인해 주세요.');
 const d=input as Record<string,unknown>;
 const string=(v:unknown,max:number)=>{if(typeof v!=='string'||v.length>max)throw new Error(`입력 내용은 ${max.toLocaleString()}자 이내로 작성해 주세요.`);return v;};
 const examDate=string(d.examDate,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(examDate)||!Number.isFinite(Date.parse(examDate))||new Date(examDate).toISOString().slice(0,10)!==examDate)throw new Error('검사일을 확인해 주세요.');
 if(!Array.isArray(d.responses)||d.responses.length>300)throw new Error('반응은 검사당 300개 이내로 기록해 주세요.');
 const ids=new Set<string>();
 const responses=d.responses.map((value:unknown)=>{
  if(!value||typeof value!=='object')throw new Error('반응 내용을 확인해 주세요.');
  const r=value as Record<string,unknown>;const id=string(r.id,80);const card=string(r.card,4);
  if(!/^[\w-]{1,80}$/.test(id)||ids.has(id)||!rorschachCards.includes(card as typeof rorschachCards[number]))throw new Error('반응 번호나 도판 번호를 확인해 주세요.');ids.add(id);
  const orientation=string(r.orientation,10);if(!['0','90','180','270','미기록'].includes(orientation))throw new Error('도판 방향을 확인해 주세요.');
  return {id,card,orientation,response:string(r.response,12000),inquiry:string(r.inquiry,12000),location:string(r.location,2000),observation:string(r.observation,6000),coding:string(r.coding,4000)};
 });
 return {examDate,responses,summary:string(d.summary,30000)};
}
export function recordsCsv(d:RorschachDraft,marks:Record<string,RorschachMark[]>={}) {
 const cell=(s:string)=>'"'+(/^[\s]*[=+@-]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';
 const rows=[['검사일','도판','반응 번호','반응 원문','질문단계 기록','반응 위치','도판 방향','행동관찰','채점 메모','위치 표시(원본 기준 0~1 좌표)'],...rorschachCards.flatMap(card=>d.responses.filter(r=>r.card===card).map((r,i)=>[d.examDate,card,String(i+1),r.response,r.inquiry,r.location,r.orientation,r.observation,r.coding,JSON.stringify(marks[r.id]||[])])),['종합 메모',d.summary]];
 return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
