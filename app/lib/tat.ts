import { cookies } from 'next/headers';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { supabaseAdminRequest, verifyAdminSession } from './supabase';
export const cards = ['1','2','3BM','3GF','4','5','6BM','6GF','7BM','7GF','8BM','8GF','9BM','9GF','10','11','12M','12F','12BG','13MF','13B','13G','14','15','16','17BM','17GF','18BM','18GF','19','20'];
export type Recording = {id:string;startedAt:string;parts:number;mime:string;finished?:boolean};
export type TatSession = {type:'tat-session';creationSignature:string;creationNonce:string;version?:number;clientId:string;clientName:string;codeHash:string;expiresAt:string;endedAt?:string;order:string[];index:number;hidden:boolean;revision:number;note:string;joinedAt?:string;consentedAt?:string;view?:{card:string;scale:number;angle:number;seenAt:string};recordings:Recording[];events:{card:string;at:string;hidden:boolean}[]};
export type TatRow = {id:string;created_at:string;data:TatSession};
export const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
export const newCode=()=>randomBytes(10).toString('hex').toUpperCase();
export const validId=(s:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
export async function admin(){return verifyAdminSession((await cookies()).get('aude_admin_token')?.value);}
export function alive(d:TatSession){return !d.endedAt&&Date.parse(d.expiresAt)>Date.now();}
export async function getSession(id:string):Promise<TatRow>{
 if(!validId(id))throw new Error('검사 접속 정보를 확인해 주세요.');
 const r=await supabaseAdminRequest(`/rest/v1/counseling_requests?id=eq.${id}&select=id,created_at,data&limit=1`);
 const rows=await r.json();if(!isTrustedSession(rows[0]))throw new Error('검사 공간을 찾지 못했습니다.');return rows[0];
}
export async function mutate(id:string,fn:(d:TatSession)=>TatSession){
 for(let n=0;n<5;n++){
  const row=await getSession(id);const next={...fn(row.data),version:(row.data.version||0)+1};
  const r=await supabaseAdminRequest(`/rest/v1/counseling_requests?id=eq.${id}&data->>version=${row.data.version===undefined?'is.null':'eq.'+row.data.version}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({data:next})});
  if((await r.json()).length)return {...row,data:next};
 }throw new Error('다른 변경사항이 저장 중입니다. 다시 시도해 주세요.');
}
function secret(){const s=process.env.ADMIN_PASSWORD;if(!s)throw new Error('접속 설정을 확인해 주세요.');return s;}
export function sign(payload:string){return createHmac('sha256',secret()).update(payload).digest('hex');}
export function ticket(row:TatRow){const p=Buffer.from(JSON.stringify({id:row.id,exp:Date.parse(row.data.expiresAt),hash:row.data.codeHash})).toString('base64url');return p+'.'+sign(p);}
export async function participant(row:TatRow){
 const t=(await cookies()).get('aude_tat_'+row.id)?.value;if(!t)return false;
 try{const [p,s]=t.split('.');if(!s||s.length!==64||!timingSafeEqual(Buffer.from(s),Buffer.from(sign(p))))return false;
 const v=JSON.parse(Buffer.from(p,'base64url').toString());return v.id===row.id&&v.exp>Date.now()&&v.hash===row.data.codeHash;
 }catch{return false;}
}
export function publicState(row:TatRow){const d=row.data;return {id:row.id,active:alive(d),card:alive(d)&&!d.hidden?d.order[d.index]:null,revision:d.revision,recordingConsent:!!d.consentedAt};}
export const bucket='aude-tat-audio-private';
export async function ensureAudioBucket(){
 const r=await supabaseAdminRequest('/storage/v1/bucket');const b=(await r.json()).find((x:{id:string})=>x.id===bucket);
 if(b){if(b.public)throw new Error('녹음 저장소의 비공개 설정을 확인해 주세요.');return;}
 try{await supabaseAdminRequest('/storage/v1/bucket',{method:'POST',body:JSON.stringify({id:bucket,name:bucket,public:false,file_size_limit:2097152,allowed_mime_types:['audio/webm','audio/mp4','audio/ogg']})});}
 catch(e){const check=await supabaseAdminRequest('/storage/v1/bucket');if(!(await check.json()).some((x:{id:string;public:boolean})=>x.id===bucket&&!x.public))throw e;}
}
export function error(e:unknown){return e instanceof Error&&!e.message.startsWith('Supabase')?e.message:'저장소 연결을 확인해 주세요. 잠시 후 다시 시도해 주세요.';}
export const privateHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};

export function isTrustedSession(row: TatRow | undefined) {
 if(!row || row.data?.type!=='tat-session' || !validId(row.id) || !validId(row.data.clientId) || !validId(row.data.creationNonce)) return false;
 const signature=row.data.creationSignature;
 const expected=sign('tat-room:'+row.data.creationNonce+':'+row.data.clientId);
 return typeof signature==='string' && signature.length===expected.length && timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
}
export async function insertSession(id:string,data:TatSession) {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,'');
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new Error('검사 공간 저장 연결이 설정되어 있지 않습니다.');
 // The live database permits public INSERT, but does not grant INSERT to its service role.
 // The server signature prevents forged public inserts from becoming usable test rooms.
 const response=await fetch(url+'/rest/v1/counseling_requests',{method:'POST',cache:'no-store',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({data})});
 if(!response.ok){console.error('TAT session insert failed',response.status,await response.text());throw new Error('검사 공간을 새로 저장하지 못했습니다. DB 등록 권한을 확인해 주세요.');}
 const result=await supabaseAdminRequest('/rest/v1/counseling_requests?data->>creationNonce=eq.'+id+'&select=id,created_at,data&limit=1');
 const row=(await result.json())[0] as TatRow | undefined;
 if(!isTrustedSession(row))throw new Error('저장된 검사 공간을 확인하지 못했습니다.');
 return row!;
}
