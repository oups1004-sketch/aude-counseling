import { sign,validId } from './tat';
import { supabaseAdminRequest } from './supabase';
import { assessmentRows,patchClientSnapshot } from './assessment-hub';
type FileRemoval={bucket:string;path:string;signature?:string};
const stamp=(clientId:string,f:FileRemoval)=>({...f,signature:sign('aude-assessment-cleanup:'+clientId+':'+f.bucket+':'+f.path)});
export function assessmentFiles(source:string,clientId:string,id:string,data:Record<string,any>):FileRemoval[]{
 if(source==='slot')return [data.resultFile,data.summaryFile].filter(f=>f?.path?.startsWith(clientId+'/'+id+'/')).map(f=>stamp(clientId,{bucket:'aude-assessment-private',path:f.path}));
 if(source==='tat')return (data.recordings||[]).filter((r:any)=>validId(r.id)&&Number.isSafeInteger(r.parts)&&r.parts>=0&&r.parts<=10000).flatMap((r:any)=>Array.from({length:r.parts},(_,i)=>stamp(clientId,{bucket:'aude-tat-audio-private',path:`${id}/${r.id}/${i}`})));
 return [];
}
// Failed storage deletions are retried on the next administrator assessment load.
// Only opaque file paths remain in this queue, never the removed test content.
export async function cleanupAssessmentFiles(clientId:string){
 const rows=await assessmentRows('id=eq.'+clientId);const row=rows[0];if(!row)return;
 const queue:FileRemoval[]=(row.data.assessmentFileCleanup||[]).filter((f:FileRemoval)=>typeof f.path==='string'&&f.signature===stamp(clientId,f).signature);if(!queue.length)return;
 const done=new Set<string>();
 for(const bucket of ['aude-assessment-private','aude-tat-audio-private']){
  const files=queue.filter(f=>f.bucket===bucket);for(let i=0;i<files.length;i+=100){const batch=files.slice(i,i+100);try{await supabaseAdminRequest('/storage/v1/object/'+bucket,{method:'DELETE',body:JSON.stringify({prefixes:batch.map(f=>f.path)})});batch.forEach(f=>done.add(f.bucket+':'+f.path));}catch{/* retry on next load */}}
 }
 if(!done.size)return;
 const latest=(await assessmentRows('id=eq.'+clientId))[0];if(!latest)return;
 await patchClientSnapshot(latest,{...latest.data,assessmentFileCleanup:(latest.data.assessmentFileCleanup||[]).filter((f:FileRemoval)=>!done.has(f.bucket+':'+f.path))}).catch(()=>undefined);
}
