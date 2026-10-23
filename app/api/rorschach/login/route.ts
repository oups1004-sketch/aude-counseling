import { NextResponse } from 'next/server';
import { digest,privateHeaders,error } from '../../../lib/tat';
import { getRecord,mutateRecord,roomAlive,roomTicket } from '../../../lib/rorschach-room';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const raw=await request.text();if(raw.length>2000)throw new Error('접속 정보를 확인해 주세요.');const i=JSON.parse(raw);const row=await getRecord(String(i.id||''));
 const code=String(i.code||'').replace(/[\s-]/g,'').toUpperCase();const room=row.data.room;
 if(!roomAlive(room)||code.length!==20||digest(code)!==room.codeHash)return NextResponse.json({error:'코드가 맞지 않거나 종료된 검사입니다.'},{status:401,headers:privateHeaders});
 const joined=await mutateRecord(row.id,d=>{if(!roomAlive(d.room)||d.room.codeHash!==room.codeHash)throw new Error('접속 코드가 변경되었습니다.');return {...d,room:{...d.room,joinedAt:new Date().toISOString()}};});
 const r=NextResponse.json({ok:true},{headers:privateHeaders});r.cookies.set('aude_rorschach_'+row.id,roomTicket(joined),{httpOnly:true,secure:true,sameSite:'strict',path:'/api/rorschach',maxAge:Math.max(0,Math.floor((Date.parse(room.expiresAt)-Date.now())/1000))});return r;
 }catch(e){return NextResponse.json({error:error(e)},{status:400,headers:privateHeaders});}}
