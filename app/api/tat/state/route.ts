import { NextResponse } from 'next/server';
import { alive,cards,error,getSession,mutate,participant,privateHeaders,publicState } from '../../../lib/tat';
export const runtime='nodejs';
export async function GET(request:Request){try{const row=await getSession(new URL(request.url).searchParams.get('id')||'');if(!await participant(row))return NextResponse.json({error:'접속 코드를 입력해 주세요.'},{status:401});return NextResponse.json(publicState(row),{headers:privateHeaders});}catch(e){return NextResponse.json({error:error(e)},{status:400});}}
export async function POST(request:Request){try{const i=await request.json();const row=await getSession(i.id);if(!await participant(row))return NextResponse.json({error:'Unauthorized'},{status:401});if(!alive(row.data))throw new Error('검사가 종료되었습니다.');
 await mutate(row.id,d=>{if(!alive(d))throw new Error('검사가 종료되었습니다.');
 if(i.consent===true)throw new Error('온라인 녹음 기능은 사용하지 않습니다.');
 if(!cards.includes(i.card)||i.card!==d.order[d.index]||d.hidden)throw new Error('도판이 변경되었습니다.');
 return {...d,view:{card:i.card,scale:Math.min(4,Math.max(.5,Number(i.scale)||1)),angle:((Number(i.angle)||0)%360+360)%360,seenAt:new Date().toISOString()}};});return NextResponse.json({ok:true});}catch(e){return NextResponse.json({error:error(e)},{status:400});}}

