'use client';
import { useEffect,useState } from 'react';
import { rorschachCards,recordsCsv } from '../../lib/rorschach-records';
import type { RorschachDraft,RorschachResponse,RorschachRow } from '../../lib/rorschach-records';
import './rorschach-records.css';
type Client={id:string;name:string;clientCode:string};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
const blank=():RorschachDraft=>({examDate:today(),responses:[],summary:''});
async function api(method='GET',body?:unknown,id?:string) {
 const r=await fetch('/api/admin/rorschach'+(id?'?id='+encodeURIComponent(id):''),{method,cache:'no-store',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
 const d=await r.json();if(!r.ok)throw new Error(d.error||'기록을 불러오지 못했습니다.');return d;
}
export default function RorschachRecords({clients,initialClientId,onDirty}:{clients:Client[];initialClientId:string;onDirty:(dirty:boolean)=>void}) {
 const [rows,setRows]=useState<RorschachRow[]>([]),[row,setRow]=useState<RorschachRow|null>(null);
 const [clientId,setClientId]=useState(initialClientId),[draft,setDraft]=useState<RorschachDraft>(blank);
 const [baseline,setBaseline]=useState(()=>JSON.stringify(blank())),[editing,setEditing]=useState(false);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [card,setCard]=useState<string>('I');
 const dirty=editing&&JSON.stringify(draft)!==baseline;
 useEffect(()=>{onDirty(dirty);},[dirty,onDirty]);
 useEffect(()=>{api().then(setRows).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 function canLeave(){return !busy&&(!dirty||confirm('저장하지 않은 로르샤흐 기록을 버릴까요?'));}
 function start(){if(!canLeave())return;const d=blank();setDraft(d);setBaseline(JSON.stringify(d));setRow(null);setEditing(true);setCard('I');setError('');setNotice('');}
 async function open(id:string){if(!canLeave())return;setBusy(true);setError('');try{const saved:RorschachRow=await api('GET',undefined,id);const d={examDate:saved.data.examDate,responses:saved.data.responses,summary:saved.data.summary};setRow(saved);setClientId(saved.data.clientId);setDraft(d);setBaseline(JSON.stringify(d));setEditing(true);setCard('I');setNotice('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function add(){if(draft.responses.length>=300)return;const response:RorschachResponse={id:crypto.randomUUID(),card,response:'',inquiry:'',location:'',orientation:'미기록',observation:'',coding:''};setDraft(d=>({...d,responses:[...d.responses,response]}));}
 function update(id:string,key:keyof RorschachResponse,value:string){setDraft(d=>({...d,responses:d.responses.map(r=>r.id===id?{...r,[key]:value}:r)}));setNotice('');}
 async function save(){setBusy(true);setError('');setNotice('');try{const saved:RorschachRow=await api(row?'PATCH':'POST',{...draft,...(row?{id:row.id,version:row.data.version}:{clientId})});setRow(saved);setBaseline(JSON.stringify(draft));setRows(rs=>[saved,...rs.filter(r=>r.id!==saved.id)]);setNotice('기록을 저장했습니다.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function download(){const url=URL.createObjectURL(new Blob([recordsCsv(draft)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`AUDE-Rorschach-${draft.examDate}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <section className="rorWorkspace" aria-label="로르샤흐 기록">
 <div className="tatRow"><h2>로르샤흐 기록</h2>{!editing?<button className="tatPrimary" disabled={busy||loading} onClick={start}>새 검사 기록</button>:<button disabled={busy} onClick={()=>{if(canLeave()){setEditing(false);setRow(null);onDirty(false);}}}>기록 목록</button>}</div>
 <p className="rorIntro">도판 없이 반응과 질문단계 내용을 기록합니다. 도판 제시 기능은 추후 연결됩니다.</p>
 {error&&<p className="tatError" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {loading?<p>기록을 불러오는 중…</p>:editing?<>
 <fieldset disabled={busy} className="rorFields"><legend className="rorSrOnly">검사 기록 편집</legend>
 <div className="rorMeta"><label>내담자<select value={clientId} disabled={!!row} onChange={e=>setClientId(e.target.value)}><option value="">내담자를 선택해 주세요</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name} · {c.clientCode}</option>)}{row&&!clients.some(c=>c.id===clientId)&&<option value={clientId}>{row.data.clientName}</option>}</select></label><label>검사일<input type="date" value={draft.examDate} onChange={e=>setDraft(d=>({...d,examDate:e.target.value}))}/></label></div>
 <div className="rorCards" aria-label="도판별 기록">{rorschachCards.map(c=><button type="button" key={c} aria-pressed={card===c} className={card===c?'active':''} onClick={()=>setCard(c)}>{c}<small>{draft.responses.filter(r=>r.card===c).length}</small></button>)}</div>
 <div className="tatRow"><h3>도판 {card}</h3><button disabled={draft.responses.length>=300} onClick={add}>＋ 반응 추가</button></div>
 {!draft.responses.some(r=>r.card===card)&&<p className="rorEmpty">‘반응 추가’를 눌러 이 도판의 반응을 기록해 주세요.</p>}
 {draft.responses.filter(r=>r.card===card).map((r,n)=><article className="rorResponse" key={r.id}><div className="tatRow"><strong>반응 {n+1}</strong><button onClick={()=>{if(confirm('이 반응을 삭제할까요? 저장하면 삭제가 반영됩니다.'))setDraft(d=>({...d,responses:d.responses.filter(v=>v.id!==r.id)}));}}>반응 삭제</button></div><div className="rorGrid">
 <label>반응 원문<textarea rows={4} maxLength={12000} value={r.response} onChange={e=>update(r.id,'response',e.target.value)}/></label>
 <label>질문단계 기록<textarea rows={4} maxLength={12000} value={r.inquiry} onChange={e=>update(r.id,'inquiry',e.target.value)}/></label>
 <label>반응 위치<input maxLength={2000} value={r.location} onChange={e=>update(r.id,'location',e.target.value)}/></label>
 <label>도판 방향<select value={r.orientation} onChange={e=>update(r.id,'orientation',e.target.value)}><option value="미기록">미기록</option><option value="0">정방향 · 0°</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label>
 <label>행동관찰<textarea rows={2} maxLength={6000} value={r.observation} onChange={e=>update(r.id,'observation',e.target.value)}/></label>
 <label>채점 메모<textarea rows={2} maxLength={4000} value={r.coding} onChange={e=>update(r.id,'coding',e.target.value)}/></label>
 </div></article>)}
 <label className="rorSummary">종합 메모<textarea rows={4} maxLength={30000} value={draft.summary} onChange={e=>setDraft(d=>({...d,summary:e.target.value}))}/></label>
 </fieldset><div className="rorSave"><span role="status">{dirty?'저장하지 않은 변경사항이 있습니다.':row?'저장된 기록입니다.':'새 검사 기록입니다.'}</span><button disabled={busy} onClick={download}>엑셀용 CSV 내보내기</button><button className="tatPrimary" disabled={busy||!clientId||!draft.examDate||(!dirty&&!!row)} onClick={save}>{busy?'저장 중…':'기록 저장'}</button></div>
 </>:<div className="tatSessionList">{rows.length===0?<p className="rorEmpty">저장된 로르샤흐 기록이 없습니다.</p>:rows.map(r=><button key={r.id} disabled={busy} onClick={()=>open(r.id)}><b>{r.data.clientName} · 로르샤흐</b><span>{r.data.examDate} · 반응 {r.data.responses.length}개</span></button>)}</div>}
 </section>;
}
