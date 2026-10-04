'use client';
import { useState } from 'react';
import { tatCards } from '../../lib/tat-cards';
export default function TatAssetUpload({available,onUpdated}:{available:string[];onUpdated:(cards:string[])=>void}){
 const [progress,setProgress]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function upload(file:File){setBusy(true);setError('');setProgress('ZIP을 확인하고 있습니다…');try{
 if(file.size>40000000)throw new Error('ZIP 파일은 40MB 이하여야 합니다.');
 const {unzipSync}=await import('fflate');let total=0;const unpacked=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:item=>{total+=item.originalSize;if(total>60000000||item.originalSize>3670016)throw new Error('ZIP 안의 파일 크기를 확인해 주세요.');return /\.(png|jpe?g)$/i.test(item.name);}});
 const items=Object.entries(unpacked).map(([name,bytes])=>({card:name.split('/').pop()?.match(/^\d+_([^\.]+)\.(png|jpe?g)$/i)?.[1],bytes})).filter(x=>x.card&&tatCards.includes(x.card));
 if(!items.length)throw new Error('01_1.png, 07_6BM.png처럼 도판 번호가 포함된 정렬 ZIP을 선택해 주세요.');
 if(new Set(items.map(x=>x.card)).size!==items.length)throw new Error('ZIP에 중복된 도판 번호가 있습니다.');
 for(let n=0;n<items.length;n++){setProgress(`도판 등록 중 · ${n+1}/${items.length}`);const r=await fetch('/api/admin/tat-assets?card='+items[n].card,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:new Uint8Array(items[n].bytes)});if(!r.ok)throw new Error((await r.json()).error||'도판 등록에 실패했습니다.');}
 setProgress(`${items.length}장 등록 완료`);
 }catch(e){setError((e as Error).message);}finally{try{const r=await fetch('/api/admin/tat-assets',{cache:'no-store'});if(r.ok)onUpdated(await r.json());}catch{/* Keep upload error visible. */}setBusy(false);}}
 return <div className="tatPanel" style={{marginBottom:24}}><div className="tatRow"><h2>도판 보관함</h2><span>{available.length}/31장 등록</span></div><p>처음 한 번, 정렬된 도판 ZIP을 등록해 주세요. 이미지는 관리자와 해당 검사에 접속한 내담자만 볼 수 있습니다.</p><label className="tatLabel">TAT 도판 ZIP<input type="file" accept=".zip,application/zip" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value='';}}/></label>{progress&&<p role="status">{progress}</p>}{error&&<p className="tatError" role="alert">{error} ZIP을 다시 선택하면 이어서 등록할 수 있습니다.</p>}</div>;
}
