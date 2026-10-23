'use client';
import { useState } from 'react';
import { rorschachCards } from '../../lib/rorschach-records';
export default function RorschachAssetUpload({available,onUpdated,onBusy}:{available:string[];onUpdated:(cards:string[])=>void;onBusy:(busy:boolean)=>void}){
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState('');
 async function upload(file:File){setBusy(true);onBusy(true);setError('');setProgress('도판 ZIP을 확인하고 있습니다…');try{
  if(file.size>20000000)throw new Error('ZIP은 20MB 이하여야 합니다.');
  const {unzipSync}=await import('fflate');let total=0;
  const unpacked=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:item=>{total+=item.originalSize;if(total>40000000||item.originalSize>3670016)throw new Error('ZIP 안의 파일 용량을 확인해 주세요.');return /\/card-\d{2}\.png$/i.test('/'+item.name);}});
  const items=Object.entries(unpacked).map(([name,bytes])=>({number:Number(name.split('/').pop()?.match(/^card-(\d{2})\.png$/i)?.[1]),bytes})).filter(x=>x.number>=1&&x.number<=10);
  if(items.length!==10||new Set(items.map(x=>x.number)).size!==10)throw new Error('card-01.png부터 card-10.png까지 10장이 든 ZIP을 선택해 주세요.');
  for(const [n,item] of Array.from(items.sort((a,b)=>a.number-b.number).entries())){
   setProgress(`도판 등록 중 · ${n+1}/10`);const r=await fetch('/api/admin/rorschach-assets?card='+rorschachCards[item.number-1],{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:new Uint8Array(item.bytes)});if(!r.ok)throw new Error((await r.json()).error||'도판 등록에 실패했습니다.');
  }setProgress('도판 10장을 등록했습니다.');
 }catch(e){setError((e as Error).message);}finally{try{const r=await fetch('/api/admin/rorschach-assets',{cache:'no-store'});if(r.ok)onUpdated(await r.json());}catch{/* Keep the original error. */}setBusy(false);onBusy(false);}}
 return <details className="tatPanel rorAssetPanel" open={available.length!==10||busy}><summary>로르샤흐 도판 보관함 · {available.length}/10장</summary><p>처음 한 번 카드 ZIP을 등록해 주세요. 도판은 비공개로 보관하며 해당 검사에 접속한 내담자에게 제시됩니다.</p><label className="tatLabel">로르샤흐 카드 ZIP<input type="file" accept=".zip,application/zip" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file&&(!available.length||confirm('등록된 도판을 이 ZIP의 이미지로 교체할까요?')))void upload(file);e.target.value='';}}/></label>{progress&&<p role="status">{progress}</p>}{error&&<p className="tatError" role="alert">{error} 같은 ZIP을 다시 선택하면 재등록할 수 있습니다.</p>}</details>;
}
