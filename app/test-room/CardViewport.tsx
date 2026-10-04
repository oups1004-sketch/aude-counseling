'use client';
import { useEffect,useRef,useState } from 'react';
export default function CardViewport({src,onView}:{src:string;onView?:(scale:number,angle:number)=>void}){
 const defaultAngle=new URL(src,'https://www.audecounseling.com').searchParams.get('card')==='14'?90:0;
 const box=useRef<HTMLDivElement>(null);const drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
 const [scale,setScale]=useState(1);const [angle,setAngle]=useState(defaultAngle);const [offset,setOffset]=useState({x:0,y:0});const [size,setSize]=useState({w:800,h:600});const [aspect,setAspect]=useState(1.3);const [failed,setFailed]=useState(false);
 const reset=()=>{setScale(1);setAngle(defaultAngle);setOffset({x:0,y:0});};
 useEffect(()=>{setScale(1);setAngle(defaultAngle);setOffset({x:0,y:0});setFailed(false);},[src,defaultAngle]);
 useEffect(()=>{const el=box.current;if(!el)return;const observer=new ResizeObserver(()=>setSize({w:el.clientWidth,h:el.clientHeight}));observer.observe(el);const wheel=(e:WheelEvent)=>{e.preventDefault();setScale(s=>Math.min(4,Math.max(.5,s*Math.exp(-e.deltaY*.001))));};el.addEventListener('wheel',wheel,{passive:false});return()=>{observer.disconnect();el.removeEventListener('wheel',wheel);};},[]);
 useEffect(()=>{const t=setTimeout(()=>onView?.(scale,angle),600);return()=>clearTimeout(t);},[scale,angle,onView]);
 const flipped=Math.abs(angle%180)===90;const w=Math.max(20,Math.min((flipped?size.h:size.w)-90,((flipped?size.w:size.h)-90)*aspect));
 return <div className="tatViewport" ref={box}>
 <div className="tatCanvas" onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,left:offset.x,top:offset.y};}} onPointerMove={e=>{const d=drag.current;if(d)setOffset({x:d.left+e.clientX-d.x,y:d.top+e.clientY-d.y});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
 {!failed?<img src={src} alt="현재 검사 도판" draggable={false} onLoad={e=>setAspect(e.currentTarget.naturalWidth/e.currentTarget.naturalHeight)} onError={()=>setFailed(true)} style={{width:w,height:w/aspect,transform:`translate(${offset.x}px,${offset.y}px) rotate(${angle}deg) scale(${scale})`}}/>:<p>도판을 불러오지 못했습니다. 연결 상태를 확인해 주세요.</p>}
 </div>
 <div className="tatTools" aria-label="도판 조작"><button aria-label="축소" onClick={()=>setScale(s=>Math.max(.5,s-.2))}>−</button><span>{Math.round(scale*100)}%</span><button aria-label="확대" onClick={()=>setScale(s=>Math.min(4,s+.2))}>＋</button><i/><button aria-label="왼쪽으로 회전" onClick={()=>setAngle(a=>a-90)}>↶</button><button aria-label="오른쪽으로 회전" onClick={()=>setAngle(a=>a+90)}>↷</button><button onClick={reset}>원래대로</button><button onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();else void box.current?.requestFullscreen().catch(()=>undefined);}}>전체화면</button></div>
 </div>;
}
