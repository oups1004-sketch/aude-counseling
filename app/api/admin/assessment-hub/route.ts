import { NextResponse } from 'next/server';
import { admin,error,privateHeaders,validId } from '../../../lib/tat';
import { assessmentSources,stockMovements,insertStock,patchClientSnapshot } from '../../../lib/assessment-hub';
import { linkInterpretation,stockSummary } from '../../../lib/assessment-hub-model';
import { getOperations } from '../../../lib/operations';
import { text,validDate } from '../../../lib/operations-model';
import { supabaseAdminRequest } from '../../../lib/supabase';
export const runtime='nodejs';
export async function GET(request:Request){
 if(!await admin())return NextResponse.json({error:'관리자 로그인이 필요합니다.'},{status:401,headers:privateHeaders});
 try{const clientId=new URL(request.url).searchParams.get('clientId')||undefined;
 const [sources,operations,movements]=await Promise.all([assessmentSources(clientId),getOperations(),stockMovements()]);
 const all=clientId?await assessmentSources():sources;
 return NextResponse.json({entries:sources.entries.map(e=>linkInterpretation(e,operations)),stock:stockSummary(movements,all.entries)},{headers:privateHeaders});
 }catch(e){return NextResponse.json({error:error(e)},{status:400,headers:privateHeaders});}
}
export async function POST(request:Request){
 if(!await admin())return NextResponse.json({error:'관리자 로그인이 필요합니다.'},{status:401,headers:privateHeaders});
 try{const i=await request.json();if(!validId(i.requestId)||!validId(i.itemId)||!validDate(i.date)||!['purchase','adjustment'].includes(i.kind)||!Number.isSafeInteger(i.quantity)||Math.abs(i.quantity)>100000||i.quantity===0||(i.kind==='purchase'&&i.quantity<0))throw new Error('재고 수량과 날짜를 확인해 주세요.');
 const movements=await stockMovements();const existing=movements.find(m=>m.itemId===i.itemId);
 const name=existing?.name||text(i.name,'검사명',100,true),format=existing?.format||text(i.format,'검사지 종류',40,true);
 if(i.kind==='adjustment'&&!existing)throw new Error('등록된 검사지를 선택해 주세요.');
 const note=text(i.note||'','메모',1000,i.kind==='adjustment');
 await insertStock({id:i.requestId,itemId:i.itemId,name,format,date:i.date,quantity:i.quantity,kind:i.kind,note});return NextResponse.json({ok:true},{headers:privateHeaders});
 }catch(e){return NextResponse.json({error:error(e)},{status:400,headers:privateHeaders});}
}
export async function PATCH(request:Request){
 if(!await admin())return NextResponse.json({error:'관리자 로그인이 필요합니다.'},{status:401,headers:privateHeaders});
 try{const i=await request.json();if(!['metadata','trash','restore'].includes(i.action))throw new Error('요청을 확인해 주세요.');
 const {clients,entries,projectives}=await assessmentSources(i.clientId);const c=clients.find(c=>c.id===i.clientId),entry=entries.find(e=>e.key===i.key);if(!c||!entry)throw new Error('검사 기록을 찾지 못했습니다.');
 const now=new Date().toISOString();
 if(i.action==='metadata'){
  if(entry.source==='slot')throw new Error('검사 슬롯에서 수정해 주세요.');
  if(entry.deletedAt)throw new Error('먼저 검사 기록을 복원해 주세요.');
  if((entry.updatedAt||'')!==(i.updatedAt||''))throw new Error('검사 정보가 변경되었습니다. 다시 열어 주세요.');
  if((i.date&&!validDate(i.date))||(i.interpretationDate&&!validDate(i.interpretationDate)))throw new Error('날짜를 확인해 주세요.');
  if(i.date&&i.interpretationDate&&i.interpretationDate<i.date)throw new Error('해석일은 실시일보다 빠를 수 없습니다.');
  const row=projectives.find(r=>r.id===entry.id)!;const d=row.data;
  const data={...d,examDate:i.date||'',interpretationDate:i.interpretationDate||'',version:(d.version||0)+1,...(entry.source==='rorschach'?{recordsVersion:(d.recordsVersion||0)+1}:{})};
  const saved=await supabaseAdminRequest('/rest/v1/counseling_requests?id=eq.'+row.id+'&data->>version='+(d.version===undefined?'is.null':'eq.'+d.version),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({data})});if(!(await saved.json()).length)throw new Error('검사 내용이 변경되었습니다. 다시 시도해 주세요.');
 }else if(entry.source==='slot'){
  await patchClientSnapshot(c,{...c.data,assessments:c.data.assessments.map((r:any)=>r.id===entry.id?{...r,deletedAt:i.action==='trash'?now:undefined,updatedAt:now}:r)});
 }else{
  const row=projectives.find(r=>r.id===entry.id)!;const d=row.data;
  const data={...d,deletedAt:i.action==='trash'?now:undefined,version:(d.version||0)+1};
  if(i.action==='trash'){if(entry.source==='tat')Object.assign(data,{endedAt:now,hidden:true,revision:(d.revision||0)+1});else if(d.room)Object.assign(data,{room:{...d.room,endedAt:now,hidden:true,revision:(d.room.revision||0)+1}});}
  const saved=await supabaseAdminRequest('/rest/v1/counseling_requests?id=eq.'+row.id+'&data->>version='+(d.version===undefined?'is.null':'eq.'+d.version),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({data})});if(!(await saved.json()).length)throw new Error('검사 내용이 변경되었습니다. 다시 시도해 주세요.');
 }
 return NextResponse.json({ok:true},{headers:privateHeaders});
 }catch(e){return NextResponse.json({error:error(e)},{status:400,headers:privateHeaders});}
}
