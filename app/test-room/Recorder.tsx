'use client';
import { useEffect,useRef,useState } from 'react';
type Backup={id:string;session:string;mime:string;startedAt:string};
async function db(){return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('aude-tat-audio-backup',1);r.onupgradeneeded=()=>{r.result.createObjectStore('meta',{keyPath:'id'});r.result.createObjectStore('chunks',{keyPath:'key'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function write(store:string,value:unknown){const d=await db();await new Promise<void>((resolve,reject)=>{const t=d.transaction(store,'readwrite');t.objectStore(store).put(value);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});d.close();}
async function all(store:string){const d=await db();const result=await new Promise<any[]>((resolve,reject)=>{const r=d.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});d.close();return result;}
async function clearBackup(id:string){const chunks=await all('chunks');const d=await db();await new Promise<void>((resolve,reject)=>{const t=d.transaction(['meta','chunks'],'readwrite');t.objectStore('meta').delete(id);chunks.filter(x=>x.id===id).forEach(x=>t.objectStore('chunks').delete(x.key));t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});d.close();}
function download(blob:Blob,name:string){const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),60000);}
export default function Recorder({id,active}:{id:string;active:boolean}){
 const [consentOpen,setConsentOpen]=useState(false);const [consent,setConsent]=useState(false);const [status,setStatus]=useState('idle');const [message,setMessage]=useState('');const [seconds,setSeconds]=useState(0);const [backups,setBackups]=useState<Backup[]>([]);const [fallback,setFallback]=useState<Blob|null>(null);const recorder=useRef<MediaRecorder|null>(null);const mounted=useRef(true);
 async function refresh(){try{const list=(await all('meta')).filter((x:Backup)=>x.session===id);if(mounted.current)setBackups(list);}catch{/* Recording remains available without local database. */}}
 useEffect(()=>{mounted.current=true;void refresh();return()=>{mounted.current=false;recorder.current?.state==='recording'&&recorder.current.stop();};},[id]);
 useEffect(()=>{if(!active&&recorder.current?.state==='recording')recorder.current.stop();},[active]);
 useEffect(()=>{if(status!=='recording')return;const start=Date.now();const timer=setInterval(()=>{const elapsed=Math.floor((Date.now()-start)/1000);setSeconds(elapsed);if(elapsed>=3600)recorder.current?.stop();},1000);const protect=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',protect);return()=>{clearInterval(timer);window.removeEventListener('beforeunload',protect);};},[status]);
 useEffect(()=>{if(status!=='saving')return;const protect=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);},[status]);
 async function request(url:string,body:BodyInit,contentType:string){const r=await fetch(url,{method:'POST',headers:{'Content-Type':contentType},body});if(!r.ok)throw new Error((await r.json()).error||'녹음 저장에 실패했습니다.');return r.json();}
 async function start(){if(!consent||!active||status==='starting'||status==='saving')return;setStatus('starting');setMessage('');setFallback(null);let stream:MediaStream|undefined;
 try{if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('이 브라우저는 녹음을 지원하지 않습니다. PC의 최신 Chrome 또는 Edge에서 접속해 주세요.');
 stream=await navigator.mediaDevices.getUserMedia({audio:true});
 const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(x=>MediaRecorder.isTypeSupported(x));if(!mime)throw new Error('지원하는 녹음 형식이 없습니다.');
 await request('/api/tat/state',JSON.stringify({id,consent:true}),'application/json');
 const meta:Backup=await request(`/api/tat/audio?id=${id}&action=start`,JSON.stringify({mime}),'application/json');meta.session=id;
 const chunks:Blob[]=[];let uploaded=0;let queue=Promise.resolve();let storageFailed=false;let localFailed=false;
 try{await write('meta',meta);}catch{localFailed=true;setMessage('이 기기의 임시 저장을 사용할 수 없습니다. 녹음 완료 전 창을 닫지 마세요.');}
 const upload=async(n:number)=>{await request(`/api/tat/audio?id=${id}&recording=${meta.id}&action=chunk&part=${n}`,chunks[n],meta.mime);uploaded=n+1;};
 const record=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:64000});recorder.current=record;
 record.ondataavailable=e=>{if(!e.data.size)return;const n=chunks.length;chunks.push(e.data);
 queue=queue.then(async()=>{if(!localFailed){try{await write('chunks',{key:meta.id+':'+n,id:meta.id,n,blob:e.data});}catch{localFailed=true;if(mounted.current)setMessage('이 기기의 임시 저장에 실패했습니다. 완료 전 창을 닫지 마세요.');}}
 if(storageFailed)return;
 for(let attempt=0;attempt<3;attempt++){try{await upload(n);return;}catch{if(attempt<2)await new Promise(r=>setTimeout(r,1000));}}
 storageFailed=true;if(mounted.current)setMessage('서버 연결이 불안정합니다. 녹음은 계속하며, 중지할 때 다시 저장합니다.');
 });};
 record.onerror=()=>{if(mounted.current)setMessage('마이크 녹음 오류가 발생했습니다. 저장된 부분을 확인해 주세요.');if(record.state!=='inactive')record.stop();};
 record.onstop=async()=>{stream?.getTracks().forEach(t=>t.stop());if(mounted.current)setStatus('saving');await queue;
 try{for(let n=uploaded;n<chunks.length;n++)await upload(n);await request(`/api/tat/audio?id=${id}&recording=${meta.id}&action=finish`,JSON.stringify({parts:chunks.length}),'application/json');await clearBackup(meta.id).catch(()=>undefined);if(mounted.current){setStatus('idle');setMessage('녹음을 저장했습니다.');setConsentOpen(false);setConsent(false);}}
 catch(e){if(mounted.current){setStatus('idle');setMessage((e as Error).message+' · 임시 녹음을 내려받아 보관해 주세요.');setFallback(new Blob(chunks,{type:meta.mime}));}}
 recorder.current=null;void refresh();};
 record.start(10000);setSeconds(0);setStatus('recording');setConsentOpen(false);
 }catch(e){stream?.getTracks().forEach(t=>t.stop());setStatus('idle');setMessage((e as Error).message);}}
 return <div>
 <div className="tatRecordingBar">{status==='recording'?<><span className="isRecording">● 녹음 중 · {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span><button onClick={()=>recorder.current?.stop()}>녹음 중지·저장</button></>:status==='saving'||status==='starting'?<span>{status==='saving'?'녹음 저장 중… 창을 닫지 마세요.':'마이크 연결 중…'}</span>:active&&<button onClick={()=>setConsentOpen(x=>!x)}>응답 녹음 시작</button>}
 {message&&<span className="tatRecorderNotice" role="status">{message}</span>}{fallback&&<button onClick={()=>download(fallback,'TAT_임시녹음.'+(fallback.type==='audio/mp4'?'m4a':'webm'))}>임시 녹음 내려받기</button>}</div>
 {consentOpen&&active&&<div className="tatConsent"><p>응답을 정확하게 기록하고 해석하기 위해 이 기기의 마이크 음성을 녹음합니다. 녹음은 아우데 심리상담센터의 비공개 저장소에 보관되며 담당 상담자만 확인합니다. 담당 상담자가 삭제할 때까지 보관되므로 보관 기간과 삭제 요청은 상담자와 확인해 주세요. 줌의 상대방 음성은 직접 녹음되지 않습니다.</p><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>녹음 목적과 보관 안내를 확인했으며, 응답 녹음에 동의합니다.</span></label><button className="tatPrimary" disabled={!consent||status!=='idle'} onClick={start}>동의하고 녹음 시작</button><p style={{marginTop:12,marginBottom:0}}>녹음은 언제든 중지할 수 있습니다. 한 번의 녹음은 최대 60분입니다.</p></div>}
 {backups.length>0&&status==='idle'&&<div className="tatConsent"><b>이 기기에 남아 있는 임시 녹음</b><p>저장이 중단됐을 수 있습니다. 내려받아 상담자에게 전달해 주세요.</p>{backups.map(b=><div key={b.id} className="tatRow"><small>{new Date(b.startedAt).toLocaleString('ko-KR')}</small><button onClick={async()=>{try{const chunks=(await all('chunks')).filter(x=>x.id===b.id).sort((a,b)=>a.n-b.n);if(!chunks.length)throw new Error('저장된 음성이 없습니다.');download(new Blob(chunks.map(x=>x.blob),{type:b.mime}),'TAT_복구녹음.'+(b.mime==='audio/mp4'?'m4a':'webm'));}catch(e){setMessage((e as Error).message);}}}>내려받기</button><button onClick={async()=>{if(confirm('이 기기의 임시 녹음을 삭제할까요?')){await clearBackup(b.id);void refresh();}}}>기기에서 삭제</button></div>)}</div>}
 </div>;
}
