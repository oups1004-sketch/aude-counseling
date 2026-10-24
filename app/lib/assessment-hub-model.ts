import { seoulDate } from './operations-model';
import type { OperationRow } from './operations-model';
export type AssessmentEntry={key:string;id:string;source:'slot'|'tat'|'rorschach';clientId:string;clientName:string;service:string;testName:string;date:string;manualInterpretationDate:string;interpretationDate:string;scheduledAt:string;appointmentId:string;status:string;deletedAt?:string;stockItemId?:string;updatedAt?:string;legacyCompleted?:boolean};
export type StockItem={id:string;name:string;format:string;purchased:number;adjustment:number;used:number;remaining:number;movements:StockMovement[]};
export type StockMovement={id:string;itemId:string;name:string;format:string;date:string;quantity:number;kind:'purchase'|'adjustment';note:string};
export function linkInterpretation(entry:AssessmentEntry,appointments:OperationRow[]):AssessmentEntry {
 const linked=appointments.filter(r=>r.data.clientId===entry.clientId&&(r.data.assessmentKeys||[]).includes(entry.key)&&!r.data.archived);
 const completed=linked.filter(r=>r.data.status==='완료').sort((a,b)=>(a.data.startAt||'').localeCompare(b.data.startAt||''))[0];
 const reserved=linked.filter(r=>r.data.status==='예약').sort((a,b)=>(a.data.startAt||'').localeCompare(b.data.startAt||''))[0];
 const interpretationDate=entry.manualInterpretationDate||(completed?.data.startAt?seoulDate(completed.data.startAt):'');
 const done=!!interpretationDate||!!entry.legacyCompleted;
 return {...entry,interpretationDate,scheduledAt:done?'':reserved?.data.startAt||'',appointmentId:completed?.id||reserved?.id||'',status:done?'해석 완료':reserved?'해석 예약':'해석 대기'};
}
export function stockSummary(movements:StockMovement[],entries:AssessmentEntry[]):StockItem[]{
 const items=new Map<string,StockItem>();
 for(const m of movements){const item=items.get(m.itemId)||{id:m.itemId,name:m.name,format:m.format,purchased:0,adjustment:0,used:0,remaining:0,movements:[]};if(m.kind==='purchase')item.purchased+=m.quantity;else item.adjustment+=m.quantity;item.movements.push(m);items.set(m.itemId,item);}
 // Deleted records retain consumption: deleting a record does not un-use a test code.
 for(const entry of entries)if(entry.stockItemId){const item=items.get(entry.stockItemId);if(item)item.used++;}
 return Array.from(items.values()).map(i=>({...i,remaining:i.purchased+i.adjustment-i.used})).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
}
