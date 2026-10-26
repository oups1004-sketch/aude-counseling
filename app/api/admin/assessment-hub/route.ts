import { assessmentFiles,cleanupAssessmentFiles } from '../../../lib/assessment-deletion';
import { NextResponse } from 'next/server';
import { admin,error,privateHeaders,validId } from '../../../lib/tat';
import { assessmentSources,stockMovements,insertStock } from '../../../lib/assessment-hub';
import { linkInterpretation,stockSummary } from '../../../lib/assessment-hub-model';
import { getOperations } from '../../../lib/operations';
import { text,validDate } from '../../../lib/operations-model';
import { supabaseAdminRequest } from '../../../lib/supabase';
export const runtime='nodejs';
export async function GET(request:Request){
 if(!await admin())return NextResponse.json({error:'관리자 로그인이 필요합니다.'},{status:401,headers:privateHeaders});
 try{const clientId=new URL(request.url).searchParams.get('clientId')||undefined;
 const [sources,operations,movements]=await Promise.all([assessmentSources(clientId),getOperations(),stockMovements()]);
 await Promise.all(sources.clients.filter(c=>c.data.assessmentFileCleanup?.length).map(c=>cleanupAssessmentFiles(c.id)));
 const all=clientId?await assessmentSources():sources;
 return NextResponse.json({entries:sources.entries.map(e=>linkInterpretation(e,operations)),stock:stockSummary(movements,all.entries,all.usage)},{headers:privateHeaders});
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
 try{const i=await request.json();if(!['metadata','delete'].includes(i.action)||!validId(i.clientId)||typeof i.key!=='string'||! /^(slot|tat|rorschach):[a-f0-9-]{36}$/i.test(i.key))throw new Error('요청을 확인해 주세요.');
 const {clients,entries,projectives}=await assessmentSources(i.clientId);const c=clients.find(c=>c.id===i.clientId),entry=entries.find(e=>e.key===i.key);if(!c)throw new Error('내담자를 찾지 못했습니다.');if(!entry&&i.action==='delete'){if((await assessmentSources()).entries.some(e=>e.key===i.key))throw new Error('해당 내담자의 검사가 아닙니다.');await cleanupAssessmentFiles(c.id);return NextResponse.json({ok:true},{headers:privateHeaders});}if(!entry)throw new Error('검사 기록을 찾지 못했습니다.');
 if(i.action==='metadata'){
  if(entry.source==='slot')throw new Error('검사 슬롯에서 수정해 주세요.');
  if(entry.deletedAt)throw new Error('삭제된 검사 기록입니다.');
  if((entry.updatedAt||'')!==(i.updatedAt||''))throw new Error('검사 정보가 변경되었습니다. 다시 열어 주세요.');
  if((i.date&&!validDate(i.date))||(i.interpretationDate&&!validDate(i.interpretationDate)))throw new Error('날짜를 확인해 주세요.');
  if(i.date&&i.interpretationDate&&i.interpretationDate<i.date)throw new Error('해석일은 실시일보다 빠를 수 없습니다.');
  const row=projectives.find(r=>r.id===entry.id)!;const d=row.data;
  const data={...d,examDate:i.date||'',interpretationDate:i.interpretationDate||'',version:(d.version||0)+1,...(entry.source==='rorschach'?{recordsVersion:(d.recordsVersion||0)+1}:{})};
  const saved=await supabaseAdminRequest('/rest/v1/counseling_requests?id=eq.'+row.id+'&data->>version='+(d.version===undefined?'is.null':'eq.'+d.version),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({data})});if(!(await saved.json()).length)throw new Error('검사 내용이 변경되었습니다. 다시 시도해 주세요.');
 }else{
  const record=entry.source==='slot'?c.data.assessments.find((r:any)=>r.id===entry.id):projectives.find(r=>r.id===entry.id)!.data;
  await supabaseAdminRequest('/rest/v1/rpc/delete_aude_assessment',{method:'POST',body:JSON.stringify({target_client:c.id,target_key:entry.key,expected_record:record,cleanup_files:assessmentFiles(entry.source,c.id,entry.id,record)})});
  await cleanupAssessmentFiles(c.id);
 }
 return NextResponse.json({ok:true},{headers:privateHeaders});
 }catch(e){return NextResponse.json({error:error(e)},{status:400,headers:privateHeaders});}
}
