(function(root){
'use strict';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format=n=>!Number.isFinite(n)?'—':n===0?'0':(Math.abs(n)>=1e6||Math.abs(n)<.001?n.toExponential(3):Number(n.toPrecision(6)).toString());
function reduce(points,limit=1400){
 if(points.length<=limit)return points;
 const out=[],stride=Math.ceil(points.length/(limit/4));
 for(let i=0;i<points.length;i+=stride){const bucket=points.slice(i,i+stride);if(bucket.some(p=>!p)){out.push(...bucket);continue}let min=0,max=0;for(let j=1;j<bucket.length;j++){if(bucket[j].y<bucket[min].y)min=j;if(bucket[j].y>bucket[max].y)max=j}for(const j of [...new Set([0,min,max,bucket.length-1])].sort((a,b)=>a-b))out.push(bucket[j])}
 return out;
}
function render(result,{title,xLabel,yLabel,mean=true,trend=false}){
 const {stats:s}=result,width=960,height=390,left=88,right=25,top=38,bottom=64;
 const x0=s.start,x1=s.end,y0=s.min,y1=s.max;
 let xPad=x0===x1?Math.max(Math.abs(x0)*.02,1):0,yPad=(y1-y0)*.1||Math.max(Math.abs(y0)*.02,.1);
 const xmin=x0-xPad,xmax=x1+xPad,ymin=y0-yPad,ymax=y1+yPad;
 if(![xmin,xmax,ymin,ymax,xmax-xmin,ymax-ymin].every(Number.isFinite))throw new Error('数据范围过大，无法绘图。请检查原始数值是否已经发散。');
 const X=x=>left+(x-xmin)/(xmax-xmin)*(width-left-right),Y=y=>height-bottom-(y-ymin)/(ymax-ymin)*(height-top-bottom);
 const e=escape,parts=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${e(title)}" style="font:12px Segoe UI,Microsoft YaHei,sans-serif;background:#fff"><title>${e(title)}</title><rect width="960" height="390" fill="white"/><defs><clipPath id="plotClip"><rect x="${left}" y="${top}" width="${width-left-right}" height="${height-top-bottom}"/></clipPath></defs>`];
 for(let i=0;i<=5;i++){const y=ymin+(ymax-ymin)*i/5,x=xmin+(xmax-xmin)*i/5;parts.push(`<path d="M${left},${Y(y)}H${width-right}" stroke="#e8eef6"/><text x="${left-12}" y="${Y(y)+4}" fill="#75859d" text-anchor="end">${e(format(y))}</text><text x="${X(x)}" y="${height-bottom+25}" fill="#75859d" text-anchor="middle">${e(format(x))}</text>`)}
 parts.push(`<path d="M${left},${top}V${height-bottom}H${width-right}" fill="none" stroke="#b9c8de"/><text x="${left}" y="19" fill="#607895">${e(yLabel)}</text><text x="${(left+width-right)/2}" y="${height-10}" fill="#607895" text-anchor="middle">${e(xLabel)}</text><g clip-path="url(#plotClip)">`);
 if(mean&&s.mean!==null)parts.push(`<path d="M${left},${Y(s.mean)}H${width-right}" fill="none" stroke="#299775" stroke-dasharray="6 5" stroke-width="1.4"/>`);
 if(trend&&s.slope!==null){const ya=s.mean+s.slope*(xmin-s.centerX),yb=s.mean+s.slope*(xmax-s.centerX);parts.push(`<path d="M${left},${Y(ya)}L${width-right},${Y(yb)}" stroke="#d38839" stroke-dasharray="3 4" stroke-width="1.5"/>`)}
 const shown=reduce(result.points),chunks=[];let chunk=[];for(const p of shown){if(!p){if(chunk.length)chunks.push(chunk);chunk=[]}else chunk.push(p)}if(chunk.length)chunks.push(chunk);
 for(const points of chunks){if(points.length===1){parts.push(`<circle cx="${X(points[0].x)}" cy="${Y(points[0].y)}" r="3" fill="#355fdd"/>`);continue}parts.push('<path d="'+points.map((p,i)=>(i?'L':'M')+X(p.x).toFixed(2)+','+Y(p.y).toFixed(2)).join(' ')+'" fill="none" stroke="#355fdd" stroke-width="1.8" stroke-linejoin="round"/>')}
 parts.push('</g></svg>');return {svg:parts.join(''),shown:shown.filter(Boolean).length,xmin,xmax,left,right,width};
}
const api={render,reduce,format,escape};if(typeof module!=='undefined')module.exports=api;else root.LogPlot=api;
})(typeof window!=='undefined'?window:globalThis);
