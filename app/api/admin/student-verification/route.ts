import { NextResponse } from 'next/server';
import { admin, privateHeaders, validId } from '../../../lib/tat';
import { supabaseAdminRequest } from '../../../lib/supabase';
import { isConfirmedClient } from '../../../lib/client-eligibility';
import { studentVerification, type StudentVerification } from '../../../lib/student-verification';
export const runtime = 'nodejs';
const bucket = 'aude-student-private';
async function client(id: string) {
  if (!validId(id)) throw new Error('내담자 번호를 확인해 주세요.');
  const r = await supabaseAdminRequest(`/rest/v1/counseling_requests?id=eq.${id}&select=data&limit=1`);
  const data = (await r.json())[0]?.data;
  if (!isConfirmedClient(data)) throw new Error('내담자를 찾지 못했습니다.');
  return data as Record<string, unknown>;
}
async function ensureBucket() {
  const check = async () => (await (await supabaseAdminRequest('/storage/v1/bucket')).json()).find((b: {id:string}) => b.id === bucket);
  let b = await check();
  if (!b) {
    try { await supabaseAdminRequest('/storage/v1/bucket', {method:'POST', body:JSON.stringify({id:bucket,name:bucket,public:false,file_size_limit:3145728,allowed_mime_types:['application/pdf','image/jpeg','image/png','image/webp']})}); }
    catch (e) { b = await check(); if (!b) throw e; }
  }
  if (b?.public) throw new Error('인증서류 저장소의 비공개 설정을 확인해 주세요.');
}
async function remove(path: string) {
  await supabaseAdminRequest(`/storage/v1/object/${bucket}`, {method:'DELETE',body:JSON.stringify({prefixes:[path]})}).catch(() => undefined);
}
export async function GET(request: Request) {
  if (!await admin()) return NextResponse.json({error:'Unauthorized'}, {status:401});
  try {
    const id = new URL(request.url).searchParams.get('clientId') || '';
    const v = studentVerification((await client(id)).studentVerification);
    if (!v) return NextResponse.json({error:'등록된 인증서류가 없습니다.'},{status:404,headers:privateHeaders});
    const r = await supabaseAdminRequest(`/storage/v1/object/authenticated/${bucket}/${id}/${v.file.id}`);
    return new Response(r.body,{headers:{...privateHeaders,'Content-Type':v.file.mime,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(v.file.name),'X-Content-Type-Options':'nosniff'}});
  } catch { return NextResponse.json({error:'인증서류를 불러오지 못했습니다.'},{status:400,headers:privateHeaders}); }
}
export async function POST(request: Request) {
  if (!await admin()) return NextResponse.json({error:'Unauthorized'},{status:401});
  let uploaded = '';
  try {
    if (Number(request.headers.get('content-length') || 0) > 3500000) throw new Error('서류는 3MB 이하로 첨부해 주세요.');
    const f = await request.formData(), id = String(f.get('clientId') || ''), data = await client(id);
    const old = studentVerification(data.studentVerification);
    if (String(f.get('updatedAt') || '') !== (old?.updatedAt || '')) throw new Error('인증 정보가 변경되었습니다. 새로고침 후 다시 확인해 주세요.');
    let verification: StudentVerification | null = null;
    if (f.get('action') !== 'revoke') {
      const kind = String(f.get('kind'));
      if (kind !== '대학생' && kind !== '대학원생') throw new Error('대학생 또는 대학원생을 선택해 주세요.');
      const file = f.get('file');
      if (!(file instanceof File) || !file.size || file.size > 3145728) throw new Error('서류를 3MB 이하로 첨부해 주세요.');
      const bytes = new Uint8Array(await file.arrayBuffer()), b = Buffer.from(bytes);
      const mime = b.subarray(0,5).toString() === '%PDF-' ? 'application/pdf' : b[0]===255&&b[1]===216&&b[2]===255 ? 'image/jpeg' : b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP' ? 'image/webp' : '';
      if (!mime) throw new Error('PDF·JPG·PNG·WebP 파일을 첨부해 주세요.');
      await ensureBucket();
      const fileId = crypto.randomUUID(); uploaded = `${id}/${fileId}`;
      await supabaseAdminRequest(`/storage/v1/object/${bucket}/${uploaded}`,{method:'POST',headers:{'Content-Type':mime},body:bytes});
      verification = {kind, registeredAt:old?.registeredAt || new Date().toISOString(),updatedAt:new Date().toISOString(),file:{id:fileId,name:file.name.slice(0,160),mime,size:file.size}};
    }
    const r = await supabaseAdminRequest(`/rest/v1/counseling_requests?id=eq.${id}&data=eq.${encodeURIComponent(JSON.stringify(data))}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({data:{...data,studentVerification:verification}})});
    if (!(await r.json()).length) throw new Error('다른 변경사항이 저장되었습니다. 새로고침 후 다시 저장해 주세요.');
    uploaded = '';
    if (old) await remove(`${id}/${old.file.id}`);
    return NextResponse.json({verification},{headers:privateHeaders});
  } catch(e) {
    if (uploaded) await remove(uploaded);
    return NextResponse.json({error:e instanceof Error&&!e.message.startsWith('Supabase')?e.message:'인증을 저장하지 못했습니다. 다시 시도해 주세요.'},{status:400,headers:privateHeaders});
  }
}
