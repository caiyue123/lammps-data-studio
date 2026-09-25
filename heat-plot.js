(function(root){
'use strict';
function render(r,kind,{interactive=false}={}){
 const e=LogPlot.escape,f=LogPlot.format,temp=kind==='temperature',W=900,H=350,l=84,right=25,top=35,bottom=56;
 const ps=temp?r.bins.map(b=>({x:b.x,y:b.temp,sd:b.sd||0,id:b.id})):r.rows.map(t=>({x:t.time,y:t.q,sd:0}));
 let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;for(const p of ps){xmin=Math.min(xmin,p.x);xmax=Math.max(xmax,p.x);ymin=Math.min(ymin,p.y-p.sd);ymax=Math.max(ymax,p.y+p.sd)}const pad=(ymax-ymin)*.12||.1;ymin-=pad;ymax+=pad;
 if(![xmin,xmax,ymin,ymax,xmax-xmin,ymax-ymin].every(Number.isFinite))throw new Error('数据范围过大，无法绘图。');
 const X=x=>l+(x-xmin)/(xmax-xmin)*(W-l-right),Y=y=>H-bottom-(y-ymin)/(ymax-ymin)*(H-top-bottom);
 const label=temp?'分层平均温度与两支拟合':'累计交换能量与线性拟合',id=temp?'heatProfileClip':'heatEnergyClip';
 const s=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="${interactive?'group':'img'}" aria-label="${label}" style="font:12px Segoe UI,Microsoft YaHei,sans-serif"><title>${label}</title><rect width="${W}" height="${H}" fill="white"/><defs><clipPath id="${id}"><rect x="${l-5}" y="${top}" width="${W-l-right+10}" height="${H-top-bottom}"/></clipPath></defs>`];
 for(let i=0;i<=4;i++){const x=xmin+(xmax-xmin)*i/4,y=ymin+(ymax-ymin)*i/4;s.push(`<path d="M${l},${Y(y)}H${W-right}" stroke="#e5ebf4"/><text x="${l-10}" y="${Y(y)+4}" text-anchor="end" fill="#647894">${e(f(y))}</text><text x="${X(x)}" y="${H-bottom+24}" text-anchor="middle" fill="#647894">${e(f(x))}</text>`)}
 s.push(`<text x="${l}" y="18" fill="#647894">${temp?'T* · 误差棒为输出块 SD':'Q*'}</text><text x="${W/2}" y="${H-8}" text-anchor="middle" fill="#647894">${temp?e(r.p.direction)+' 方向位置 s* / σ':'模拟时间 t* / τ'}</text><g clip-path="url(#${id})">`);
 const shown=LogPlot.reduce(ps);s.push('<path d="'+shown.map((p,i)=>(i?'L':'M')+X(p.x)+','+Y(p.y)).join(' ')+'" fill="none" stroke="#a9b6c9" stroke-width="1.4"/>');
 if(temp)for(const p of ps){const branch=p.id>=r.p.leftFrom&&p.id<=r.p.leftTo?'left':p.id>=r.p.rightFrom&&p.id<=r.p.rightTo?'right':null,color=branch==='left'?'#3569d6':branch==='right'?'#bf7832':'#9ba9bc',exchange=p.id===1||p.id===r.n/2+1;
  s.push(`<path d="M${X(p.x)},${Y(p.y-p.sd)}V${Y(p.y+p.sd)}" stroke="${color}" opacity=".5"/><g ${interactive&&!exchange?`data-layer="${p.id}" role="button" tabindex="0" aria-label="选择第 ${p.id} 层" style="cursor:pointer"`:''}><circle cx="${X(p.x)}" cy="${Y(p.y)}" r="11" fill="transparent"/><circle cx="${X(p.x)}" cy="${Y(p.y)}" r="4.5" fill="${color}"/><title>层 ${p.id} · T* ${f(p.y)} · SD ${f(p.sd)}${branch?' · 参与拟合':' · 排除'}</title>${interactive?`<text x="${X(p.x)}" y="${Y(p.y)-14}" text-anchor="middle" fill="${color}">${p.id}</text>`:''}</g>`)}
 function line(fit,a,b,color){s.push(`<path d="M${X(a)},${Y(fit.my+fit.slope*(a-fit.mx))}L${X(b)},${Y(fit.my+fit.slope*(b-fit.mx))}" stroke="${color}" stroke-width="2.3" stroke-dasharray="7 4"/>`)}
 if(temp){line(r.left,r.bins[r.p.leftFrom-1].x,r.bins[r.p.leftTo-1].x,'#3569d6');line(r.right,r.bins[r.p.rightFrom-1].x,r.bins[r.p.rightTo-1].x,'#bf7832')}else line(r.qfit,xmin,xmax,'#3569d6');
 s.push('</g></svg>');return s.join('');
}
function overview(en,p){
 const W=900,H=160,left=68,right=24,top=18,bottom=38,first=en.rows[0],last=en.rows.at(-1),span=last.step-first.step,qspan=last.q-first.q||1;
 const X=x=>left+(x-first.step)/span*(W-left-right),Y=y=>H-bottom-(y-first.q)/qspan*(H-top-bottom),pts=LogPlot.reduce(en.rows.map(r=>({x:r.step,y:r.q})));
 const a=Number(p.from),b=Number(p.to),valid=p.from!==''&&p.to!==''&&Number.isFinite(a)&&Number.isFinite(b)&&a<b,xa=X(Math.max(first.step,Math.min(last.step,a))),xb=X(Math.max(first.step,Math.min(last.step,b)));
 const path=pts.map((t,i)=>(i?'L':'M')+X(t.x)+','+Y(t.y)).join(' ');
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="按住拖选 Step 区间，或使用下方滑块" style="font:12px Segoe UI,Microsoft YaHei,sans-serif"><rect width="900" height="160" fill="white"/><text x="${left}" y="12" fill="#657b9b">Q* · 全部记录</text><rect id="heatBrush" x="${valid?xa:left}" y="${top}" width="${valid?Math.max(0,xb-xa):0}" height="${H-top-bottom}" fill="#dbe7ff"/><path d="${path}" fill="none" stroke="#557cca" stroke-width="2"/><text x="${left}" y="${H-10}" fill="#657b9b">Step ${first.step}</text><text x="${W-right}" y="${H-10}" text-anchor="end" fill="#657b9b">Step ${last.step}</text></svg>`;
}
root.HeatPlot={render,overview};
})(window);
