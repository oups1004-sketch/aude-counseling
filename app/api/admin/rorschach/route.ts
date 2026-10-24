import { NextResponse } from 'next/server';
import { trustedRecord as trusted,getRecord,mutateRecord } from '../../../lib/rorschach-room';
import { admin,sign,validId,privateHeaders,error } from '../../../lib/tat';
import { supabaseAdminRequest } from '../../../lib/supabase';
import { isConfirmedClient } from '../../../lib/client-eligibility';
import { validateDraft } from '../../../lib/rorschach-records';
import type { RorschachData,RorschachRow } from '../../../lib/rorschach-records';
export const runtime='nodejs';
async function readInput(request:Request) {
 const raw=await request.text();if(raw.length>750000)throw new Error('기록 용량이 너무 큽니다. 내용을 나누어 주세요.');return JSON.parse(raw);
}
export async function GET(request:Request) {
 if(!await admin())return NextResponse.json({error:'관리자 로그인이 필요합니다.'},{status:401,headers:privateHeaders});
 try {const id=new URL(request.url).searchParams.get('id');if(id)return NextResponse.json(await getRecord(id),{headers:privateHeaders});
 const r=await supabaseAdminRequest('/rest/v1/counseling_requests?data->>type=eq.rorschach-record&select=id,created_at,data&order=created_at.desc&limit=1000');
 return NextResponse.json((await r.json()).filter((row:RorschachRow)=>trusted(row)&&!row.data.deletedAt),{headers:privateHeaders});
 }catch(e){return NextResponse.json({error:error(e)},{status:400,headers:privateHeaders});}
}
export async function POST(request:Request) {
 if(!await admin())return NextResponse.json({error:'관리자 로그인이 필요합니다.'},{status:401,headers:privateHeaders});
 try {const i=await readInput(request);if(!validId(i.clientId))throw new Error('내담자를 선택해 주세요.');
 const r=await supabaseAdminRequest(`/rest/v1/counseling_requests?id=eq.${i.clientId}&select=data&limit=1`);const client=(await r.json())[0]?.data;
 if(!isConfirmedClient(client))throw new Error('확정된 내담자를 선택해 주세요.');
 const draft=validateDraft(i);const nonce=crypto.randomUUID();
 const data:RorschachData={...draft,type:'rorschach-record',clientId:i.clientId,clientName:String(client.clientName||client.name||'내담자'),version:0,recordsVersion:0,creationNonce:nonce,creationSignature:sign('rorschach-record:'+nonce+':'+i.clientId)};
 // Match the existing TAT server-signed INSERT path; records remain admin-only to read.
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,''),key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new Error('기록 저장 연결을 확인해 주세요.');
 const saved=await fetch(url+'/rest/v1/counseling_requests',{method:'POST',cache:'no-store',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({data})});
 if(!saved.ok)throw new Error('검사 기록을 저장하지 못했습니다.');
 const check=await supabaseAdminRequest(`/rest/v1/counseling_requests?data->>creationNonce=eq.${nonce}&select=id,created_at,data&limit=1`);const row=(await check.json())[0];
 if(!trusted(row))throw new Error('저장된 기록을 확인하지 못했습니다.');return NextResponse.json(row,{headers:privateHeaders});
 }catch(e){return NextResponse.json({error:error(e)},{status:400,headers:privateHeaders});}
}
export async function PATCH(request:Request) {
 if(!await admin())return NextResponse.json({error:'관리자 로그인이 필요합니다.'},{status:401,headers:privateHeaders});
 try {const i=await readInput(request);const snapshot=await getRecord(i.id);
 const useContentVersion=Number.isInteger(i.recordsVersion);
 const expected=useContentVersion?i.recordsVersion:i.version;
 const current=useContentVersion?(snapshot.data.recordsVersion||0):snapshot.data.version;
 if(!Number.isInteger(expected)||expected!==current)return NextResponse.json({error:'다른 창에서 기록이 변경되었습니다. 현재 내용을 내보낸 뒤 기록을 다시 열어 주세요.'},{status:409,headers:privateHeaders});
 const draft=validateDraft(i);
 try {
  const saved=await mutateRecord(i.id,d=>{
   if((useContentVersion?(d.recordsVersion||0):d.version)!==expected)throw new Error('RECORD_CONFLICT');
   return {...d,...draft,recordsVersion:(d.recordsVersion||0)+1};
  });return NextResponse.json(saved,{headers:privateHeaders});
 }catch(e){if((e as Error).message==='RECORD_CONFLICT')return NextResponse.json({error:'다른 창에서 기록이 변경되었습니다. 현재 내용을 내보낸 뒤 다시 열어 주세요.'},{status:409,headers:privateHeaders});throw e;}

 }catch(e){return NextResponse.json({error:error(e)},{status:400,headers:privateHeaders});}
}
