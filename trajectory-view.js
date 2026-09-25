(function(root){
'use strict';
const palette=['#6098ff','#ffb06c','#57d4bd','#d69dfb','#f2809c','#d8d777','#75cbe7','#b9adfc'];
function color(i){return palette[((i-1)%palette.length+palette.length)%palette.length]}
function create(canvas,onSelect,onMove){
 const ctx=canvas.getContext('2d');let data=null,top=null,v=null,screen=[],selected=null,drag=null,boundsKey='',bounds=null;
 function set(d,t,settings){if(data!==d){selected=null;boundsKey=''}data=d;top=t;v=settings;draw()}
 function molecules(){if(data.mols)return data.mols;if(!top)return null;const map=new Map(top.atoms.map(a=>[a.id,a.mol]));return Array.from(data.ids,id=>map.get(id))}
 function fitBounds(mols){const key=[v.mode,v.molecule,v.box].join(':');if(key===boundsKey&&bounds)return bounds;const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];const include=(p,k)=>{low[k]=Math.min(low[k],p);high[k]=Math.max(high[k],p)};
  for(const f of data.frames){if(v.box)f.box.forEach((b,k)=>{include(b[0],k);include(b[1],k)});const p=TrajectoryCore.points(f,v.mode);for(let i=0;i<data.ids.length;i++)if(v.molecule==='all'||mols?.[i]===Number(v.molecule))for(let k=0;k<3;k++)include(p[3*i+k],k)}
  bounds={center:low.map((x,i)=>(x+high[i])/2),span:Math.max(1e-6,Math.hypot(...high.map((x,i)=>x-low[i])))};boundsKey=key;return bounds;
 }
 function draw(){if(!data||!v||!canvas.clientWidth||!canvas.clientHeight)return;const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio||1,2);canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#0c1930';ctx.fillRect(0,0,w,h);const glow=ctx.createRadialGradient(w*.45,h*.42,0,w*.45,h*.42,w*.75);glow.addColorStop(0,'#1b3554');glow.addColorStop(1,'#0a1529');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
  const f=data.frames[v.frame],mols=molecules(),bound=fitBounds(mols),scale=Math.min(w,h)*.88/bound.span*v.zoom;
  const project=p=>{const [x,y,z]=p.map((a,i)=>a-bound.center[i]),xx=x*Math.cos(v.angleY)+z*Math.sin(v.angleY),zz=-x*Math.sin(v.angleY)+z*Math.cos(v.angleY);return {x:w/2+xx*scale,y:h/2-(y*Math.cos(v.angleX)-zz*Math.sin(v.angleX))*scale,z:y*Math.sin(v.angleX)+zz*Math.cos(v.angleX)}};
  if(v.box){const corners=Array.from({length:8},(_,n)=>project(f.box.map((b,i)=>b[(n>>i)&1])));ctx.strokeStyle='#64809e';ctx.lineWidth=1;ctx.setLineDash([4,5]);ctx.beginPath();for(let n=0;n<8;n++)for(let k=0;k<3;k++)if(!(n&(1<<k))){const a=corners[n],b=corners[n|(1<<k)];ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y)}ctx.stroke();ctx.setLineDash([])}
  const p=TrajectoryCore.points(f,v.mode),map=new Map(),commands=[];screen=[];const radius=v.style==='points'?2.2:Math.max(2,Math.min(12,scale*.23));
  for(let i=0;i<data.ids.length;i++){if(v.molecule!=='all'&&mols?.[i]!==Number(v.molecule))continue;const xyz=Array.from(p.subarray(3*i,3*i+3)),point={...project(xyz),i,id:data.ids[i],xyz,radius,color:color(v.color==='molecule'?mols?.[i]??1:data.types[i])};map.set(point.id,point);screen.push(point);commands.push({kind:'atom',...point})}
  if(top&&v.bonds&&v.style!=='points')for(const b of top.bonds){const a=map.get(b.a),c=map.get(b.b);if(!a||!c)continue;const parts=v.mode==='wrapped'?TrajectoryCore.segments(a.xyz,c.xyz,f.box,f.boundary):[[a.xyz,c.xyz]];for(const ends of parts){const x=project(ends[0]),y=project(ends[1]);commands.push({kind:'bond',a:x,b:y,z:(x.z+y.z)/2,color:a.color})}}
  commands.sort((a,b)=>a.z-b.z);for(const item of commands){if(item.kind==='bond'){ctx.strokeStyle=item.color;ctx.globalAlpha=.78;ctx.lineWidth=Math.max(1.2,Math.min(v.style==='sticks'?5:3.4,scale*.095));ctx.lineCap='round';ctx.beginPath();ctx.moveTo(item.a.x,item.a.y);ctx.lineTo(item.b.x,item.b.y);ctx.stroke();ctx.globalAlpha=1;continue}const {x,y,color:c}=item,r=v.style==='sticks'?Math.min(3,radius):radius;if(x<-r||x>w+r||y<-r||y>h+r)continue;
   if(v.style==='points'||r<3)ctx.fillStyle=c;else {const g=ctx.createRadialGradient(x-r*.32,y-r*.36,r*.04,x,y,r);g.addColorStop(0,'#f1f6ff');g.addColorStop(.27,c);g.addColorStop(1,'#25324b');ctx.fillStyle=g}ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();if(item.id===selected){ctx.strokeStyle='#ffffff';ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(x,y,r+4,0,Math.PI*2);ctx.stroke()}}
  ctx.font='13px "Segoe UI",sans-serif';ctx.fillStyle='#bfcee1';ctx.fillText(f.step===null?'当前 data · 静态构象':'Step '+f.step+' · 帧 '+(v.frame+1)+' / '+data.frames.length,18,27);ctx.fillText(screen.length.toLocaleString()+' 粒子 · '+(v.mode==='wrapped'?'盒内坐标':'展开坐标'),18,48);
  const base={x:35,y:h-40},o=project(bound.center);for(const [k,label,c] of [[0,'X','#f592a8'],[1,'Y','#7bdfc6'],[2,'Z','#8caaff']]){const end=[...bound.center];end[k]+=1;const a=project(end),x=base.x+(a.x-o.x)/scale*23,y=base.y+(a.y-o.y)/scale*23;ctx.strokeStyle=c;ctx.beginPath();ctx.moveTo(base.x,base.y);ctx.lineTo(x,y);ctx.stroke();ctx.fillStyle=c;ctx.fillText(label,x+3,y)}
  if(selected!==null){const point=screen.find(a=>a.id===selected);onSelect(point?{id:point.id,type:data.types[point.i],mol:mols?.[point.i]??null,xyz:point.xyz}:null)}
 }
 canvas.onpointerdown=e=>{if(!v)return;drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing'};
 canvas.onpointermove=e=>{if(!drag||!v)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>4)drag.moved=true;v.angleY=(v.angleY+dx*.009)%(2*Math.PI);v.angleX=(v.angleX+dy*.009)%(2*Math.PI);drag.x=e.clientX;drag.y=e.clientY;draw()};
 canvas.onpointerup=e=>{if(!drag)return;if(!drag.moved){const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;const hits=screen.filter(a=>Math.hypot(a.x-x,a.y-y)<Math.max(9,a.radius+3)).sort((a,b)=>b.z-a.z);selected=hits[0]?.id??null;onSelect(null);draw()}else onMove();drag=null;canvas.style.cursor='grab'};
 canvas.onpointercancel=()=>{if(drag)onMove();drag=null;canvas.style.cursor='grab'};
 canvas.addEventListener('wheel',e=>{if(!v)return;e.preventDefault();v.zoom=Math.max(.2,Math.min(8,v.zoom*Math.exp(-e.deltaY*.001)));draw();onMove()},{passive:false});
 canvas.onkeydown=e=>{if(!v)return;const actions={ArrowLeft:()=>v.angleY-=.1,ArrowRight:()=>v.angleY+=.1,ArrowUp:()=>v.angleX-=.1,ArrowDown:()=>v.angleX+=.1,'+':()=>v.zoom=Math.min(8,v.zoom*1.15),'=':()=>v.zoom=Math.min(8,v.zoom*1.15),'-':()=>v.zoom=Math.max(.2,v.zoom/1.15),r:reset,R:reset};if(actions[e.key]){e.preventDefault();actions[e.key]();draw();onMove()}};
 function reset(){if(!v)return;v.angleX=.42;v.angleY=-.5;v.zoom=1;boundsKey='';draw()}
 new ResizeObserver(draw).observe(canvas);return {set,draw,reset};
}
root.TrajectoryView={create,color};
})(window);
