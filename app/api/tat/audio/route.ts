import { NextResponse } from 'next/server';
import { admin,bucket,error,getSession,privateHeaders } from '../../../lib/tat';
import { supabaseAdminRequest } from '../../../lib/supabase';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(){return NextResponse.json({error:'온라인 녹음 기능은 사용하지 않습니다.'},{status:410,headers:privateHeaders});}
export async function GET(request:Request){
 if(!await admin())return NextResponse.json({error:'Unauthorized'},{status:401});
 try{const p=new URL(request.url).searchParams;const row=await getSession(p.get('id')||'');const r=row.data.recordings.find(x=>x.id===p.get('recording'));
 if(!r?.parts)throw new Error('저장된 녹음이 없습니다.');
 // Chunks form one continuous MediaRecorder container and must be concatenated in order.
 let part=0;const first=await supabaseAdminRequest(`/storage/v1/object/authenticated/${bucket}/${row.id}/${r.id}/0`);
 const stream=new ReadableStream({async pull(controller){try{const response=part===0?first:await supabaseAdminRequest(`/storage/v1/object/authenticated/${bucket}/${row.id}/${r.id}/${part}`);controller.enqueue(new Uint8Array(await response.arrayBuffer()));part++;if(part>=r.parts)controller.close();}catch(e){controller.error(e);}}});
 const extension=r.mime==='audio/mp4'?'m4a':r.mime==='audio/ogg'?'ogg':'webm';
 return new Response(stream,{headers:{...privateHeaders,'Content-Type':r.mime,...(p.get('download')==='1'?{'Content-Disposition':`attachment; filename="TAT_${r.id}.${extension}"`}:{})}});
 }catch(e){return NextResponse.json({error:error(e)},{status:400});}
}

