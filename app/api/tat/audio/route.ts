import { NextResponse } from 'next/server';
import { admin,alive,bucket,ensureAudioBucket,error,getSession,mutate,participant,privateHeaders,validId } from '../../../lib/tat';
import { supabaseAdminRequest } from '../../../lib/supabase';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){try{
 const p=new URL(request.url).searchParams;const id=p.get('id')||'';const row=await getSession(id);
 if(!await participant(row))return NextResponse.json({error:'접속이 만료되었습니다.'},{status:401});
 if(!row.data.consentedAt)throw new Error('녹음 동의가 필요합니다.');
 if(row.data.endedAt&&Date.now()-Date.parse(row.data.endedAt)>1800000)throw new Error('녹음 저장 시간이 만료되었습니다.');
 const action=p.get('action');
 if(action==='start'){
 if(!alive(row.data))throw new Error('종료된 검사입니다.');await ensureAudioBucket();
 const i=await request.json();const mime=String(i.mime||'').split(';')[0];if(!['audio/webm','audio/mp4','audio/ogg'].includes(mime))throw new Error('지원하지 않는 녹음 형식입니다.');
 const recording={id:crypto.randomUUID(),startedAt:new Date().toISOString(),parts:0,mime};
 await mutate(id,d=>{if(!alive(d)||!d.consentedAt||d.codeHash!==row.data.codeHash)throw new Error('검사 접속이 변경되었습니다.');if(d.recordings.length>=20)throw new Error('녹음은 검사별 최대 20개까지 저장할 수 있습니다.');return {...d,recordings:[...d.recordings,recording]};});return NextResponse.json(recording);
 }
 const rid=p.get('recording')||'';if(!validId(rid))throw new Error('녹음 정보를 확인해 주세요.');
 const recording=row.data.recordings.find(x=>x.id===rid);if(!recording)throw new Error('녹음 정보를 찾지 못했습니다.');
 if(action==='finish'){
 const i=await request.json();if(recording.parts!==Number(i.parts))throw new Error('일부 녹음이 저장되지 않았습니다. 다시 저장해 주세요.');
 await mutate(id,d=>({...d,recordings:d.recordings.map(x=>x.id===rid?{...x,finished:true}:x)}));return NextResponse.json({ok:true});
 }
 if(action!=='chunk'||recording.finished)throw new Error('잘못된 녹음 요청입니다.');
 const part=Number(p.get('part'));if(!Number.isInteger(part)||part<0||part>=720||part>recording.parts)throw new Error('녹음 순서를 확인해 주세요.');
 if(Number(request.headers.get('content-length')||0)>2097152)throw new Error('녹음 조각이 너무 큽니다.');
 const bytes=new Uint8Array(await request.arrayBuffer());if(!bytes.length||bytes.length>2097152)throw new Error('녹음 조각의 크기를 확인해 주세요.');
 await supabaseAdminRequest(`/storage/v1/object/${bucket}/${id}/${rid}/${part}`,{method:'POST',headers:{'Content-Type':recording.mime,'x-upsert':'true'},body:bytes});
 await mutate(id,d=>({...d,recordings:d.recordings.map(x=>x.id===rid?{...x,parts:Math.max(x.parts,part+1)}:x)}));return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:error(e)},{status:400});}}
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
