(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.HeatCore=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const MAX=25*1024*1024;
function need(ok,message){if(!ok)throw new Error(message)}
function lines(text){need(typeof text==='string'&&text.length<=MAX,'单个结果文件最大 25 MB。');const ls=text.replace(/^\uFEFF/,'').split(/\r?\n/);need(ls.length<=250000,'文件超过 250,000 行。');return ls.map((s,i)=>({s:s.trim(),line:i+1})).filter(x=>x.s&&!x.s.startsWith('#'))}
function nums(row,n){const p=row.s.split(/\s+/);need(p.length===n,'第 '+row.line+' 行应有 '+n+' 列。');need(p.every(x=>/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(x)),'第 '+row.line+' 行含非数值或非有限值。');const v=p.map(Number);need(v.every(Number.isFinite),'第 '+row.line+' 行含非有限值。');return v}
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const near=(a,b,tol=1e-6)=>Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b));
function profile(raw){
 need(typeof raw==='string'&&/^#\s*Chunk\s+Coord1\s+Ncount\s+v_bead_temp\s*$/m.test(raw),'温度文件须为本站 Chunk Coord1 Ncount v_bead_temp 四列格式。');
 const rows=lines(raw),blocks=[];let n=null;
 for(let i=0;i<rows.length;){const [step,count,total]=nums(rows[i++],3);need(integer(step)&&Number.isSafeInteger(count)&&count>=4&&count<=200&&count%2===0&&total>0,'温度块头须含非负步数、4–200 个偶数分层及正粒子总数。');need(n===null||n===count,'分层数发生变化，不支持混合剖面。');n=count;need(!blocks.length||step>blocks.at(-1).step,'温度步数重复或重置；请分别分析每次连续采样。');const bins=[];
  for(let j=0;j<n;j++){need(i<rows.length,'温度文件末尾有未写完的分层块。');const [id,coord,pop,temp]=nums(rows[i++],4);need(id===j+1&&near(coord,(j+.5)/n,1e-5),'分层编号或中心坐标不符合等宽 units reduced 分层。');need(pop>=0&&temp>=0,'粒子数与温度不能为负数。');bins.push({id,coord,pop,temp})}
  need(near(bins.reduce((s,b)=>s+b.pop,0),total,1e-4),'分层粒子数之和与块头不一致。');blocks.push({step,bins});
 }
 need(blocks.length>=2,'至少需要两个完整温度块。');return {blocks,n};
}
function energy(raw){
 need(typeof raw==='string'&&/^#\s*TimeStep\s+v_elapsed\s+f_exchange\s+v_cross_area\s+v_heat_length\s*$/m.test(raw),'能量文件须为本站 TimeStep v_elapsed f_exchange v_cross_area v_heat_length 五列格式。');
 const rows=lines(raw).map(row=>{const [step,time,q,area,length]=nums(row,5);need(integer(step)&&time>=0&&q>=0&&area>0&&length>0,'能量步数、时间、累计交换能量须非负，面积与长度须大于零。');return {step,time,q,area,length}});
 need(rows.length>=3,'至少需要三个交换能量记录点。');let dt=null;
 rows.forEach((r,i)=>{need(near(r.area,rows[0].area,1e-5)&&near(r.length,rows[0].length,1e-5),'采样盒尺寸发生变化；本版仅支持固定盒的 RNEMD。');if(i){const prev=rows[i-1];need(r.step>prev.step&&r.time>prev.time&&r.q>=prev.q,'能量步数、时间或累计交换能量重置；不允许拼接重启结果。');const d=(r.time-prev.time)/(r.step-prev.step);need(dt===null||Math.abs(d-dt)<=1e-4*dt,'步数与时间不成比例，请核对时间步长。');dt=d}});return {rows,dt};
}
function number(v,label,min=0,max=Number.MAX_SAFE_INTEGER){need((typeof v==='string'||typeof v==='number')&&String(v).trim()!==''&&Number.isFinite(Number(v)),label+'须填写有效数字。');const n=Number(v);need(Number.isSafeInteger(n)&&n>=min&&n<=max,label+'须为 '+min+'–'+max+' 的整数。');return n}
function settings(p,n){
 need(p&&p.confirmed===true,'请先核对并勾选输出设置与本版分析条件一致。');need(p.units==='lj','本版只计算 LJ 约化热导率；不支持直接按 real / metal 单位分析。');need(['x','y','z'].includes(p.direction),'请选择实际传热方向。');
 const a={...p};for(const k of ['from','to','leftFrom','leftTo','rightFrom','rightTo','every','repeat','groups'])a[k]=number(p[k],({from:'起始步',to:'结束步',leftFrom:'左支首层',leftTo:'左支末层',rightFrom:'右支首层',rightTo:'右支末层',every:'Nevery',repeat:'Nrepeat',groups:'时间块数'}[k]),['from','to'].includes(k)?0:1,k==='groups'?20:Number.MAX_SAFE_INTEGER);
 need(a.from<a.to,'结束步须大于起始步。');need(a.leftFrom>=2&&a.leftTo<=n/2&&a.leftTo-a.leftFrom>=2,'左支至少选 3 层，且只能在第 2–'+n/2+' 层内。');need(a.rightFrom>=n/2+2&&a.rightTo<=n&&a.rightTo-a.rightFrom>=2,'右支至少选 3 层，且只能在第 '+(n/2+2)+'–'+n+' 层内。');need(a.groups>=2,'时间块数至少为 2。');need(Number.isSafeInteger(a.every*a.repeat),'采样间隔过大。');return a;
}
function stats(xs){let mean=0,m2=0;xs.forEach((x,i)=>{const d=x-mean;mean+=d/(i+1);m2+=d*(x-mean)});return {mean,sd:xs.length>1?Math.sqrt(Math.max(0,m2/(xs.length-1))):null}}
function fit(points){need(points.length>=3,'线性拟合至少需要三个点。');const mx=stats(points.map(p=>p.x)).mean,my=stats(points.map(p=>p.y)).mean;let xx=0,xy=0,yy=0;for(const p of points){xx+=(p.x-mx)**2;xy+=(p.x-mx)*(p.y-my);yy+=(p.y-my)**2}need(xx>0&&Number.isFinite(xx)&&Number.isFinite(xy)&&Number.isFinite(yy),'拟合范围无效或数值溢出。');const slope=xy/xx;const residual=points.reduce((s,p)=>s+(p.y-my-slope*(p.x-mx))**2,0);return {slope,mx,my,r2:yy>0?Math.max(0,Math.min(1,1-residual/yy)):null,rmse:Math.sqrt(residual/points.length),n:points.length}}
function calculate(blocks,rows,p){
 const area=stats(rows.map(r=>r.area)).mean,length=stats(rows.map(r=>r.length)).mean;
 const bins=blocks[0].bins.map((b,j)=>{const samples=blocks.map(t=>t.bins[j]),ts=stats(samples.map(t=>t.temp));return {...b,x:b.coord*length,temp:ts.mean,sd:ts.sd,pop:stats(samples.map(t=>t.pop)).mean,valid:samples.every(t=>t.pop>0)}});
 const selected=(lo,hi)=>bins.filter(b=>b.id>=lo&&b.id<=hi),lb=selected(p.leftFrom,p.leftTo),rb=selected(p.rightFrom,p.rightTo);
 need([...lb,...rb].every(b=>b.valid),'拟合范围内存在空层；其零温度不能当作真实温度拟合。');
 const left=fit(lb.map(b=>({x:b.x,y:b.temp}))),right=fit(rb.map(b=>({x:b.x,y:b.temp}))),qfit=fit(rows.map(r=>({x:r.time,y:r.q}))),flux=qfit.slope/(2*area);
 const valid=left.slope>0&&right.slope<0&&flux>0;
 const gradient=(Math.abs(left.slope)+Math.abs(right.slope))/2,kappa=valid?flux/gradient:null;
 need([area,length,gradient,flux].every(Number.isFinite)&&(!valid||Number.isFinite(kappa)),'数值超出可计算范围。');
 return {bins,left,right,qfit,area,length,flux,gradient,kappa,leftK:valid?flux/left.slope:null,rightK:valid?flux/-right.slope:null,valid};
}
function analyze(pro,en,params){
 const p=settings(params,pro.n),freq=p.every*p.repeat;
 need(pro.blocks.every(b=>b.step%freq===0)&&en.rows.every(r=>r.step%freq===0),'输出步须为 Nfreq 的整数倍；请核对采样设置。');
 need(pro.blocks.every((b,i)=>!i||b.step-pro.blocks[i-1].step===freq),'温度块间隔与 Nevery × Nrepeat 不一致，或存在缺失块。本版要求不重叠的连续采样周期。');
 need(en.rows.every((r,i)=>!i||r.step-en.rows[i-1].step===freq),'能量输出间隔须与温度块间隔一致且没有缺失。');
 const map=new Map(en.rows.map(r=>[r.step,r]));
 const blocks=pro.blocks.filter(b=>b.step>p.from&&b.step<=p.to),rows=en.rows.filter(r=>r.step>=p.from&&r.step<=p.to);
 need(map.has(p.from)&&map.has(p.to),'起止步须落在能量文件已有的输出步上。');need(blocks.length>=2&&blocks[0].step-freq===p.from&&blocks.at(-1).step===p.to&&blocks.length+1===rows.length,'选择区间须包含至少两个完整温度块及对应能量端点；不允许部分块或文件时间错配。');
 need(blocks.every(b=>map.has(b.step)),'温度与能量采样步不一致。');
 const r=calculate(blocks,rows,p),warnings=['数值估计不代表已达到稳态、尺寸收敛或线性响应；需比较不同时间窗、交换频率及体系尺寸。'];
 if(!r.valid)warnings.push('两支温度梯度应左正右负且热流为正；当前未满足，不报告有效热导率。');
 if([r.left,r.right].some(f=>f.r2===null||f.r2<.9))warnings.push('至少一支温度拟合 R² < 0.90 或温度恒定：剖面噪声或非线性较强（0.90 仅为提示阈值）。');
 if(r.valid&&Math.abs(r.left.slope+r.right.slope)/r.gradient>.3)warnings.push('两支梯度幅度差超过平均梯度的 30%，请检查时间稳定性和拟合区间（经验提示阈值）。');
 if(r.bins.some(b=>b.pop<10))warnings.push('部分层平均粒子数少于 10，温度噪声可能较大。');
 const chunks=[];
 if(blocks.length<p.groups*2)warnings.push('每个时间块至少需 2 个温度输出块；当前不足以计算所选块数的热导率波动。');
 else for(let i=0;i<p.groups;i++){
  const begin=Math.floor(i*blocks.length/p.groups),end=Math.floor((i+1)*blocks.length/p.groups),bs=blocks.slice(begin,end),from=bs[0].step-freq,to=bs.at(-1).step;
  try{const sub=calculate(bs,rows.slice(begin,end+1),p);chunks.push({from,to,kappa:sub.kappa,valid:sub.valid})}catch(err){chunks.push({from,to,kappa:null,valid:false,reason:err.message})}
 }
 const allValid=chunks.length>=2&&chunks.every(c=>c.valid),variation=allValid?stats(chunks.map(c=>c.kappa)):null;
 if(chunks.some(c=>!c.valid))warnings.push('部分时间块无法得到有效热导率，未通过删去这些块来计算波动；请延长采样或检查梯度。');
 return {...r,p,n:pro.n,blocks:blocks.length,rows,firstSample:blocks[0].step-p.every*(p.repeat-1),timeFrom:rows[0].time,timeTo:rows.at(-1).time,chunks,variation,warnings};
}
function defaults(pro,en){const n=pro.n,freq=pro.blocks[1].step-pro.blocks[0].step;return {confirmed:false,units:'unknown',direction:'z',from:String(Math.max(pro.blocks[0].step-freq,en.rows[0].step)),to:String(Math.min(pro.blocks.at(-1).step,en.rows.at(-1).step)),every:'',repeat:'',leftFrom:'2',leftTo:String(n/2),rightFrom:String(n/2+2),rightTo:String(n),groups:'5'}}
const f=x=>x===null?'未得出':Number(x).toPrecision(6);
function report(r,names){return ['RNEMD 热导率分析 · LJ 约化单位',...names,'传热方向：'+r.p.direction,'区间 Step '+r.p.from+'–'+r.p.to+'；时间 '+f(r.timeFrom)+'–'+f(r.timeTo)+' τ；'+r.blocks+' 个温度块', 'Nevery='+r.p.every+' Nrepeat='+r.p.repeat+'；首个实际温度样本 Step '+r.firstSample,'左支层号 '+r.p.leftFrom+'–'+r.p.leftTo+'；右支 '+r.p.rightFrom+'–'+r.p.rightTo,'截面积 A*='+f(r.area)+'；传热长度 L*='+f(r.length),'dQ*/dt*='+f(r.qfit.slope)+'；能量拟合 R²='+f(r.qfit.r2),'J*=(dQ*/dt*)/(2 A*)='+f(r.flux),'左支梯度='+f(r.left.slope)+'；R²='+f(r.left.r2),'右支梯度='+f(r.right.slope)+'；R²='+f(r.right.r2),'平均梯度幅度 g*=(|g左|+|g右|)/2='+f(r.gradient),'κ*=J*/g*='+f(r.kappa),'左支 κ*='+f(r.leftK)+'；右支 κ*='+f(r.rightK),'时间块 κ* 样本标准差='+f(r.variation?.sd??null)+'；有效块 '+r.chunks.filter(c=>c.valid).length+'/'+r.chunks.length,'该标准差是时间波动，不是标准误或置信区间；时间块独立性未验证。',...r.chunks.map(c=>'块 '+c.from+'–'+c.to+'：κ*='+f(c.kappa)), '温度按各输出块等权平均；每层 SD 描述输出块之间的温度波动。','交换层 1 与 N/2+1 排除；OLS 自由截距拟合；周期双向热流使用因子 2。','仅适用本站 units lj、无约束三维温度 v_bead_temp、等宽 reduced 分层、norm sample ave one、固定盒、连续不重启 RNEMD 输出。','未转换 W/(m·K)。有明确粗粒化映射后，κ_SI=κ* kB/(σ τ)，τ=σ√(m/ε)。',...r.warnings,'参考：https://docs.lammps.org/fix_thermal_conductivity.html','参考：https://docs.lammps.org/fix_ave_chunk.html','参考：https://docs.lammps.org/units.html'].join('\n')+'\n'}
function csv(r){return 'layer,s_reduced,T_mean,T_block_SD,Ncount_mean,fit_branch\n'+r.bins.map(b=>[b.id,b.x,b.temp,b.sd??'',b.pop,b.id>=r.p.leftFrom&&b.id<=r.p.leftTo?'left':b.id>=r.p.rightFrom&&b.id<=r.p.rightTo?'right':'excluded'].join(',')).join('\n')+'\n'}
const numericKeys=['every','repeat','from','to','leftFrom','leftTo','rightFrom','rightTo','groups'];
function draft(p){
 const keys=['confirmed','units','direction',...numericKeys];need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).length===keys.length&&keys.every(k=>Object.hasOwn(p,k)),'分析设置字段不完整或含未知字段。');
 need(typeof p.confirmed==='boolean'&&['unknown','lj'].includes(p.units)&&['x','y','z'].includes(p.direction),'分析设置选项无效。');
 for(const k of numericKeys)need((typeof p[k]==='number'&&Number.isFinite(p[k]))||(typeof p[k]==='string'&&p[k].length<=80&&(p[k]===''||/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(p[k]))),'分析数字草稿格式无效：'+k);
 return {...p};
}
function parameters(text,pro,en){
 need(typeof text==='string'&&text.length<=65536,'参数记录最大 64 KB。');let o;try{o=JSON.parse(text)}catch{throw new Error('参数记录不是有效 JSON。')}
 need(o&&o.formatVersion===1&&o.parameters&&typeof o.parameters==='object','请选择本站作业包中的 parameters.json。');const p=o.parameters;
 need(p.mode==='rnemd'&&p.units==='lj'&&['x','y','z'].includes(p.direction)&&['bx','by','bz'].every(k=>p[k]==='p'),'参数记录须来自本站 LJ、三向周期的 RNEMD 生产流程。');
 for(const k of ['bins','sampleEvery','sampleRepeat','productionSteps'])need(typeof p[k]==='number'&&Number.isSafeInteger(p[k])&&p[k]>0,'参数记录缺少有效的 '+k+'。');
 need(typeof p.dt==='number'&&Number.isFinite(p.dt)&&p.dt>0&&p.dt<=1,'参数记录缺少有效时间步长。');need(Number.isSafeInteger(o.atoms)&&o.atoms>0&&Number.isSafeInteger(o.bonds)&&o.bonds>=0,'参数记录的粒子数或键数无效。');
 need(p.bins===pro.n,'参数记录中的分层数与温度文件不一致。');const freq=p.sampleEvery*p.sampleRepeat;need(Number.isSafeInteger(freq)&&freq>0,'参数记录的采样周期无效。');
 need(pro.blocks.every((b,i)=>b.step%freq===0&&(!i||b.step-pro.blocks[i-1].step===freq))&&en.rows.every((r,i)=>r.step%freq===0&&(!i||r.step-en.rows[i-1].step===freq)),'参数记录中的采样周期与结果文件不一致。');
 need(Math.abs(p.dt-en.dt)<=1e-4*p.dt,'参数记录中的时间步长与能量文件不一致。');
 need(pro.blocks.every(b=>near(b.bins.reduce((s,v)=>s+v.pop,0),o.atoms,1e-4)),'参数记录中的粒子数与温度文件不一致。');
 need(p.productionSteps>=Math.max(pro.blocks.at(-1).step,en.rows.at(-1).step)&&p.productionSteps%freq===0,'结果的步数范围与参数记录的正式采样长度不一致。');
 return {units:p.units,direction:p.direction,every:String(p.sampleEvery),repeat:String(p.sampleRepeat),confirmed:false};
}
function sourceCheck(source,pro,en){if(source===null)return;need(source&&Object.keys(source).length===2&&typeof source.name==='string'&&source.name.length>0&&source.name.length<=250&&typeof source.raw==='string','参数来源记录格式无效。');parameters(source.raw,pro,en)}
function session(raws,names,p,source=null){
 need(Array.isArray(raws)&&raws.length===2&&Array.isArray(names)&&names.length===2&&names.every(x=>typeof x==='string'&&x.length>0&&x.length<=250),'分析记录的文件名无效。');
 const pro=profile(raws[0]),en=energy(raws[1]);draft(p);sourceCheck(source,pro,en);
 const text=JSON.stringify({format:'lammps-rnemd-analysis',version:2,raws,names,p,source},null,2);need(text.length<=60*1024*1024,'分析记录超过 60 MB。');return text;
}
function readSession(text){need(typeof text==='string'&&text.length<=60*1024*1024,'分析记录超过 60 MB。');let o;try{o=JSON.parse(text)}catch{throw new Error('分析记录不是有效 JSON。')}need(o&&o.format==='lammps-rnemd-analysis'&&[1,2].includes(o.version),'不是支持的 RNEMD 分析记录。');session(o.raws,o.names,o.p,o.source??null);return {...o,source:o.source??null}}
function snapRange(pro,en,a,b){
 need(Number.isFinite(a)&&Number.isFinite(b),'拖选范围无效。');const freq=pro.blocks[1].step-pro.blocks[0].step,available=new Set(en.rows.map(r=>r.step));
 const steps=[pro.blocks[0].step-freq,...pro.blocks.map(t=>t.step)].filter(x=>available.has(x));need(steps.length>=3,'两个文件没有足够的共同端点。');
 function nearest(x){let best=0;for(let i=1;i<steps.length;i++)if(Math.abs(steps[i]-x)<Math.abs(steps[best]-x))best=i;return best}
 let lo=nearest(Math.min(a,b)),hi=nearest(Math.max(a,b));if(hi-lo<2){hi=Math.min(steps.length-1,lo+2);lo=Math.max(0,hi-2)}return {from:String(steps[lo]),to:String(steps[hi])};
}
return {profile,energy,analyze,defaults,fit,stats,report,csv,session,readSession,parameters,draft,snapRange};
});
