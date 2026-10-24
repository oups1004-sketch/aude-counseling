import type { RorschachMark, RorschachPoint } from './rorschach-records';

export const eraserRadius = .018;
function distance(p:RorschachPoint,a:RorschachPoint,b:RorschachPoint){
 const dx=b.x-a.x,dy=b.y-a.y;
 const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
// Sweep the entire pointer segment, including the space between browser events.
export function eraseDrawing(marks:RorschachMark[],path:RorschachPoint[],actor:'participant'|'counselor'):RorschachMark[]{
 if(!path.length)return marks;
 const hit=(p:RorschachPoint)=>path.some((a,i)=>distance(p,a,path[Math.min(i+1,path.length-1)])<=eraserRadius);
 return marks.flatMap(mark=>{
  if(actor==='participant'&&mark.author==='counselor')return [mark];
  const samples:RorschachPoint[]=[mark.points[0]];
  for(let i=1;i<mark.points.length;i++){
   const a=mark.points[i-1],b=mark.points[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.003));
   for(let j=1;j<=steps;j++)samples.push({x:a.x+(b.x-a.x)*j/steps,y:a.y+(b.y-a.y)*j/steps});
  }
  if(!samples.some(hit))return [mark];
  const parts:RorschachPoint[][]=[];let part:RorschachPoint[]=[];
  for(const p of samples){
   if(hit(p)){if(part.length)parts.push(part);part=[];}
   else {if(part.length===200){parts.push(part);part=[part[part.length-1]];}part.push(p);}
  }
  if(part.length)parts.push(part);
  return parts.map(points=>({...mark,id:crypto.randomUUID(),points}));
 });
}
