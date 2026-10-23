'use client';
import { useEffect,useRef,useState } from 'react';
import type { RorschachMark,RorschachPoint } from '../lib/rorschach-records';
type Props={src:string;resetKey:string;marks?:RorschachMark[];canMark?:boolean;onMark?:(points:RorschachPoint[])=>Promise<void>;onView?:(scale:number,angle:number)=>void};
export default function RorschachViewport({src,resetKey,marks=[],canMark=false,onMark,onView}:Props){
 const box=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null),drag=useRef<{x:number;y:number;left:number;top:number}|null>(null),stroke=useRef<RorschachPoint[]|null>(null);
 const [scale,setScale]=useState(1),[angle,setAngle]=useState(0),[offset,setOffset]=useState({x:0,y:0}),[size,setSize]=useState({w:800,h:600}),[aspect,setAspect]=useState(1.35),[failed,setFailed]=useState(false),[mode,setMode]=useState<'move'|'point'|'draw'>('move'),[pending,setPending]=useState<RorschachPoint[]>([]),[showMarks,setShowMarks]=useState(true),[sending,setSending]=useState(false),[message,setMessage]=useState('');
 const reset=()=>{setScale(1);setAngle(0);setOffset({x:0,y:0});};
 useEffect(()=>{reset();setFailed(false);setPending([]);stroke.current=null;drag.current=null;setMessage('');},[resetKey,src]);
 useEffect(()=>{if(!canMark)setMode('move');},[canMark]);
 useEffect(()=>{const el=box.current;if(!el)return;const measure=()=>setSize({w:el.clientWidth,h:el.clientHeight});measure();const observer=new ResizeObserver(measure);observer.observe(el);const wheel=(e:WheelEvent)=>{e.preventDefault();setScale(s=>Math.min(4,Math.max(.5,s*Math.exp(-e.deltaY*.001))));};el.addEventListener('wheel',wheel,{passive:false});return()=>{observer.disconnect();el.removeEventListener('wheel',wheel);};},[]);
 useEffect(()=>{const t=setTimeout(()=>onView?.(scale,angle),250);return()=>clearTimeout(t);},[scale,angle,onView]);
 const flipped=angle%180===90,w=Math.max(20,Math.min((flipped?size.h-105:size.w-48),(flipped?size.w-48:size.h-105)*aspect));
 function point(e:React.PointerEvent):RorschachPoint|null{const matrix=svg.current?.getScreenCTM();if(!matrix)return null;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return {x:Math.min(1,Math.max(0,p.x/1000)),y:Math.min(1,Math.max(0,p.y/1000))};}
 async function finish(){const points=stroke.current;stroke.current=null;if(!points?.length||!onMark)return;setSending(true);setMessage('');try{await onMark(points);setPending([]);}catch(e){setMessage((e as Error).message+' · 표시를 다시 그려 주세요.');setPending([]);}finally{setSending(false);}}
 function render(points:RorschachPoint[],key:string){return points.length===1?<circle key={key} cx={points[0].x*1000} cy={points[0].y*1000} r="7"/>:<polyline key={key} points={points.map(p=>`${p.x*1000},${p.y*1000}`).join(' ')}/>;}
 return <div><div className="tatViewport rorViewport" ref={box} aria-label="검사 도판">
 <div className="tatCanvas" onPointerDown={e=>{if(mode!=='move'||e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,left:offset.x,top:offset.y};}} onPointerMove={e=>{const d=drag.current;if(d)setOffset({x:d.left+e.clientX-d.x,y:d.top+e.clientY-d.y});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
 {failed?<p role="alert">도판을 불러오지 못했습니다. 연결 상태를 확인해 주세요.</p>:<div className={'rorImageLayer mode-'+mode} style={{width:w,height:w/aspect,transform:`translate(${offset.x}px,${offset.y}px) rotate(${angle}deg) scale(${scale})`}}>
 <img src={src} alt="현재 검사 도판" draggable={false} onLoad={e=>setAspect(e.currentTarget.naturalWidth/e.currentTarget.naturalHeight)} onError={()=>setFailed(true)}/>
 <svg ref={svg} viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="반응 위치 표시" onPointerDown={e=>{if(mode==='move'||!canMark||sending||e.button!==0)return;e.stopPropagation();const p=point(e);if(!p)return;e.currentTarget.setPointerCapture(e.pointerId);stroke.current=[p];setPending([p]);setShowMarks(true);}} onPointerMove={e=>{if(mode!=='draw'||!stroke.current)return;const p=point(e);if(p&&stroke.current.length<200){stroke.current=[...stroke.current,p];setPending(stroke.current);}}} onPointerUp={()=>{if(stroke.current)void finish();}} onPointerCancel={()=>{stroke.current=null;setPending([]);}}>
 {showMarks&&marks.map(m=>render(m.points,m.id))}{pending.length>0&&render(pending,'pending')}
 </svg></div>}
 </div>
 <div className="tatTools"><button aria-label="축소" onClick={()=>setScale(s=>Math.max(.5,s-.2))}>−</button><span>{Math.round(scale*100)}%</span><button aria-label="확대" onClick={()=>setScale(s=>Math.min(4,s+.2))}>＋</button><i/><button aria-label="왼쪽으로 회전" onClick={()=>setAngle(a=>(a+270)%360)}>↶</button><span>{angle}°</span><button aria-label="오른쪽으로 회전" onClick={()=>setAngle(a=>(a+90)%360)}>↷</button><button onClick={reset}>원래대로</button><button onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();else void box.current?.requestFullscreen().catch(()=>setMessage('이 브라우저에서는 전체화면을 사용할 수 없습니다.'));}}>전체화면</button></div>
 {canMark&&<div className="rorMarkTools">{(['move','point','draw'] as const).map(m=><button key={m} aria-pressed={mode===m} disabled={sending} onClick={()=>setMode(m)}>{m==='move'?'이동':m==='point'?'위치 가리키기':'윤곽 그리기'}</button>)}<button aria-pressed={!showMarks} onClick={()=>setShowMarks(v=>!v)}>{showMarks?'표시 숨기기':'표시 보기'}</button>{sending&&<small>표시 저장 중…</small>}</div>}
 </div>{message&&<p role="alert" className="tatError">{message}</p>}</div>;
}
