'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { rorschachCards,recordsCsv,responseQuestions } from '../../lib/rorschach-records';
import type { RorschachDraft,RorschachResponse,RorschachRow,RorschachRoom,RorschachPoint } from '../../lib/rorschach-records';
import RorschachAssetUpload from './RorschachAssetUpload';
import type { DrawingCommand } from '../../rorschach-room/RorschachViewport';
import RorschachViewport from '../../rorschach-room/RorschachViewport';
import '../../rorschach-room/rorschach.css';
import './rorschach-records.css';
type Client={id:string;name:string;clientCode:string};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
const blank=():RorschachDraft=>({examDate:today(),responses:[],summary:''});
const draftOf=(row:RorschachRow):RorschachDraft=>({examDate:row.data.examDate,responses:row.data.responses,summary:row.data.summary});
async function api(method='GET',body?:unknown,id?:string,room=false) {
 const r=await fetch('/api/admin/rorschach'+(room?'/room':'')+(id?'?id='+encodeURIComponent(id):''),{method,cache:'no-store',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
 const d=await r.json();if(!r.ok)throw new Error(d.error||'요청을 처리하지 못했습니다.');return d;
}
export default function RorschachRecords({clients,initialClientId,onDirty}:{clients:Client[];initialClientId:string;onDirty:(dirty:boolean)=>void}) {
 const [rows,setRows]=useState<RorschachRow[]>([]),[row,setRow]=useState<RorschachRow|null>(null),[room,setRoom]=useState<RorschachRoom|null>(null);
 const [clientId,setClientId]=useState(initialClientId),[draft,setDraft]=useState<RorschachDraft>(blank),[baseline,setBaseline]=useState(()=>JSON.stringify(blank())),[editing,setEditing]=useState(false);
 const [busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[saveError,setSaveError]=useState(''),[notice,setNotice]=useState(''),[code,setCode]=useState(''),[connected,setConnected]=useState(true),[now,setNow]=useState(Date.now());
 const [available,setAvailable]=useState<string[]>([]),[uploading,setUploading]=useState(false);
 const [card,setCard]=useState<string>('I'),[selected,setSelected]=useState('');
 const rowRef=useRef(row),draftRef=useRef(draft),baselineRef=useRef(baseline),savingRef=useRef<Promise<RorschachRow>|null>(null),roomVersion=useRef(-1),mounted=useRef(true);
 rowRef.current=row;draftRef.current=draft;baselineRef.current=baseline;
 const dirty=editing&&JSON.stringify(draft)!==baseline;
 const active=!!room&&!room.endedAt&&Date.parse(room.expiresAt)>now;
 const currentResponse=draft.responses.find(r=>r.id===selected&&r.card===card);
 const presented=room?.card;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{onDirty(dirty);},[dirty,onDirty]);
 useEffect(()=>{Promise.all([api(),fetch('/api/admin/rorschach-assets',{cache:'no-store'}).then(async r=>{const result=await r.json();if(!r.ok)throw new Error(result.error);return result;})]).then(([records,assets])=>{setRows(records);setAvailable(assets);const target=new URLSearchParams(location.search).get('record');if(target)void open(target);}).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
 useEffect(()=>{if(!dirty&&!saving)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty,saving]);
 const acceptRoom=useCallback((result:{room:RorschachRoom|null;version:number})=>{if(result.version>=roomVersion.current){roomVersion.current=result.version;setRoom(result.room);}},[]);
 useEffect(()=>{if(!row?.id)return;let stopped=false;let timer:ReturnType<typeof setTimeout>;const id=row.id;async function poll(){try{const result=await api('GET',undefined,id,true);if(!stopped){acceptRoom(result);setConnected(true);}}catch{if(!stopped)setConnected(false);}if(!stopped)timer=setTimeout(poll,1500);}void poll();return()=>{stopped=true;clearTimeout(timer);};},[row?.id,acceptRoom]);
 const save=useCallback(async():Promise<RorschachRow>=>{
  if(savingRef.current)return savingRef.current;
  const snapshot=draftRef.current,old=rowRef.current;
  if(old&&JSON.stringify(snapshot)===baselineRef.current)return old;
  if(!clientId)throw new Error('내담자를 선택해 주세요.');
  setSaving(true);setSaveError('');
  const promise=(async()=>{try{
   const saved:RorschachRow=await api(old?'PATCH':'POST',{...snapshot,...(old?{id:old.id,recordsVersion:old.data.recordsVersion||0}:{clientId})});
   rowRef.current=saved;baselineRef.current=JSON.stringify(snapshot);
   if(mounted.current){setRow(saved);setBaseline(JSON.stringify(snapshot));setRows(rs=>[saved,...rs.filter(r=>r.id!==saved.id)]);}
   return saved;
  }catch(e){if(mounted.current)setSaveError((e as Error).message);throw e;}finally{savingRef.current=null;if(mounted.current)setSaving(false);}})();
  savingRef.current=promise;return promise;
 },[clientId]);
 async function flush(){let saved=await save();for(let n=0;n<4&&JSON.stringify(draftRef.current)!==baselineRef.current;n++)saved=await save();if(JSON.stringify(draftRef.current)!==baselineRef.current)throw new Error('입력 중인 내용을 저장한 뒤 다시 시도해 주세요.');return saved;}
 useEffect(()=>{if(!row||!dirty||saveError||busy)return;const t=setTimeout(()=>{void save().catch(()=>undefined);},1200);return()=>clearTimeout(t);},[row?.id,draft,dirty,saveError,busy,saving,save]);
 function canLeave(){return !busy&&!saving&&(!dirty||confirm('저장하지 않은 로르샤흐 기록을 버릴까요?'));}
 function start(){if(!canLeave())return;const d=blank();setDraft(d);setBaseline(JSON.stringify(d));setRow(null);setRoom(null);setCode('');roomVersion.current=-1;setEditing(true);setCard('I');setSelected('');setError('');setSaveError('');setNotice('');}
 async function open(id:string){if(!canLeave())return;setBusy(true);setError('');try{const saved:RorschachRow=await api('GET',undefined,id);setRow(saved);setRoom(saved.data.room||null);roomVersion.current=saved.data.version;setClientId(saved.data.clientId);const d=draftOf(saved);setDraft(d);setBaseline(JSON.stringify(d));setEditing(true);setCard('I');setSelected('');setCode('');setSaveError('');setNotice('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function add(){if(draft.responses.length>=300)return;const orientation=room?.card===card&&room.view?.card===card?String(room.view.angle):'미기록';const response:RorschachResponse={id:crypto.randomUUID(),card,questions:Array.from({length:3},()=>({question:'',answer:''})),note:'',response:'',inquiry:'',location:'',orientation,observation:'',coding:''};setDraft(d=>({...d,responses:[...d.responses,response]}));setSelected(response.id);setSaveError('');}
 function update(id:string,key:keyof RorschachResponse,value:string){setDraft(d=>({...d,responses:d.responses.map(r=>r.id===id?{...r,[key]:value}:r)}));setNotice('');}
 async function act(action:string,extra:object={},needsSave=false){if(busy)return;setBusy(true);setError('');try{const saved=needsSave||!rowRef.current?await flush():rowRef.current!;const result=await api('PATCH',{id:saved.id,action,...extra},undefined,true);acceptRoom(result);if(result.code)setCode(result.code);if(action==='end')setNotice('검사를 종료했습니다. 기록은 계속 보완할 수 있습니다.');return result;}catch(e){setError((e as Error).message);throw e;}finally{setBusy(false);}}
 function run(action:string,extra:object={},needsSave=false){void act(action,extra,needsSave).catch(()=>undefined);}
 function present(c:string){run('present',{card:c,hidden:false});}
 async function copy(){try{await navigator.clipboard.writeText(`아우데 검사실\n${location.origin}/rorschach-room?id=${row!.id}${code?'\n접속 코드: '+code:''}`);setNotice(code?'링크와 코드를 복사했습니다.':'검사실 링크를 복사했습니다.');}catch{setError('복사하지 못했습니다. 표시된 링크와 코드를 직접 복사해 주세요.');}}
 async function download(){if(busy||saving)return;setBusy(true);setError('');try{const saved=await flush();const latest:RorschachRow=await api('GET',undefined,saved.id);const url=URL.createObjectURL(new Blob([recordsCsv(draftOf(latest),latest.data.room?.marks)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`AUDE-Rorschach-${latest.data.examDate}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError('CSV 내보내기 실패 · '+(e as Error).message);}finally{setBusy(false);}}
 const visibleMarks=room?.activeResponseId?room.marks[room.activeResponseId]||[]:[];
 const mark=async(command:DrawingCommand)=>{if(!room?.activeResponseId)throw new Error('윤곽을 표시할 반응을 선택해 주세요.');await act(command.action,{...command,responseId:room.activeResponseId,revision:room.revision});};
 function chooseResponse(response:RorschachResponse){if(busy)return;setCard(response.card);setSelected(response.id);if(active&&room?.stage==='inquiry')run('target',{responseId:response.id},true);}
 async function changeStage(stage:'response'|'inquiry'){
  try{await act('stage',{stage},true);if(stage==='inquiry'){const response=draftRef.current.responses.find(r=>r.id===selected)||draftRef.current.responses[0];if(response){setCard(response.card);setSelected(response.id);await act('target',{responseId:response.id},true);}}}catch{/* Error is displayed by act. */}
 }
 function updateQuestion(id:string,index:number,key:'question'|'answer',value:string){setDraft(d=>({...d,responses:d.responses.map(r=>r.id===id?{...r,questions:responseQuestions(r).map((q,n)=>n===index?{...q,[key]:value}:q)}:r)}));}
 return <section className="rorWorkspace" aria-label="로르샤흐 검사실">
 <div className="tatRow"><h2>{editing?'로르샤흐 검사실':'로르샤흐'}</h2>{!editing?<button className="tatPrimary" disabled={busy||loading} onClick={start}>새 검사 준비</button>:<button disabled={busy||saving} onClick={()=>{if(canLeave()){setEditing(false);setRow(null);setRoom(null);onDirty(false);api().then(setRows).catch(e=>setError(e.message));}}}>검사 목록</button>}</div>
 <p className="rorIntro">상담자가 도판을 제시하고, 반응과 질문단계 내용을 기록합니다.</p>
 {error&&<p className="tatError" role="alert">{error}</p>}{saveError&&<p className="tatError" role="alert">기록 저장 실패 · {saveError} <button disabled={saving} onClick={()=>{setSaveError('');void save().catch(()=>undefined);}}>다시 저장</button></p>}{notice&&<p role="status">{notice}</p>}
 {!loading&&<RorschachAssetUpload available={available} onUpdated={setAvailable} onBusy={setUploading}/>}
 {loading?<p>검사 기록을 불러오는 중…</p>:editing?<>
 <div className="rorMeta rorFields"><label>내담자<select value={clientId} disabled={!!row||busy||saving} onChange={e=>setClientId(e.target.value)}><option value="">내담자를 선택해 주세요</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name} · {c.clientCode}</option>)}{row&&!clients.some(c=>c.id===clientId)&&<option value={clientId}>{row.data.clientName}</option>}</select></label><label>검사일<input type="date" disabled={busy} value={draft.examDate} onChange={e=>setDraft(d=>({...d,examDate:e.target.value}))}/></label></div>
 <div className="rorRoomBar"><div><b>{room?(active?'검사 진행 가능':'종료·만료'):'검사 준비'}</b><span>{room?.joinedAt?'내담자 접속 이력 있음':'내담자 접속 대기'}</span>{room&&!connected&&<span role="status">연결 확인 중 · 도판 조작을 잠시 멈춰 주세요.</span>}</div>
 {!room?<button className="tatPrimary" disabled={busy||saving||!clientId||available.length!==10||uploading} onClick={()=>run('create',{},true)}>검사실 만들기</button>:<><button disabled={busy} onClick={copy}>{code?'링크·코드 복사':'접속 링크 복사'}</button><button disabled={busy||saving} onClick={()=>{if(confirm('새 코드를 발급하면 기존 접속은 해제됩니다. 계속할까요?'))run('renew',{},true);}}>새 코드 발급</button>{active&&<button className="tatDanger" disabled={busy} onClick={()=>{if(confirm('내담자 검사 화면을 종료할까요? 기록은 계속 보완할 수 있습니다.'))run('end');}}>검사 종료</button>}</>}
 </div>
 {room&&<details className="rorInvite" open={!!code}><summary>내담자 접속 정보{code?' · 새 코드가 발급되었습니다.':''}</summary><p className="rorLink">{typeof location==='undefined'?'':location.origin}/rorschach-room?id={row?.id}</p>{code?<code>{code}</code>:<p>기존 코드는 다시 표시되지 않습니다. 필요하면 새 코드를 발급해 주세요.</p>}<small>유효기간 · {new Date(room.expiresAt).toLocaleString('ko-KR')}</small></details>}
 {!room&&<p className="rorIntro">화상통화는 별도로 연결합니다. 시작 전에 공식 원본과 화면의 색·명암, 도판 크기를 확인해 주세요.</p>}
 <div className="rorLiveGrid"><div className="rorPresentation">
 <div className="rorStage" aria-label="검사 단계">{(['response','inquiry'] as const).map(stage=><button key={stage} aria-pressed={(room?.stage||'response')===stage} disabled={!active||busy||!connected} onClick={()=>{if(stage!==room?.stage)void changeStage(stage);}}>{stage==='response'?'01 반응단계':'02 질문단계'}</button>)}</div>
 {!active&&available.includes(card)?<><p className="rorIntro">기록 도판 미리보기 · 내담자에게는 표시되지 않습니다.</p><RorschachViewport src={'/api/rorschach/image?card='+card} resetKey={card} marks={currentResponse?room?.marks[currentResponse.id]||[]:[]}/></>:active&&!room?.hidden?<RorschachViewport src={'/api/rorschach/image?card='+presented} resetKey={`${presented}:${room?.stage}:${room?.activeResponseId||''}`} marks={visibleMarks} canMark={room?.stage==='inquiry'&&!!room.activeResponseId&&room.activeResponseId===selected&&room.card===card&&!busy} author="counselor" onDraw={mark}/>:<div className="tatWait"><strong>Rorschach</strong><p>{!room?'검사실을 만든 뒤 첫 도판을 제시해 주세요.':active?'내담자에게는 대기 화면이 표시됩니다.':'검사가 종료되었거나 접속 시간이 만료되었습니다.'}</p></div>}
 <div className="rorPresentControls"><button disabled={!active||busy||!connected||presented==='I'} onClick={()=>present(rorschachCards[rorschachCards.indexOf(presented as typeof rorschachCards[number])-1])}>← 이전</button><b>제시 도판 {presented||'I'}</b><button disabled={!active||busy||!connected||presented==='X'} onClick={()=>present(rorschachCards[rorschachCards.indexOf(presented as typeof rorschachCards[number])+1])}>다음 →</button><button className="tatPrimary" disabled={!active||busy||!connected} onClick={()=>run('present',{card:presented||'I',hidden:!room?.hidden})}>{room?.hidden||!room?'도판 제시':'화면 가리기'}</button></div>
 <div className="rorPresentCards" aria-label="내담자에게 도판 제시">{rorschachCards.map(c=><button key={c} disabled={!active||busy||!connected} aria-pressed={presented===c} onClick={()=>present(c)}>{c}</button>)}</div>
 {room?.view&&<p className="rorViewInfo">내담자 조작 · {room.view.card} · {room.view.angle}° · {Math.round(room.view.scale*100)}% <small>{new Date(room.view.at).toLocaleTimeString('ko-KR')}</small></p>}
 {room?.stage==='inquiry'&&<p className="rorIntro">오른쪽에서 반응을 선택하면 함께 윤곽을 그릴 수 있습니다. 내담자는 빨강, 상담자는 파랑입니다.</p>}

 </div><div className="rorRecordPane">
 <div className="rorRecordHeading"><h3>반응 기록</h3><span role="status">{saving?'저장 중…':saveError?'저장 실패':dirty?'저장 대기':row?'저장됨':'검사실을 만들면 자동 저장됩니다.'}</span></div>
 <div className="rorCards" aria-label="도판별 기록 선택">{rorschachCards.map(c=><button type="button" key={c} aria-pressed={card===c} className={card===c?'active':''} onClick={()=>{const first=draft.responses.find(r=>r.card===c);if(first)chooseResponse(first);else{setCard(c);setSelected('');}}}>{c}<small>{draft.responses.filter(r=>r.card===c).length}</small></button>)}</div>
 <div className="tatRow"><b>기록 도판 {card}</b><button disabled={busy||draft.responses.length>=300} onClick={add}>＋ 반응 추가</button>{presented&&card!==presented&&<button onClick={()=>{setCard(presented);setSelected('');}}>제시 도판 기록으로 이동</button>}</div>
 <div className="rorResponseTabs">{draft.responses.filter(r=>r.card===card).map((r,n)=><button key={r.id} aria-pressed={currentResponse?.id===r.id} onClick={()=>chooseResponse(r)}>반응 {n+1}</button>)}</div>
 {!currentResponse?<p className="rorEmpty">반응을 선택하거나 ‘반응 추가’를 눌러 기록해 주세요.</p>:<article className="rorResponse"><div className="tatRow"><strong>도판 {card} · 반응 {draft.responses.filter(r=>r.card===card).indexOf(currentResponse)+1}</strong><button disabled={busy||saving} onClick={()=>{if(confirm('이 반응을 삭제할까요?')){setDraft(d=>({...d,responses:d.responses.filter(r=>r.id!==currentResponse.id)}));setSelected('');}}}>반응 삭제</button></div>
 <fieldset className="rorFields" disabled={busy}><legend className="rorSrOnly">반응 기록 편집</legend><div className="rorSingleGrid">
 {room?.stage==='inquiry'?<>
 <div className="rorOriginal"><small>반응 원문</small><p>{currentResponse.response||'기록된 반응이 없습니다.'}</p></div>
 <div className="tatRow"><h4>질문단계 기록</h4>{active&&room.activeResponseId!==currentResponse.id&&<button type="button" onClick={()=>run('target',{responseId:currentResponse.id},true)}>이 반응 함께 보기</button>}</div>
 {responseQuestions(currentResponse).map((q,n)=><div className="rorQuestionPair" key={n}>
 <label>질문 {n+1}<textarea rows={2} maxLength={6000} placeholder="상담자의 질문을 작성해 주세요." value={q.question} onChange={e=>updateQuestion(currentResponse.id,n,'question',e.target.value)}/></label>
 <label>내담자 응답 {n+1}<textarea rows={3} maxLength={12000} placeholder="내담자의 응답을 작성해 주세요." value={q.answer} onChange={e=>updateQuestion(currentResponse.id,n,'answer',e.target.value)}/></label>
 </div>)}
 <button type="button" disabled={responseQuestions(currentResponse).length>=60} onClick={()=>setDraft(d=>({...d,responses:d.responses.map(r=>r.id===currentResponse.id?{...r,questions:[...responseQuestions(r),{question:'',answer:''}]}:r)}))}>＋ 질문 추가</button>
 </>:<>
 <label>반응 원문<textarea rows={8} maxLength={12000} value={currentResponse.response} onChange={e=>update(currentResponse.id,'response',e.target.value)}/></label>
 <label>메모<textarea rows={3} maxLength={6000} value={currentResponse.note??currentResponse.observation} onChange={e=>update(currentResponse.id,'note',e.target.value)}/></label>
 <small className="rorViewInfo">반응 당시 방향 · {currentResponse.orientation==='미기록'?'미기록':currentResponse.orientation+'°'}</small>
 </>}
 </div></fieldset>
 {(room?.marks[currentResponse.id]?.length||0)>0&&<p className="rorIntro">이 반응에 윤곽 표시 {room!.marks[currentResponse.id].length}개가 저장되어 있습니다.</p>}
 </article>}
 </div></div>
 <label className="rorSummary rorFields">종합 메모 · 상담자 전용<textarea rows={4} maxLength={30000} value={draft.summary} onChange={e=>setDraft(d=>({...d,summary:e.target.value}))}/></label>
 <div className="rorSave"><span>{saving?'기록을 저장하고 있습니다.':dirty?'변경사항이 있습니다.':row?'기록이 저장되어 있습니다.':''}</span><button disabled={busy||saving} onClick={()=>void download()}>엑셀용 CSV 내보내기</button><button className="tatPrimary" disabled={busy||saving||!clientId||(!dirty&&!!row)} onClick={()=>{void save().then(()=>setNotice('기록을 저장했습니다.')).catch(()=>undefined);}}>기록 저장</button></div>
 </>:<div className="tatSessionList">{rows.length===0?<p className="rorEmpty">저장된 로르샤흐 기록이 없습니다.</p>:rows.map(r=><div className="hubProjectiveRow" key={r.id}><button disabled={busy} onClick={()=>open(r.id)}><b>{r.data.clientName} · 로르샤흐</b><span>{r.data.examDate} · 반응 {r.data.responses.length}개 · {r.data.room?'검사실 있음':'기록'}</span></button><button disabled={busy} onClick={async()=>{if(!confirm(r.data.clientName+' · '+r.data.examDate+' 검사를 삭제할까요? 반응·질문·그림·메모도 함께 삭제되며 복구할 수 없습니다. 진행 중인 검사실도 종료됩니다.'))return;setBusy(true);setError('');try{const response=await fetch('/api/admin/assessment-hub',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',clientId:r.data.clientId,key:'rorschach:'+r.id})});const result=await response.json();if(!response.ok)throw new Error(result.error);setRows(await api());}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>삭제</button></div>)}</div>}
 </section>;
}
