import { NextResponse } from 'next/server';
import { admin,digest,newCode,privateHeaders,error } from '../../../../lib/tat';
import { getRecord,mutateRecord,roomAlive,validCard,validatePoints } from '../../../../lib/rorschach-room';
export const runtime='nodejs';
export async function GET(request:Request){
 if(!await admin())return NextResponse.json({error:'관리자 로그인이 필요합니다.'},{status:401,headers:privateHeaders});
 try{const row=await getRecord(new URL(request.url).searchParams.get('id')||'');return NextResponse.json({room:row.data.room||null,version:row.data.version},{headers:privateHeaders});}catch(e){return NextResponse.json({error:error(e)},{status:400,headers:privateHeaders});}
}
export async function PATCH(request:Request){
 if(!await admin())return NextResponse.json({error:'관리자 로그인이 필요합니다.'},{status:401,headers:privateHeaders});
 try{const raw=await request.text();if(raw.length>30000)throw new Error('요청이 너무 큽니다.');const i=JSON.parse(raw);let code:string|undefined;
 const row=await mutateRecord(i.id,d=>{
  const old=d.room;
  if(i.action==='create'||i.action==='renew'){
   if(i.action==='create'&&roomAlive(old))throw new Error('이미 진행 가능한 검사실이 있습니다.');
   code=newCode();return {...d,room:{codeHash:digest(code),expiresAt:new Date(Date.now()+86400000).toISOString(),stage:old?.stage||'response',card:old?.card||'I',hidden:true,revision:(old?.revision||0)+1,marks:old?.marks||{}}};
  }
  if(!old)throw new Error('검사실을 먼저 만들어 주세요.');
  if(i.action==='undoMark'){
   const target=d.responses.find(r=>r.id===i.responseId);if(!target)throw new Error('반응을 선택해 주세요.');
   return {...d,room:{...old,marks:{...old.marks,[target.id]:(old.marks[target.id]||[]).slice(0,-1)}}};
  }
  if(!roomAlive(old))throw new Error('종료되거나 만료된 검사실입니다.');
  if(i.action==='end')return {...d,room:{...old,hidden:true,endedAt:new Date().toISOString(),revision:old.revision+1}};
  if(i.action==='present'){
   if(!validCard(i.card)||typeof i.hidden!=='boolean')throw new Error('도판을 확인해 주세요.');
   return {...d,room:{...old,card:i.card,hidden:i.hidden,activeResponseId:undefined,view:undefined,revision:old.revision+1}};
  }
  if(i.action==='stage'){
   if(!['response','inquiry'].includes(i.stage))throw new Error('검사 단계를 확인해 주세요.');
   return {...d,room:{...old,stage:i.stage,hidden:true,activeResponseId:undefined,view:undefined,revision:old.revision+1}};
  }
  if(i.action==='target'){
   const response=d.responses.find(r=>r.id===i.responseId&&r.card===old.card);if(!response||old.stage!=='inquiry')throw new Error('제시 중인 도판의 반응을 선택해 주세요.');
   return {...d,room:{...old,activeResponseId:response.id,revision:old.revision+1}};
  }
  if(i.action==='mark'){
   const response=d.responses.find(r=>r.id===i.responseId&&r.card===old.card);if(!response||old.stage!=='inquiry')throw new Error('제시 중인 도판의 반응을 선택해 주세요.');
   const marks=old.marks[response.id]||[];if(marks.length>=100)throw new Error('반응당 위치 표시는 100개 이내로 저장해 주세요.');
   return {...d,room:{...old,marks:{...old.marks,[response.id]:[...marks,{id:crypto.randomUUID(),points:validatePoints(i.points)}]}}};
  }
  throw new Error('잘못된 요청입니다.');
 });return NextResponse.json({room:row.data.room,version:row.data.version,code},{headers:privateHeaders});
 }catch(e){return NextResponse.json({error:error(e)},{status:400,headers:privateHeaders});}
}
