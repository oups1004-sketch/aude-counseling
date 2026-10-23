import { NextResponse } from 'next/server';
import { error,privateHeaders } from '../../../lib/tat';
import { getRecord,mutateRecord,roomAlive,roomParticipant,publicRoom,validatePoints } from '../../../lib/rorschach-room';
export const runtime='nodejs';
export async function GET(request:Request){try{const row=await getRecord(new URL(request.url).searchParams.get('id')||'');if(!await roomParticipant(row))return NextResponse.json({error:'접속 코드를 입력해 주세요.'},{status:401,headers:privateHeaders});return NextResponse.json(publicRoom(row),{headers:privateHeaders});}catch(e){return NextResponse.json({error:error(e)},{status:400,headers:privateHeaders});}}
export async function POST(request:Request){try{
 const raw=await request.text();if(raw.length>30000)throw new Error('요청이 너무 큽니다.');const i=JSON.parse(raw);const row=await getRecord(i.id);
 if(!await roomParticipant(row))return NextResponse.json({error:'접속 코드를 입력해 주세요.'},{status:401,headers:privateHeaders});
 const codeHash=row.data.room!.codeHash;
 await mutateRecord(row.id,d=>{
  const room=d.room;if(!roomAlive(room)||room.codeHash!==codeHash||room.hidden||room.card!==i.card||room.revision!==i.revision)throw new Error('도판이나 단계가 변경되었습니다. 다시 확인해 주세요.');
  if(i.action==='view'){
   if(![0,90,180,270].includes(i.angle)||!Number.isFinite(i.scale)||i.scale<.5||i.scale>4)throw new Error('도판 방향을 확인해 주세요.');
   return {...d,room:{...room,view:{card:i.card,angle:i.angle,scale:i.scale,at:new Date().toISOString()}}};
  }
  if(i.action!=='mark'||room.stage!=='inquiry'||i.responseId!==room.activeResponseId||!d.responses.some(r=>r.id===i.responseId&&r.card===room.card))throw new Error('상담자가 위치를 기록할 반응을 선택한 뒤 표시해 주세요.');
  const marks=room.marks[i.responseId]||[];if(marks.length>=100)throw new Error('위치 표시가 너무 많습니다. 상담자에게 정리를 요청해 주세요.');
  return {...d,room:{...room,marks:{...room.marks,[i.responseId]:[...marks,{id:crypto.randomUUID(),points:validatePoints(i.points)}]}}};
 });return NextResponse.json({ok:true},{headers:privateHeaders});
 }catch(e){return NextResponse.json({error:error(e)},{status:400,headers:privateHeaders});}}
