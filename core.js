(function(root){
'use strict';
const fail=m=>{throw new Error(m)};
const int=(n,lo,hi,label)=>{if(!Number.isInteger(n)||n<lo||n>hi)fail(label+'须为 '+lo+'～'+hi+' 的整数。')};
const positive=(n,label)=>{if(!Number.isFinite(n)||n<1e-6||n>1e9)fail(label+'须在 0.000001～1,000,000,000 之间。')};
function generate(p){
 int(p.chains,1,10000,'链数');int(p.length,2,10000,'每链粒子数');
 if(p.chains*p.length>10000)fail('当前版本最多生成 10,000 个粒子。');
 int(p.aCount,0,p.length,'每链 A 粒子数');int(p.seed,1,2147483646,'随机种子');
 for(const [k,label] of [['massA','A 质量'],['massB','B 质量'],['spacing','链间距'],['bond','初始键长'],['padding','边缘留白']])positive(p[k],label);
 if(!['block','mixed','random'].includes(p.sequence))fail('未知排列方式。');
 let seed=p.seed;const random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646};
 const ny=Math.ceil(Math.sqrt(p.chains)),nz=Math.ceil(p.chains/ny);
 const sizes=[(p.length-1)*p.bond+2*p.padding,(ny-1)*p.spacing+2*p.padding,(nz-1)*p.spacing+2*p.padding];
 const m={title:'LAMMPS Data Studio | straight-chain teaching model',atomTypes:2,bondTypes:1,masses:[{id:1,mass:p.massA},{id:2,mass:p.massB}],atoms:[],bonds:[],box:sizes.map(v=>[-v/2,v/2]),reference:p.bond,source:'generated'};
 for(let c=0;c<p.chains;c++){
  let types=Array.from({length:p.length},(_,i)=>i<p.aCount?1:2);
  if(p.sequence==='mixed')types=types.map((_,i)=>Math.floor((i+1)*p.aCount/p.length)>Math.floor(i*p.aCount/p.length)?1:2);
  if(p.sequence==='random')for(let i=types.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[types[i],types[j]]=[types[j],types[i]]}
  for(let i=0;i<p.length;i++){
   const id=c*p.length+i+1;
   m.atoms.push({id,mol:c+1,type:types[i],x:-sizes[0]/2+p.padding+i*p.bond,y:-sizes[1]/2+p.padding+c%ny*p.spacing,z:-sizes[2]/2+p.padding+Math.floor(c/ny)*p.spacing});
   if(i)m.bonds.push({id:m.bonds.length+1,type:1,a:id-1,b:id});
  }
 }
 return m;
}
const format=n=>Number(n.toPrecision(12)).toString();
function serialize(m){
 const lines=[m.title.replace(/[\r\n]/g,' '),'',m.atoms.length+' atoms',m.bonds.length+' bonds','',m.atomTypes+' atom types',m.bondTypes+' bond types','',...m.box.map((b,i)=>format(b[0])+' '+format(b[1])+' '+'xyz'[i]+'lo '+'xyz'[i]+'hi'),'','Masses','',...m.masses.map(a=>a.id+' '+format(a.mass)),'','Atoms # molecular','',...m.atoms.map(a=>[a.id,a.mol,a.type,format(a.x),format(a.y),format(a.z),...(a.image||[])].join(' '))];
 if(m.bonds.length)lines.push('','Bonds','',...m.bonds.map(b=>[b.id,b.type,b.a,b.b].join(' ')));
 if(m.velocities?.length)lines.push('','Velocities','',...m.velocities.map(v=>[v.id,format(v.vx),format(v.vy),format(v.vz)].join(' ')));
 return lines.join('\n')+'\n';
}
function validate(m,{periodic=false,reference=m.reference||1}={}){
 const pbc=Array.isArray(periodic)?periodic:[periodic,periodic,periodic];
 const errors=[],warnings=[],err=t=>{if(errors.length<15)errors.push(t)};
 if(!m.atoms.length)err('结构中没有粒子。');
 if(!Number.isInteger(m.atomTypes)||m.atomTypes<1||m.atomTypes>10000)err('粒子类型数须为 1～10,000 的整数。');
 if(!Number.isInteger(m.bondTypes)||m.bondTypes<0||m.bondTypes>10000)err('键类型数须为 0～10,000 的整数。');
 const validBox=m.box.length===3&&m.box.every(b=>b.length===2&&b.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e15)&&b[1]>b[0]);
 if(!validBox)err('盒边界须为有限数，且每个上界大于下界。');
 const masses=new Map();
 for(const a of m.masses){if(!Number.isInteger(a.id)||a.id<1||a.id>m.atomTypes||masses.has(a.id))err('Masses 中类型编号重复或越界。');if(!Number.isFinite(a.mass)||a.mass<=0)err('类型 '+a.id+' 的质量须大于 0。');masses.set(a.id,a.mass)}
 for(let i=1;i<=Math.min(m.atomTypes,10000);i++)if(!masses.has(i))err('缺少类型 '+i+' 的质量。');
 const ids=new Map();let outside=0;
 for(const a of m.atoms){
  if(!Number.isSafeInteger(a.id)||a.id<1||ids.has(a.id))err('粒子编号 '+a.id+' 重复或无效。');ids.set(a.id,a);
  if(!Number.isSafeInteger(a.mol)||a.mol<0)err('粒子 '+a.id+' 的分子编号无效。');
  if(!Number.isInteger(a.type)||a.type<1||a.type>m.atomTypes)err('粒子 '+a.id+' 的类型越界。');
  if(![a.x,a.y,a.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=1e15))err('粒子 '+a.id+' 坐标无效，绝对值须不超过 1e15。');
  if(a.image&&(!Array.isArray(a.image)||a.image.length!==3||!a.image.every(Number.isInteger)))err('粒子 '+a.id+' 的 image flags 无效。');
  if(validBox&&[a.x,a.y,a.z].some((v,i)=>v<m.box[i][0]||v>=m.box[i][1]))outside++;
 }
 if(m.velocities!==undefined){
  if(!Array.isArray(m.velocities)||m.velocities.length!==m.atoms.length)err('Velocities 段须为每个粒子恰好提供一行速度。');
  else {const velocityIds=new Set();for(const v of m.velocities){if(!Number.isSafeInteger(v.id)||!ids.has(v.id)||velocityIds.has(v.id))err('Velocities 中粒子编号重复或不存在。');velocityIds.add(v.id);if(![v.vx,v.vy,v.vz].every(n=>Number.isFinite(n)&&Math.abs(n)<=1e15))err('粒子 '+v.id+' 的速度无效。')}}
 }
 const bondIds=new Set(),pairs=new Set();let longBonds=0,zeroBonds=0;
 const distance=(a,b)=>Math.hypot(...['x','y','z'].map((k,i)=>{let d=a[k]-b[k];if(pbc[i]){const L=m.box[i][1]-m.box[i][0];d-=Math.round(d/L)*L}return d}));
 for(const b of m.bonds){
  if(!Number.isInteger(b.id)||b.id<1||bondIds.has(b.id))err('键编号重复或无效。');bondIds.add(b.id);
  if(!Number.isInteger(b.type)||b.type<1||b.type>m.bondTypes)err('键 '+b.id+' 的类型越界。');
  if(!ids.has(b.a)||!ids.has(b.b)||b.a===b.b){err('键 '+b.id+' 端点不存在或连接自身。');continue}
  const pair=[b.a,b.b].sort((a,b)=>a-b).join(':');if(pairs.has(pair))err('键 '+b.id+' 重复连接同一对粒子。');pairs.add(pair);
  if(validBox){const d=distance(ids.get(b.a),ids.get(b.b));if(d<1e-10)zeroBonds++;if(d>reference*1.5)longBonds++}
 }
 if(zeroBonds)err(zeroBonds+' 条键的两个端点重合。');
 if(outside)warnings.push(outside+' 个粒子不在盒内 [lo, hi)。请结合 in 文件的边界条件处理。');
 if(longBonds)warnings.push(longBonds+' 条键长超过参考长度的 1.5 倍。这是几何提示，不是 FENE 参数判定。');
 let close=0;
 if(!errors.length&&validBox&&Number.isFinite(reference)&&reference>0){
  const threshold=reference*.5,grid=new Map(),sizes=m.box.map(b=>b[1]-b[0]),counts=sizes.map(L=>Math.max(1,Math.floor(L/threshold)));
  const cell=a=>['x','y','z'].map((k,i)=>{let v=a[k]-m.box[i][0];if(pbc[i])v=((v%sizes[i])+sizes[i])%sizes[i];return Math.floor(v/(pbc[i]?sizes[i]/counts[i]:threshold))});
  for(const a of m.atoms){
   const c=cell(a),visited=new Set();
   for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
    let q=c.map((v,i)=>v+[dx,dy,dz][i]);q=q.map((v,i)=>pbc[i]?(v%counts[i]+counts[i])%counts[i]:v);
    const key=q.join(',');if(visited.has(key))continue;visited.add(key);
    for(const b of grid.get(key)||[])if(distance(a,b)<threshold)close++;
   }
   const key=c.join(',');if(!grid.has(key))grid.set(key,[]);grid.get(key).push(a);
  }
  if(close)warnings.push(close+' 对粒子间距小于参考长度的 0.5 倍，可能有明显重叠。');
 }
 return {errors,warnings,outside,close,longBonds};
}
function parse(text){
 if(text.length>15*1024*1024)fail('文件超过 15 MB。');
 const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);
 const m={title:lines[0]||'Imported molecular data',atomTypes:0,bondTypes:0,masses:[],atoms:[],bonds:[],box:[],source:'imported'};
 let section=null;const declared={},seen=new Set();
 for(let li=1;li<lines.length;li++){
  const raw=lines[li].trim(),s=raw.split('#')[0].trim();if(!s)continue;
  if(/^[A-Za-z]/.test(s)){
   if(!['Masses','Atoms','Bonds','Velocities'].includes(s))fail('不支持 '+s+' 段。仅导入 Masses / Atoms / Bonds / Velocities；原文件未修改。');
   if(seen.has(s))fail('重复的 '+s+' 段。');seen.add(s);section=s;if(s==='Velocities')m.velocities=[];
   if(s==='Atoms'&&raw.includes('#')&&raw.split('#')[1].trim().split(/\s/)[0]!=='molecular')fail('仅支持 Atoms # molecular；不能把 atomic 或 full 当作 molecular。');
   continue;
  }
  const v=s.split(/\s+/);
  if(!section){
   let match;
   if(match=s.match(/^(\d+)\s+(atoms|bonds|atom types|bond types)$/)){declared[match[2]]=Number(match[1]);continue}
   if(match=s.match(/^(\d+)\s+(angles|dihedrals|impropers|angle types|dihedral types|improper types)$/)){if(Number(match[1])!==0)fail('当前版本不支持角、二面角或 improper 拓扑。');continue}
   if(match=s.match(/^(\S+)\s+(\S+)\s+([xyz])lo\s+\3hi$/)){const axis='xyz'.indexOf(match[3]);if(m.box[axis])fail('重复的盒边界。');m.box[axis]=[Number(match[1]),Number(match[2])];continue}
   fail('不支持第 '+(li+1)+' 行的头部内容；当前只支持正交盒。');
  }
  const nums=v.map(Number);if(nums.some(n=>!Number.isFinite(n)))fail('第 '+(li+1)+' 行存在无效数字。');
  if(section==='Masses'){if(nums.length!==2)fail('Masses 每行应为：类型 质量。');m.masses.push({id:nums[0],mass:nums[1]})}
  if(section==='Atoms'){if(![6,9].includes(nums.length))fail('molecular 的 Atoms 每行须为 6 列，或附加 3 个 image flags。');const [id,mol,type,x,y,z]=nums;m.atoms.push({id,mol,type,x,y,z,...(nums.length===9?{image:nums.slice(6)}:{})})}
  if(section==='Bonds'){if(nums.length!==4)fail('Bonds 每行应为：键ID 类型 粒子1 粒子2。');m.bonds.push({id:nums[0],type:nums[1],a:nums[2],b:nums[3]})}
  if(section==='Velocities'){if(nums.length!==4)fail('Velocities 每行应为：粒子ID vx vy vz。');(m.velocities??=[]).push({id:nums[0],vx:nums[1],vy:nums[2],vz:nums[3]})}
 }
 if(m.atoms.length>10000)fail('当前编辑器最多导入 10,000 个粒子。');
 if(declared.atoms!==m.atoms.length||(declared.bonds||0)!==m.bonds.length)fail('头部声明的粒子数或键数与实际行数不一致。');
 m.atomTypes=declared['atom types'];m.bondTypes=declared['bond types']||0;
 if(m.box.length!==3||[0,1,2].some(i=>!m.box[i]))fail('缺少 X/Y/Z 盒边界。');
 const result=validate(m);if(result.errors.length)fail(result.errors.join('\n'));
 return m;
}
const api={generate,serialize,validate,parse,format};
if(typeof module!=='undefined')module.exports=api;else root.DataCore=api;
})(typeof window!=='undefined'?window:globalThis);
