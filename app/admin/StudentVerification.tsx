'use client';
import { useEffect, useRef, useState } from 'react';
import type { StudentVerification as Verification } from '../lib/student-verification';
export default function StudentVerification({clientId,value,onSaved,onDirty,onBusy}:{clientId:string;value:Verification|null;onSaved:(v:Verification|null)=>void;onDirty:(v:boolean)=>void;onBusy:(v:boolean)=>void}) {
  const [kind,setKind]=useState(value?.kind || '대학생');
  const [file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const input=useRef<HTMLInputElement>(null);
  const dirty=!!file || (!!value && kind!==value.kind);
  useEffect(()=>{onDirty(dirty);},[dirty,onDirty]);
  useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  async function save(revoke=false) {
    if(busy)return;
    if(revoke&&!confirm('학생 인증을 해제하고 첨부서류를 삭제할까요? 기존 상담 금액은 유지됩니다.'))return;
    setBusy(true);onBusy(true);setError('');setNotice('');
    try {
      const f=new FormData();f.set('clientId',clientId);f.set('updatedAt',value?.updatedAt||'');f.set('kind',kind);if(file)f.set('file',file);if(revoke)f.set('action','revoke');
      const r=await fetch('/api/admin/student-verification',{method:'POST',body:f}),d=await r.json();if(!r.ok)throw new Error(d.error);
      onSaved(d.verification);setKind(d.verification?.kind||'대학생');setFile(null);if(input.current)input.current.value='';setNotice(revoke?'인증을 해제했습니다.':'학생 인증을 등록했습니다.');
    } catch(e){setError((e as Error).message);}finally{setBusy(false);onBusy(false);}
  }
  return <section className="studentVerification"><div className="studentHeading"><h3>대학생/대학원생 인증</h3>{value&&<span className="studentBadge">{value.kind}</span>}</div><p>구분을 선택하고 증빙서류를 저장하면 인증이 등록됩니다. 새 개인상담 예약의 기본 요금은 80,000원이며, 예약 시 수정할 수 있습니다.</p>{value&&<div className="studentDocument"><a href={'/api/admin/student-verification?clientId='+clientId}>{value.file.name} ↓</a><small>등록일 {new Date(value.registeredAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}</small></div>}<fieldset disabled={busy}><div className="clientEditGrid"><label>학생 구분<select value={kind} onChange={e=>setKind(e.target.value as Verification['kind'])}><option>대학생</option><option>대학원생</option></select></label><label>{value?'증빙서류 교체':'증빙서류 첨부'}<input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>{setError('');setNotice('');const f=e.target.files?.[0]||null;if(f&&f.size>3145728){setError('서류는 3MB 이하로 첨부해 주세요.');e.target.value='';setFile(null);}else setFile(f);}}/></label></div><small>재학증명서·학생증 등 · PDF/JPG/PNG/WebP, 최대 3MB · 관리자만 열람</small><div className="studentActions"><button type="button" className="workspacePrimary" disabled={!file} onClick={()=>void save()}>{busy?'저장 중…':value?'서류 교체·저장':'인증 등록'}</button>{dirty&&<button type="button" onClick={()=>{setFile(null);setKind(value?.kind||'대학생');if(input.current)input.current.value='';}}>취소</button>}{value&&<button type="button" onClick={()=>void save(true)}>인증 해제</button>}</div></fieldset>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}</section>;
}
