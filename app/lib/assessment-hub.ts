import { supabaseAdminRequest } from './supabase';
import { isConfirmedClient } from './client-eligibility';
import { isTrustedSession,sign,validId } from './tat';
import { trustedRecord } from './rorschach-room';
import { seoulDate } from './operations-model';
import type { AssessmentEntry,StockMovement } from './assessment-hub-model';
import { timingSafeEqual } from 'node:crypto';
type Row={id:string;created_at:string;data:Record<string,any>};
export async function assessmentRows(filter:string):Promise<Row[]>{
 const result:Row[]=[];for(let offset=0;offset<50000;offset+=500){const r=await supabaseAdminRequest('/rest/v1/counseling_requests?select=id,created_at,data&order=created_at.desc,id.desc&limit=500&offset='+offset+'&'+filter);const rows=await r.json();result.push(...rows);if(rows.length<500)return result;}throw new Error('검사 기록이 많아 전체를 불러오지 못했습니다.');
}
export async function assessmentSources(clientId?:string){
 if(clientId&&!validId(clientId))throw new Error('내담자를 확인해 주세요.');
 const [rawClients,rawProjectives]=await Promise.all([
  assessmentRows(clientId?'id=eq.'+clientId:'data->>adminManagedClient=eq.true'),
  assessmentRows('data->>type=in.(tat-session,rorschach-record)'+(clientId?'&data->>clientId=eq.'+clientId:''))
 ]);
 const clients=rawClients.filter(r=>isConfirmedClient(r.data));
 const projectives=rawProjectives.filter(r=>isTrustedSession(r as never)||trustedRecord(r as never));
 const entries:AssessmentEntry[]=[];
 for(const c of clients){
  const service=String(c.data.service||'');const clientName=String(c.data.clientName||c.data.name||'내담자');
  const base={clientId:c.id,clientName,service,interpretationDate:'',scheduledAt:'',appointmentId:'',status:'해석 대기'};
  for(const r of c.data.assessments||[])entries.push({...base,key:'slot:'+r.id,id:r.id,source:'slot',testName:r.testName,date:r.date||'',manualInterpretationDate:r.interpretationDate||'',legacyCompleted:!r.interpretationDate&&['해석 완료','해석상담 완료'].includes(r.status),deletedAt:r.deletedAt,stockItemId:r.stockItemId,updatedAt:r.updatedAt});
  for(const r of projectives.filter(p=>p.data.clientId===c.id)){
   const source=r.data.type==='tat-session'?'tat':'rorschach';const key=source+':'+r.id;const meta=r.data;
   entries.push({...base,key,id:r.id,source,testName:source==='tat'?'TAT':'로르샤흐',date:meta.examDate??(source==='tat'?seoulDate(r.created_at):''),manualInterpretationDate:meta.interpretationDate||'',deletedAt:r.data.deletedAt,updatedAt:String(meta.recordsVersion??meta.version??0)});
  }
 }
 return {clients,projectives,entries};
}
function stockPayload(m:StockMovement){return JSON.stringify([m.id,m.itemId,m.name,m.format,m.date,m.quantity,m.kind,m.note]);}
function trustedStock(r:Row){const d=r.data;if(d.type!=='aude-test-stock'||!validId(r.id)||!validId(d.creationNonce))return false;const expected=sign('aude-test-stock:'+d.creationNonce+':'+stockPayload(d.movement));return typeof d.creationSignature==='string'&&d.creationSignature.length===expected.length&&timingSafeEqual(Buffer.from(d.creationSignature),Buffer.from(expected));}
export async function stockMovements():Promise<StockMovement[]>{return (await assessmentRows('data->>type=eq.aude-test-stock')).filter(trustedStock).map(r=>r.data.movement);}
export async function insertStock(movement:StockMovement){
 const nonce=movement.id;
 const existing=await assessmentRows('data->>creationNonce=eq.'+nonce);
 if(existing.length){if(existing.some(trustedStock))return;throw new Error('저장 요청을 확인해 주세요.');}
 const data={type:'aude-test-stock',creationNonce:nonce,movement,creationSignature:sign('aude-test-stock:'+nonce+':'+stockPayload(movement))};
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,''),key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;if(!url||!key)throw new Error('저장 연결을 확인해 주세요.');
 const r=await fetch(url+'/rest/v1/counseling_requests',{method:'POST',cache:'no-store',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({id:nonce,data})});
 if(!r.ok&&r.status!==409)throw new Error('재고 내역을 저장하지 못했습니다.');
 if(!(await assessmentRows('id=eq.'+nonce)).some(trustedStock))throw new Error('재고 저장 결과를 확인하지 못했습니다. 같은 창에서 다시 저장해 주세요.');
}
export async function patchClientSnapshot(row:Row,data:Record<string,unknown>){const r=await supabaseAdminRequest('/rest/v1/counseling_requests?id=eq.'+row.id+'&data=eq.'+encodeURIComponent(JSON.stringify(row.data)),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({data})});if(!(await r.json()).length)throw new Error('다른 변경사항이 저장되었습니다. 새로고침 후 다시 시도해 주세요.');}
