import { createHmac,timingSafeEqual } from 'node:crypto';
import { supabaseAdminRequest } from './supabase';
import { validId } from './tat';
import { Operation,OperationRow,OperationType,operationTypes,appointmentKinds,appointmentStatuses,expenseCategories,amount,text,validDate,paymentMethods,evidenceStatuses,chargeTotals,paymentAccount,financeAccounts } from './operations-model';
import { assessmentSources } from './assessment-hub';
import { isConfirmedClient } from './client-eligibility';
function signature(type:string,nonce:string){const secret=process.env.ADMIN_PASSWORD;if(!secret)throw new Error('관리자 설정을 확인해 주세요.');return createHmac('sha256',secret).update('aude-operations:'+type+':'+nonce).digest('hex');}
export function trustedOperation(row:OperationRow|undefined){if(!row||!validId(row.id)||!operationTypes.includes(row.data?.type)||!validId(row.data.creationNonce))return false;const expected=signature(row.data.type,row.data.creationNonce),actual=row.data.creationSignature;return typeof actual==='string'&&actual.length===expected.length&&timingSafeEqual(Buffer.from(actual),Buffer.from(expected));}
export async function getOperation(id:string){if(!validId(id))throw new Error('기록을 확인해 주세요.');const r=await supabaseAdminRequest(`/rest/v1/counseling_requests?id=eq.${id}&select=id,created_at,data&limit=1`);const row=(await r.json())[0] as OperationRow;if(!trustedOperation(row))throw new Error('기록을 찾지 못했습니다.');return row;}
export async function getOperations(){const result:OperationRow[]=[];for(let offset=0;offset<50000;offset+=1000){const r=await supabaseAdminRequest('/rest/v1/counseling_requests?data->>type=in.(aude-appointment,aude-charge,aude-expense)&select=id,created_at,data&order=created_at.desc,id.desc&limit=1000&offset='+offset);const rows=await r.json() as OperationRow[];result.push(...rows.filter(trustedOperation));if(rows.length<1000)return result;}throw new Error('운영 기록이 많아 전체를 불러오지 못했습니다. 관리자에게 문의해 주세요.');}
export async function validateOperation(type:OperationType,input:Record<string,unknown>,old?:Operation){
 if(!operationTypes.includes(type))throw new Error('기록 종류를 확인해 주세요.');
 const fields:Partial<Operation>={title:text(input.title,'항목',120,true),memo:text(input.memo??'','메모',2000)};
 if(type!=='aude-expense'){
  if(!validId(String(input.clientId)))throw new Error('내담자를 선택해 주세요.');
  if(old&&old.clientId!==input.clientId)throw new Error('등록 후 내담자를 변경할 수 없습니다. 새 기록을 만들어 주세요.');
  const r=await supabaseAdminRequest(`/rest/v1/counseling_requests?id=eq.${input.clientId}&select=data&limit=1`);const c=(await r.json())[0]?.data;if(!isConfirmedClient(c))throw new Error('접수에서 확정한 내담자만 선택할 수 있습니다.');fields.clientId=String(input.clientId);fields.clientName=String(c.clientName||c.name||'내담자');
 }
 if(type==='aude-appointment'){
  const local=text(input.startAt,'예약 시간',16,true);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)||!validDate(local.slice(0,10))||Number(local.slice(11,13))>23||Number(local.slice(14,16))>59)throw new Error('예약 날짜와 시간을 확인해 주세요.');
  const duration=amount(input.duration,true);if(duration<10||duration>480)throw new Error('일정은 10~480분으로 입력해 주세요.');
  if(!appointmentKinds.includes(input.kind as never)||!appointmentStatuses.includes(input.status as never))throw new Error('일정 종류와 상태를 확인해 주세요.');
  const keys=input.assessmentKeys===undefined?(old?.assessmentKeys||[]):input.assessmentKeys;
  if(!Array.isArray(keys)||keys.length>200||keys.some(k=>typeof k!=='string')||new Set(keys).size!==keys.length)throw new Error('해석할 검사를 확인해 주세요.');
  if(keys.length){
   if(!['개인상담','해석상담'].includes(String(input.kind)))throw new Error('개인상담 또는 해석상담 일정에 검사를 연결해 주세요.');
   const {entries}=await assessmentSources(String(input.clientId));
   if(keys.some(k=>!entries.some(e=>e.key===k&&(!e.deletedAt||old?.assessmentKeys?.includes(k)))))throw new Error('해당 내담자의 유효한 검사만 연결할 수 있습니다.');
   if(keys.some(k=>{const e=entries.find(e=>e.key===k);return e?.date&&local.slice(0,10)<e.date;}))throw new Error('해석 일정은 검사 실시일 이후로 잡아 주세요.');
   if(input.status==='완료'&&new Date(local+':00+09:00').getTime()>Date.now())throw new Error('미래의 일정은 아직 완료 처리할 수 없습니다.');
   if(['예약','완료'].includes(String(input.status))){const others=(await getOperations()).filter(r=>r.data.type==='aude-appointment'&&r.data.creationNonce!==(old?.creationNonce||input.requestId)&&r.data.clientId===input.clientId&&['예약','완료'].includes(r.data.status||''));if(keys.some(k=>others.some(r=>r.data.assessmentKeys?.includes(k))))throw new Error('이미 해석 일정에 연결된 검사가 있습니다. 기존 일정을 변경하거나 취소해 주세요.');}
  }
  fields.assessmentKeys=keys;
  const sessionNo=Number(input.sessionNo);if(!Number.isInteger(sessionNo)||sessionNo<1||sessionNo>999)throw new Error('회기 번호를 확인해 주세요.');
  if(old&&input.chargeId!==undefined&&String(input.chargeId||'')!==(old.chargeId||''))throw new Error('연결된 수납 항목은 변경할 수 없습니다. 새 일정을 등록해 주세요.');const chargeId=old?.chargeId||'';if(chargeId){const charge=await getOperation(chargeId);if(charge.data.type!=='aude-charge'||charge.data.clientId!==fields.clientId||(charge.data.archived&&old?.chargeId!==chargeId))throw new Error('같은 내담자의 유효한 결제 항목을 선택해 주세요.');}Object.assign(fields,{startAt:new Date(local+':00+09:00').toISOString(),duration,kind:input.kind,status:input.status,sessionNo,chargeId,amount:amount(input.amount,true)});
 }else{if(!validDate(input.date))throw new Error('날짜를 확인해 주세요.');fields.date=input.date;fields.amount=amount(input.amount);if(type==='aude-expense'){if(!expenseCategories.includes(input.category as never))throw new Error('지출 분류를 확인해 주세요.');fields.category=String(input.category);const account=input.account??old?.account??'unknown';if(!financeAccounts.includes(account as never))throw new Error('지출 계좌를 확인해 주세요.');fields.account=account as Operation['account'];}else if(old&&(fields.amount||0)<chargeTotals(old).received)throw new Error('받을 금액을 이미 수납한 금액보다 낮출 수 없습니다. 환불은 입출금 기록으로 남겨 주세요.');}
 return fields;
}
export function newOperation(type:OperationType,fields:Partial<Operation>,nonce:string):Operation {
 return {type,creationNonce:nonce,creationSignature:signature(type,nonce),version:0,title:'',memo:'',...fields,...(type==='aude-charge'?{payments:[]}:{}),...(type==='aude-expense'?{attachments:[]}:{})};
}
export async function insertOperation(type:OperationType,fields:Partial<Operation>,nonce:string){const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,''),key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;if(!url||!key)throw new Error('저장 연결을 확인해 주세요.');const data=newOperation(type,fields,nonce);const existing=await supabaseAdminRequest('/rest/v1/counseling_requests?data->>creationNonce=eq.'+nonce+'&select=id,created_at,data&limit=1');const found=(await existing.json())[0];if(found){if(!trustedOperation(found)||found.data.type!==type)throw new Error('저장 요청을 확인해 주세요.');return found;}
 const r=await fetch(url+'/rest/v1/counseling_requests',{method:'POST',cache:'no-store',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({id:nonce,data})});if(!r.ok&&r.status!==409){console.error('Operations insert failed',r.status);throw new Error('운영 기록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');}const read=await supabaseAdminRequest('/rest/v1/counseling_requests?data->>creationNonce=eq.'+nonce+'&select=id,created_at,data&limit=1');const row=(await read.json())[0];if(!trustedOperation(row))throw new Error('저장 결과를 확인하지 못했습니다. 같은 창에서 다시 시도해 주세요.');return row as OperationRow;
}
export async function updateOperation(row:OperationRow,data:Operation){const next={...data,version:row.data.version+1,updatedAt:new Date().toISOString()};const r=await supabaseAdminRequest(`/rest/v1/counseling_requests?id=eq.${row.id}&data->>version=eq.${row.data.version}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({data:next})});if(!(await r.json()).length)throw new Error('다른 변경사항이 저장되었습니다. 기록을 다시 열고 시도해 주세요.');return {...row,data:next};}
export function addPayment(d:Operation,input:Record<string,unknown>){if(d.type!=='aude-charge'||d.archived)throw new Error('유효한 결제 항목을 선택해 주세요.');const id=String(input.paymentId||'');if(!validId(id))throw new Error('입출금 요청을 확인해 주세요.');if(d.payments?.some(p=>p.id===id))return d;if(!validDate(input.date))throw new Error('입출금 날짜를 확인해 주세요.');const n=amount(input.amount,true);if(!['receipt','refund'].includes(String(input.direction))||!paymentMethods.includes(input.method as never)||!evidenceStatuses.includes(input.evidence as never))throw new Error('입출금 항목을 확인해 주세요.');const refundReason=input.direction==='refund'?text(input.refundReason,'환불 사유',1000,true):undefined;const t=chargeTotals(d);if(input.direction==='refund'&&n>t.net)throw new Error('환불액은 현재 보유한 수납 금액을 넘을 수 없습니다.');if(input.direction==='receipt'&&n>t.due)throw new Error('입금액은 남은 미수납 금액을 넘을 수 없습니다.');if((d.payments||[]).length>=300)throw new Error('입출금 기록이 너무 많습니다.');return {...d,payments:[...(d.payments||[]),{id,date:input.date,amount:n,direction:input.direction as 'receipt'|'refund',method:String(input.method),account:paymentAccount({method:String(input.method)}),evidence:String(input.evidence),memo:text(input.memo??'','메모',1000),...(refundReason?{refundReason}:{})}]};}

