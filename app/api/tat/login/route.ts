import { NextResponse } from 'next/server';
import { alive,digest,error,getSession,mutate,privateHeaders,ticket } from '../../../lib/tat';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const i=await request.json();const row=await getSession(String(i.id||''));
 const code=String(i.code||'').replace(/[\s-]/g,'').toUpperCase();
 if(!alive(row.data)||code.length!==20||digest(code)!==row.data.codeHash)return NextResponse.json({error:'코드가 맞지 않거나 종료된 검사입니다.'},{status:401});
 const joined=await mutate(row.id,d=>{if(!alive(d)||d.codeHash!==row.data.codeHash)throw new Error('접속 코드가 변경되었습니다. 새 코드로 접속해 주세요.');return {...d,joinedAt:new Date().toISOString()};});
 const r=NextResponse.json({ok:true},{headers:privateHeaders});r.cookies.set('aude_tat_'+row.id,ticket(joined),{httpOnly:true,secure:true,sameSite:'strict',path:'/api/tat',maxAge:Math.max(0,Math.floor((Date.parse(row.data.expiresAt)-Date.now())/1000))});return r;
 }catch(e){return NextResponse.json({error:error(e)},{status:400});}}
