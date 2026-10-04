import { NextResponse } from 'next/server';
import { supabaseAdminRequest } from '../../../lib/supabase';
import { admin,alive,cards,digest,error,getSession,mutate,newCode,privateHeaders,validId,TatSession,bucket,insertSession,sign,isTrustedSession } from '../../../lib/tat';
import { isConfirmedClient } from '../../../lib/client-eligibility';
import { applyRecordChanges } from '../../../lib/tat-records';
export const runtime='nodejs';
export async function GET(request:Request){
 if(!await admin())return NextResponse.json({error:'관리자 로그인이 필요합니다.'},{status:401});
 try{const id=new URL(request.url).searchParams.get('id');if(id){const row=await getSession(id);return NextResponse.json({...row,active:alive(row.data)},{headers:privateHeaders});}
 const r=await supabaseAdminRequest('/rest/v1/counseling_requests?data->>type=eq.tat-session&select=id,created_at,data&order=created_at.desc&limit=100');
 return NextResponse.json((await r.json()).filter(isTrustedSession),{headers:privateHeaders});}catch(e){return NextResponse.json({error:error(e)},{status:400});}
}
export async function POST(request:Request){
 if(!await admin())return NextResponse.json({error:'관리자 로그인이 필요합니다.'},{status:401});
 try{const input=await request.json();if(!validId(input.clientId))throw new Error('내담자를 선택해 주세요.');
 const r=await supabaseAdminRequest(`/rest/v1/counseling_requests?id=eq.${input.clientId}&select=data&limit=1`);const c=(await r.json())[0]?.data;
 if(!isConfirmedClient(c))throw new Error('등록된 내담자를 선택해 주세요.');
 const order=Array.isArray(input.order)?input.order.filter((v:unknown)=>typeof v==='string'&&cards.includes(v)):[];
 if(!order.length||order.length>31||new Set(order).size!==order.length)throw new Error('사용할 도판을 선택해 주세요.');
 const id=crypto.randomUUID();const code=newCode();const data:TatSession={type:'tat-session',creationNonce:id,creationSignature:sign('tat-room:'+id+':'+input.clientId),clientId:input.clientId,clientName:String(c.clientName||c.name||'내담자'),codeHash:digest(code),expiresAt:new Date(Date.now()+24*3600000).toISOString(),order,index:0,hidden:true,revision:0,note:'',recordings:[],events:[]};
 const saved=await insertSession(id,data);
 return NextResponse.json({...saved,code},{headers:privateHeaders});}catch(e){return NextResponse.json({error:error(e)},{status:400});}
}
export async function PATCH(request:Request){
 if(!await admin())return NextResponse.json({error:'관리자 로그인이 필요합니다.'},{status:401});
 try{const i=await request.json();let code:string|undefined;
 const row=await mutate(i.id,d=>{
 if(i.action==='records'){
  const next=i.changes?.length?applyRecordChanges(d.cardRecords||{},d.order,i.changes):d.cardRecords||{};
  if(i.summary!==undefined){if(typeof i.summary!=='string'||i.summary.length>30000)throw new Error('종합 해석은 30,000자 이내로 입력해 주세요.');if(typeof i.expectedSummary!=='string'||(d.summary||'')!==i.expectedSummary)throw new Error('종합 해석이 다른 창에서 변경되었습니다. 내용을 복사한 뒤 다시 열어 주세요.');}
  if(!i.changes?.length&&i.summary===undefined)throw new Error('저장할 기록이 없습니다.');
  return {...d,cardRecords:next,...(i.summary!==undefined?{summary:i.summary}:{})};
 }
 if(i.action==='note')return {...d,note:String(i.note||'').slice(0,12000)};
 if(i.action==='renew'){code=newCode();return {...d,hidden:true,revision:d.revision+1,joinedAt:undefined,consentedAt:undefined,view:undefined,codeHash:digest(code),expiresAt:new Date(Date.now()+24*3600000).toISOString(),endedAt:undefined};}
 if(!alive(d))throw new Error('종료되거나 만료된 검사입니다.');
 if(i.action==='end')return {...d,endedAt:new Date().toISOString(),hidden:true,revision:d.revision+1};
 if(i.action!=='present')throw new Error('잘못된 요청입니다.');
 const index=Number(i.index);if(!Number.isInteger(index)||index<0||index>=d.order.length)throw new Error('도판 순서를 확인해 주세요.');
 const hidden=!!i.hidden;return {...d,index,hidden,revision:d.revision+1,events:[...d.events,{card:d.order[index],at:new Date().toISOString(),hidden}].slice(-500)};
 });return NextResponse.json({...row,active:alive(row.data),code},{headers:privateHeaders});}catch(e){return NextResponse.json({error:error(e)},{status:400});}
}
export async function DELETE(request:Request){
 if(!await admin())return NextResponse.json({error:'Unauthorized'},{status:401});
 try{const id=new URL(request.url).searchParams.get('id')||'';const row=await getSession(id);if(alive(row.data))throw new Error('검사를 먼저 종료해 주세요.');
 for(const r of row.data.recordings){const prefixes=Array.from({length:r.parts},(_,n)=>`${id}/${r.id}/${n}`);if(prefixes.length)await supabaseAdminRequest(`/storage/v1/object/${bucket}`,{method:'DELETE',body:JSON.stringify({prefixes})});}
 await supabaseAdminRequest(`/rest/v1/counseling_requests?id=eq.${id}`,{method:'DELETE'});return NextResponse.json({ok:true});}catch(e){return NextResponse.json({error:error(e)},{status:400});}
}

