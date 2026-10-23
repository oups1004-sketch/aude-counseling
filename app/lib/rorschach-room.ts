import { cookies } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';
import { sign, validId } from './tat';
import { supabaseAdminRequest } from './supabase';
import { rorschachCards } from './rorschach-records';
import type { RorschachData, RorschachRow, RorschachRoom, RorschachPoint } from './rorschach-records';
export function trustedRecord(row:RorschachRow|undefined):row is RorschachRow {
 if(!row||row.data?.type!=='rorschach-record'||!validId(row.id)||!validId(row.data.clientId)||!validId(row.data.creationNonce))return false;
 const signature=row.data.creationSignature,expected=sign('rorschach-record:'+row.data.creationNonce+':'+row.data.clientId);
 return typeof signature==='string'&&/^[a-f0-9]{64}$/.test(signature)&&timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
}
export async function getRecord(id:string):Promise<RorschachRow> {
 if(!validId(id))throw new Error('기록 번호를 확인해 주세요.');
 const r=await supabaseAdminRequest(`/rest/v1/counseling_requests?id=eq.${id}&select=id,created_at,data&limit=1`);
 const row=(await r.json())[0];if(!trustedRecord(row))throw new Error('검사 기록을 찾지 못했습니다.');return row;
}
export async function mutateRecord(id:string,change:(data:RorschachData)=>RorschachData) {
 for(let n=0;n<8;n++) {
  const row=await getRecord(id);const data={...change(row.data),version:row.data.version+1};
  const r=await supabaseAdminRequest(`/rest/v1/counseling_requests?id=eq.${row.id}&data->>version=eq.${row.data.version}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({data})});
  if((await r.json()).length)return {...row,data};
 }
 throw new Error('저장 중인 변경사항이 있습니다. 잠시 후 다시 시도해 주세요.');
}
export function roomAlive(room:RorschachRoom|undefined):room is RorschachRoom {return !!room&&!room.endedAt&&Date.parse(room.expiresAt)>Date.now();}
export function roomTicket(row:RorschachRow) {
 const p=Buffer.from(JSON.stringify({id:row.id,hash:row.data.room!.codeHash,exp:Date.parse(row.data.room!.expiresAt)})).toString('base64url');return p+'.'+sign('rorschach:'+p);
}
export async function roomParticipant(row:RorschachRow) {
 const value=(await cookies()).get('aude_rorschach_'+row.id)?.value;if(!value||!row.data.room)return false;
 try{const [p,s]=value.split('.');if(!s||!/^[a-f0-9]{64}$/.test(s)||!timingSafeEqual(Buffer.from(s),Buffer.from(sign('rorschach:'+p))))return false;
 const t=JSON.parse(Buffer.from(p,'base64url').toString());return t.id===row.id&&t.hash===row.data.room.codeHash&&t.exp>Date.now();}catch{return false;}
}
export function publicRoom(row:RorschachRow) {
 const room=row.data.room;const active=roomAlive(room);const card=active&&!room.hidden?room.card:null;
 const response=card&&room?.stage==='inquiry'?row.data.responses.find(r=>r.id===room.activeResponseId&&r.card===card):undefined;
 return {active,card,stage:room?.stage||'response',revision:room?.revision||0,markTarget:response?.id||null,marks:response?room!.marks[response.id]||[]:[]};
}
export function validCard(card:unknown):card is string {return typeof card==='string'&&rorschachCards.includes(card as typeof rorschachCards[number]);}
export function validatePoints(input:unknown):RorschachPoint[] {
 if(!Array.isArray(input)||input.length<1||input.length>200)throw new Error('위치 표시를 확인해 주세요.');
 return input.map(p=>{if(!p||typeof p.x!=='number'||typeof p.y!=='number'||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)throw new Error('위치 표시 좌표를 확인해 주세요.');return {x:p.x,y:p.y};});
}
