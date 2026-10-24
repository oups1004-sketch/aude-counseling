export const rorschachCards = ['I','II','III','IV','V','VI','VII','VIII','IX','X'] as const;
export type InquiryTurn = {question:string;answer:string};
export type RorschachResponse = {questions?:InquiryTurn[];note?:string;id:string;card:string;response:string;inquiry:string;location:string;orientation:string;observation:string;coding:string};
export type RorschachDraft = {examDate:string;responses:RorschachResponse[];summary:string};
export type RorschachPoint = {x:number;y:number};
export type RorschachMark = {id:string;author?:'participant'|'counselor';points:RorschachPoint[]};
export type RorschachRoom = {codeHash:string;expiresAt:string;endedAt?:string;joinedAt?:string;stage:'response'|'inquiry';card:string;hidden:boolean;revision:number;activeResponseId?:string;view?:{card:string;angle:number;scale:number;at:string};drawingUndoAfter?:Record<string,(RorschachMark[]|null)[]>;drawingUndo?:Record<string,RorschachMark[][]>;marks:Record<string,RorschachMark[]>};
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
  let questions:InquiryTurn[]|undefined;
  if(r.questions!==undefined){if(!Array.isArray(r.questions)||r.questions.length<1||r.questions.length>60)throw new Error('질문은 반응당 1~60개로 작성해 주세요.');questions=r.questions.map(q=>{if(!q||typeof q!=='object')throw new Error('질문과 응답을 확인해 주세요.');return {question:string(q.question,6000),answer:string(q.answer,12000)};});}
  return {...(questions?{questions}:{}),...(r.note!==undefined?{note:string(r.note,6000)}:{}),id,card,orientation,response:string(r.response,12000),inquiry:string(r.inquiry,12000),location:string(r.location,2000),observation:string(r.observation,6000),coding:string(r.coding,4000)};
 });
 return {examDate,responses,summary:string(d.summary,30000)};
}
export function recordsCsv(d:RorschachDraft,marks:Record<string,RorschachMark[]>={}) {
 const cell=(s:string)=>'"'+(/^[\s]*[=+@-]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';
 const legacy=d.responses.some(r=>r.location||r.coding);
 const rows=[['검사일','도판','반응 번호','반응 원문','메모','도판 방향','질문단계 기록','윤곽 표시(원본 기준 0~1 좌표)',...(legacy?['이전 반응 위치','이전 채점 메모']:[])],...rorschachCards.flatMap(card=>d.responses.filter(r=>r.card===card).map((r,i)=>[d.examDate,card,String(i+1),r.response,r.note??r.observation,r.orientation,r.questions?r.questions.map((q,n)=>`${n+1}. 질문: ${q.question}\n내담자 응답: ${q.answer}`).join('\n\n'):r.inquiry,JSON.stringify(marks[r.id]||[]),...(legacy?[r.location,r.coding]:[])])),['종합 메모',d.summary]];
 return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}

export function responseQuestions(r:RorschachResponse):InquiryTurn[]{return r.questions?.length?r.questions:Array.from({length:3},(_,n)=>({question:'',answer:n===0?r.inquiry:''}));}
