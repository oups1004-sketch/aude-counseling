'use client';
import { FormEvent,useCallback,useEffect,useState } from 'react';
import CardViewport from './CardViewport';
import Recorder from './Recorder';
import './tat.css';
type State={active:boolean;card:string|null;revision:number};
export default function TestRoom(){
 const [id,setId]=useState('');const [code,setCode]=useState('');const [joined,setJoined]=useState(false);const [state,setState]=useState<State|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [ready,setReady]=useState(false);const [connected,setConnected]=useState(true);
 useEffect(()=>{const value=new URLSearchParams(location.search).get('id')||'';setId(value);if(value)fetch('/api/tat/state?id='+value,{cache:'no-store'}).then(async r=>{if(r.ok){setState(await r.json());setJoined(true);}}).catch(()=>undefined).finally(()=>setReady(true));else setReady(true);},[]);
 useEffect(()=>{if(!joined||!id)return;let stopped=false;let timer:ReturnType<typeof setTimeout>;
 async function poll(){try{const r=await fetch('/api/tat/state?id='+id,{cache:'no-store'});if(!r.ok){if(r.status===401){if(!stopped){setState({active:false,card:null,revision:0});setError('접속이 만료되었습니다. 새 코드로 다시 접속해 주세요.');setJoined(false);}return;}throw new Error('연결 실패');}const s=await r.json();if(!stopped){setState(s);setConnected(true);setError('');}}catch{if(!stopped){setConnected(false);setError('연결이 잠시 끊겼습니다. 자동으로 다시 연결합니다.');}}if(!stopped)timer=setTimeout(poll,1500);}
 void poll();return()=>{stopped=true;clearTimeout(timer);};},[id,joined]);
 async function login(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await fetch('/api/tat/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,code})});const data=await r.json();if(!r.ok)throw new Error(data.error);setJoined(true);setCode('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const view=useCallback((scale:number,angle:number)=>{if(!state?.card||!state.active)return;void fetch('/api/tat/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,card:state.card,scale,angle})}).catch(()=>undefined);},[id,state?.card,state?.active]);
 return <main className="tatClient"><header className="tatClientHeader"><span className="tatClientBrand">AUDE</span><small>아우데 심리상담센터 · TAT</small></header>
 {!ready?<div className="tatLogin"><p>접속 정보를 확인하는 중…</p></div>:!joined?<section className="tatLogin"><p className="tatKicker">YOUR PRIVATE ASSESSMENT ROOM</p><h1>이야기를 시작할 준비</h1><p>상담자가 전달한 접속 코드를 입력해 주세요.</p>{!id?<p className="tatError">상담자가 보낸 검사 링크로 접속해 주세요.</p>:<form onSubmit={login}><label className="tatLabel">접속 코드<input autoComplete="off" autoCapitalize="characters" spellCheck={false} value={code} onChange={e=>setCode(e.target.value)} placeholder="접속 코드 입력" required/></label><button className="tatPrimary" disabled={busy}>{busy?'확인 중…':'검사 공간 입장'}</button></form>}{error&&<p className="tatError" role="alert">{error}</p>}</section>:<div className="tatClientMain">{error&&<p className="tatError" role="alert">{error}</p>}
 {state?.active&&state.card&&connected?<CardViewport src={`/api/tat/image?id=${id}&card=${state.card}&v=${state.revision}`} onView={view}/>:<div className="tatWait"><strong>TAT</strong><p>{!connected?'상담자와 다시 연결하고 있습니다.':state&&!state.active?'검사가 종료되었습니다. 함께해 주셔서 감사합니다.':'상담자가 도판을 준비하고 있습니다. 잠시 기다려 주세요.'}</p></div>}
 <Recorder id={id} active={!!state?.active}/><p className="tatClientFooter">마우스 휠로 확대 · 드래그로 이동 · 회전 후 ‘원래대로’로 돌아올 수 있어요.</p>
 </div>}</main>;
}
