(function(root){
'use strict';
const D=typeof module!=='undefined'?require('./core.js'):root.DataCore;
const defaults=Object.freeze({mode:'check',units:'lj',bx:'p',by:'p',bz:'p',pair:'wca',bond:'fene',
 epsilonAA:1,epsilonAB:1,epsilonBB:1,sigmaAA:1,sigmaAB:1,sigmaBB:1,cutoff:2.5,
 k:30,rmax:1.5,bondEpsilon:1,bondSigma:1,harmonicK:100,r0:.97,
 dt:.003,temperature:1,seed:20260920,tdamp:.3,pdamp:3,pressure:1,
 minimize:true,nvtSteps:2000,npt:true,nptSteps:4000,settleSteps:1000,
 direction:'z',bins:8,exchange:200,swaps:1,warmSteps:4000,productionSteps:10000,
 sampleEvery:10,sampleRepeat:20,thermoEvery:100,dumpEvery:200,importUnitsConfirmed:false,reuseEquilibrated:false,reuseForceFieldConfirmed:false});
const format=n=>Number(n.toPrecision(12)).toString();
function inspect(m,input,dirty=false){
 const p={...defaults,...input},errors=[],warnings=[];
 const err=t=>{if(errors.length<20)errors.push(t)};
 const choice=(k,values)=>{if(!values.includes(p[k]))err(k+' 的选项无效。')};
 const number=(k,label,min,max,integer=false)=>{if(typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<min||p[k]>max||(integer&&!Number.isInteger(p[k])))err(label+'须为 '+min+'～'+max+' 的'+(integer?'整数':'有限数')+'。')};
 for(const [k,v] of [['mode',['check','equilibrate','rnemd']],['units',['lj']],['pair',['wca','lj']],['bond',['fene','harmonic']],['direction',['x','y','z']],...['bx','by','bz'].map(k=>[k,['p','f']])])choice(k,v);
 for(const k of ['minimize','npt','importUnitsConfirmed','reuseEquilibrated','reuseForceFieldConfirmed'])if(typeof p[k]!=='boolean')err(k+' 须为布尔值。');
 if(p.reuseEquilibrated&&p.mode!=='rnemd')err('平衡后结构复用只适用于 RNEMD 流程。');
 for(const k of ['epsilonAA','epsilonAB','epsilonBB','sigmaAA','sigmaAB','sigmaBB'])number(k,k,1e-6,1e6);
 if(p.pair==='lj')number('cutoff','LJ 截断倍数',1.13,10);
 if(p.bond==='fene')for(const [k,n] of [['k','FENE 刚度 K'],['rmax','FENE 最大伸长 R₀'],['bondEpsilon','键内排斥 ε'],['bondSigma','键内排斥 σ']])number(k,n,1e-6,1e6);
 else {number('harmonicK','谐键刚度 K',1e-6,1e6);number('r0','谐键平衡长度',1e-6,1e6)}
 number('dt','时间步长',1e-7,1);number('thermoEvery','热力学输出间隔',1,1e9,true);number('dumpEvery','轨迹输出间隔',1,1e9,true);
 const dynamics=p.mode!=='check',freshEquilibration=dynamics&&!p.reuseEquilibrated;
 if(freshEquilibration){
  number('temperature','目标温度',1e-6,1e6);number('seed','速度随机种子',1,899999999,true);number('tdamp','温度阻尼时间',1e-6,1e9);number('nvtSteps','NVT 步数',1,1e9,true);
  if(p.npt){number('pressure','目标压力',-1e6,1e6);number('pdamp','压力阻尼时间',1e-6,1e9);number('nptSteps','NPT 步数',1,1e9,true)}
 }
 if(p.mode==='rnemd'){
  for(const [k,n,min,max] of [['bins','分层数',4,200],['exchange','交换间隔',1,1e9],['swaps','每次交换对数',1,10000],['settleSteps','NVE 预运行步数',1,1e9],['warmSteps','梯度建立步数',1,1e9],['productionSteps','正式采样步数',1,1e9],['sampleEvery','采样间隔',1,1e6],['sampleRepeat','每块采样次数',1,1e6]])number(k,n,min,max,true);
  if(p.bins%2!==0)err('RNEMD 分层数必须是偶数。');
  if(p.bins<8)warnings.push('本站热导率分析至少需要 8 层，才能排除交换层后每侧保留 3 个拟合点。4 或 6 层仍可供 LAMMPS 运行，但不能用本站完成两侧热导率拟合。');
  const block=p.sampleEvery*p.sampleRepeat;
  if(block>1e9)err('每块步数不能超过 1,000,000,000。');
  if(block%p.exchange!==0)err('每块步数（采样间隔 × 每块采样次数）必须是能量交换间隔的整数倍，才能同步输出交换能量。');
  if(p.productionSteps<block||p.productionSteps%block!==0)err('正式采样步数必须是“采样间隔 × 每块采样次数”的整数倍，且至少输出一块。');
  if(p.productionSteps<p.exchange)err('正式采样期间至少要发生一次能量交换。');
  if(p.warmSteps<p.exchange)err('梯度建立阶段至少要发生一次能量交换。');
  if(p.productionSteps/block<10)warnings.push('温度剖面少于 10 个时间块；这里只能练习流程，不能据此判断热导率收敛。');
  if(p.productionSteps/block<2)warnings.push('本站热导率分析至少需要 2 个完整温度块及对应能量端点；当前采样长度不足。');
 }
 const periodic=['bx','by','bz'].map(k=>p[k]==='p');
 if(freshEquilibration&&p.npt&&!periodic.every(Boolean))err('本模板的 NPT 使用 iso，要求 X/Y/Z 全部为周期边界 p。');
 if(p.mode==='rnemd'&&!periodic.every(Boolean))err('本版 RNEMD 模板要求三向周期边界 p，采用双向热流分析。');
 if(dirty)err('结构参数尚未应用：请返回“结构 data”点击生成，再导出配套文件。');
 if(!m||!Array.isArray(m.atoms)||!Array.isArray(m.bonds)){err('请先生成或导入一个结构。');return {p,errors,warnings}}
 if(m.atomTypes>2||m.bondTypes>1)err('in 编辑器目前支持最多 2 类粒子、1 类键；不能自动给额外类型分配力场。');
 if(m.source==='imported'&&!p.importUnitsConfirmed)err('请确认导入结构已经使用 LJ 约化单位。选择 units lj 不会转换原文件的单位。');
 if(p.reuseEquilibrated){
  if(m.source!=='imported'||!Array.isArray(m.velocities)||m.velocities.length!==m.atoms.length)err('复用已平衡结构须先导入包含完整 Velocities 段的 equilibrated.data。');
  if(!p.reuseForceFieldConfirmed)err('请核对原运行与当前的力场、质量、时间步和边界条件一致，并勾选来源确认。');
 }
 const basic=D.validate(m,{periodic,reference:Math.min(p.sigmaAA,p.sigmaAB,p.sigmaBB)});
 basic.errors.forEach(err);
 if(basic.outside)err('有粒子位于盒外，请在结构编辑器修正坐标或盒边界。');
 if(basic.close)err('检测到明显重叠的粒子，请先在结构编辑器排除重叠。');
 if(errors.length)return {p,errors,warnings};
 const lengths=m.box.map(b=>b[1]-b[0]),byId=new Map(m.atoms.map(a=>[a.id,a]));
 let nearLimit=0,tooLong=0;
 for(const b of m.bonds){const a=byId.get(b.a),c=byId.get(b.b);const r=Math.hypot(...['x','y','z'].map((k,i)=>{let d=a[k]-c[k];if(periodic[i])d-=Math.round(d/lengths[i])*lengths[i];return d}));if(p.bond==='fene'){if(r>=p.rmax)tooLong++;else if(r>.9*p.rmax)nearLimit++}}
 if(tooLong)err(tooLong+' 条键的长度达到或超过 FENE 最大伸长 R₀，不能导出。');
 if(nearLimit)warnings.push(nearLimit+' 条键接近 FENE 最大伸长，请减小初始键长或重新核对力场。');
 if(dynamics&&p.dt>.01)warnings.push('当前时间步较大，需用短程 NVE 测试能量漂移；高刚度或低质量还需要更小的步长。');
 if(freshEquilibration&&p.tdamp<10*p.dt)warnings.push('温度阻尼时间小于 10 个时间步，控温可能过快。');
 if(freshEquilibration&&p.npt&&p.pdamp<100*p.dt)warnings.push('压力阻尼时间小于 100 个时间步，盒尺寸可能变化过快。');
 if(p.reuseEquilibrated)warnings.push('data 只保留结构与速度，不证明已经平衡，也不保存原力场、fix 状态或原步数。请对照原 log.lammps 与 parameters.json 核实来源；这会开始一次新的 RNEMD 阶段。');
 if(!periodic.every(Boolean))warnings.push('f 表示固定非周期边界，不是反射墙；粒子离开盒子会丢失。');
 if(p.epsilonAA===p.epsilonAB&&p.epsilonAB===p.epsilonBB&&p.sigmaAA===p.sigmaAB&&p.sigmaAB===p.sigmaBB&&m.masses.every(a=>a.mass===m.masses[0].mass))warnings.push('A/B 的质量和作用参数相同，当前只是不同标签；改变排列不会赋予两种粒子不同材料性质。');
 if(p.mode==='rnemd'&&m.atoms.length/p.bins<30)warnings.push('平均每层少于 30 个粒子，温度噪声可能很大。小体系用于学习命令，正式研究需做尺寸与采样收敛测试。');
 if(p.mode==='rnemd'&&p.swaps>m.atoms.length/p.bins)warnings.push('交换对数超过平均每层粒子数，实际可能无法完成要求的交换。');
 const rc=Math.max(p.sigmaAA,p.sigmaAB,p.sigmaBB)*(p.pair==='wca'?Math.pow(2,1/6):p.cutoff);
 if(periodic.some((yes,i)=>yes&&lengths[i]<2*rc))warnings.push('某个周期盒长小于两倍最大截断半径，会涉及重复周期镜像；正式计算应核对盒尺寸。');
 return {p,errors,warnings};
}
function stages(p){const s=[{name:'读取与受力检查',steps:0}];if(p.mode==='check')return s;if(!p.reuseEquilibrated){if(p.minimize)s.push({name:'能量最小化',steps:null});s.push({name:'NVT 控温',steps:p.nvtSteps});if(p.npt)s.push({name:'NPT 调密度',steps:p.nptSteps})}if(p.mode==='rnemd')s.push({name:'NVE 预运行',steps:p.settleSteps},{name:'建立温度梯度',steps:p.warmSteps},{name:'RNEMD 采样',steps:p.productionSteps});return s}
function build(m,input,dirty=false){
 const result=inspect(m,input,dirty),p=result.p;
 if(result.errors.length)return {...result,script:'',stages:[]};
 const f=format,lines=[],add=(...s)=>lines.push(...s),section=(n,s)=>add('','# '+n+' | '+s);
 add('# Molecular Studio - LAMMPS input / teaching model', '# Bundle this file with the matching model.data.', '# LJ reduced units. Not a validated PE/PP force field.', '# Run in a NEW directory: lmp -in in.lammps');
 section('01','Units, boundaries and structure');
 add('clear','units lj','dimension 3','atom_style molecular','boundary '+[p.bx,p.by,p.bz].join(' '));
 if(m.bondTypes)add('bond_style '+p.bond);
 add('read_data model.data');
 section('02','Nonbonded and bonded interactions');
 const factor=p.pair==='wca'?Math.pow(2,1/6):p.cutoff;
 add('# '+(p.pair==='wca'?'WCA: repulsive LJ, cutoff = 2^(1/6) * sigma':'LJ: attractive tail, cutoff = selected multiplier * sigma'),'pair_style lj/cut '+f(Math.max(p.sigmaAA,p.sigmaAB,p.sigmaBB)*factor),'pair_modify shift yes');
 for(const [i,j,key] of [[1,1,'AA'],[1,2,'AB'],[2,2,'BB']])if(i<=m.atomTypes&&j<=m.atomTypes)add('pair_coeff '+i+' '+j+' '+f(p['epsilon'+key])+' '+f(p['sigma'+key])+' '+f(p['sigma'+key]*factor));
 if(m.bondTypes){
  if(p.bond==='fene')add('bond_coeff 1 '+[p.k,p.rmax,p.bondEpsilon,p.bondSigma].map(f).join(' '),'special_bonds fene');
  else add('# harmonic energy = K*(r-r0)^2; K includes the 1/2 factor','bond_coeff 1 '+f(p.harmonicK)+' '+f(p.r0),'special_bonds lj/coul 0.0 1.0 1.0');
 }
 add('neighbor 0.3 bin','neigh_modify every 1 delay 0 check yes');
 if(m.bondTypes)add('comm_modify cutoff '+f(Math.max(Math.max(p.sigmaAA,p.sigmaAB,p.sigmaBB)*factor+.3,3*(p.bond==='fene'?p.rmax:p.r0))));
 section('03','Initial force and energy check');
 add('timestep '+f(p.dt),'thermo '+p.thermoEvery,'thermo_style custom step time temp press pe ke etotal density vol','thermo_modify norm no','run 0');
 if(p.mode!=='check'){
  if(!p.reuseEquilibrated){
  if(p.minimize){section('04','Energy minimization (not thermal equilibration)');add('min_style cg','minimize 1.0e-6 1.0e-8 1000 10000')}
  section('05','Create velocities and equilibrate');
  add('reset_timestep 0','velocity all create '+f(p.temperature)+' '+p.seed+' mom yes rot no dist gaussian','dump eqtraj all custom '+p.dumpEvery+' equilibration.lammpstrj id mol type x y z ix iy iz','dump_modify eqtraj sort id','fix thermostat all nvt temp '+f(p.temperature)+' '+f(p.temperature)+' '+f(p.tdamp),'run '+p.nvtSteps,'unfix thermostat');
  if(p.npt)add('','# NPT also integrates motion; do not add a second integrator.','fix barostat all npt temp '+f(p.temperature)+' '+f(p.temperature)+' '+f(p.tdamp)+' iso '+f(p.pressure)+' '+f(p.pressure)+' '+f(p.pdamp),'run '+p.nptSteps,'unfix barostat');
  add('undump eqtraj','write_restart equilibrated.restart','write_data equilibrated.data nocoeff');
  }else {section('04','Reuse imported equilibrated positions and velocities');add('# read_data already loaded the Velocities section. Do not recreate velocities or repeat NVT/NPT.','# Force-field coefficients must match the original equilibration run.');}
  if(p.mode==='rnemd'){
   section(p.reuseEquilibrated?'05':'06','NVE relaxation and gradient establishment');
   const exchange=id=>'fix '+id+' all thermal/conductivity '+p.exchange+' '+p.direction+' '+p.bins+' swap '+p.swaps;
   add('fix integrator all nve','run '+p.settleSteps,exchange('warm_exchange'),'run '+p.warmSteps,'unfix warm_exchange','unfix integrator');
   section(p.reuseEquilibrated?'06':'07','Production: new time origin and new cumulative exchange tally');
   add('reset_timestep 0','fix integrator all nve','compute kinetic all ke/atom','# Three unconstrained translational degrees of freedom; LJ kB = 1.','variable bead_temp atom c_kinetic/1.5','compute layers all chunk/atom bin/1d '+p.direction+' lower '+f(1/p.bins)+' units reduced');
   const block=p.sampleEvery*p.sampleRepeat,area={x:'ly*lz',y:'lx*lz',z:'lx*ly'}[p.direction];
   add('fix profile all ave/chunk '+p.sampleEvery+' '+p.sampleRepeat+' '+block+' layers v_bead_temp norm sample ave one file temperature.profile',exchange('exchange'),
    'variable elapsed equal step*dt','variable cross_area equal '+area,'variable heat_length equal l'+p.direction,
    '# At production step 0, elapsed = 0 and cumulative exchange = 0.',
    'fix energy_record all ave/time '+block+' 1 '+block+' v_elapsed f_exchange v_cross_area v_heat_length file heat_exchange.dat',
    '# Exchange tally is recorded separately at exchange-compatible timesteps.',
    'dump prodtraj all custom '+p.dumpEvery+' production.lammpstrj id mol type x y z ix iy iz','dump_modify prodtraj sort id','run '+p.productionSteps,
    'unfix energy_record','unfix profile','unfix exchange','unfix integrator','undump prodtraj','write_restart final.restart','write_data final.data nocoeff');
  }
 }
 add('','# Completed the requested script; physical convergence must be assessed separately.');
 const flow=stages(p);return {...result,script:lines.join('\n')+'\n',stages:flow,totalSteps:flow.reduce((n,s)=>n+(s.steps||0),0)};
}
function readme(m,result){const {p}=result;return `分子结构工坊 · 配套模拟文件\n\n1. 解压到一个新的工作目录，model.data 与 in.lammps 放在同一层。重复运行会覆盖同名输出。\n2. 已安装 LAMMPS 的本机终端进入该目录，运行：\n   lmp -in in.lammps\n   Windows 的可执行文件也可能叫 lmp.exe；按实际安装路径执行。\n3. 超算：这只是 LAMMPS 输入，不是作业提交脚本。需按学校说明加载 LAMMPS/MPI、填写调度器作业脚本并提交；不要在登录节点直接运行正式模拟。\n\n本次配置\n粒子数：${m.atoms.length}，键数：${m.bonds.length}\n模式：${p.mode}，单位：LJ 约化单位（不是 K、Å、ps 或 W/(m·K)）\n时间步：${p.dt}，动力学总步数：${result.totalSteps}，模拟时长：${format(result.totalSteps*p.dt)} τ（不含最小化；不是电脑耗时）\n力场：${p.pair} + ${p.bond}；参数见 parameters.json 和 in 文件。\n每次导出自动使用编辑器当前结构，未引用 C:\\1234 或旧项目程序。\n\n输出与检查\nlog.lammps：温度、压力、势能、总能、密度等。run 0 只检查读取与初始受力，不代表平衡。\n平衡模式还输出 equilibration.lammpstrj、equilibrated.restart、equilibrated.data。\nRNEMD 模式额外输出 production.lammpstrj、temperature.profile、heat_exchange.dat、final.restart 和 final.data。\nequilibrated.data 含结构与速度，可在第 01 页重新导入；RNEMD 页勾选复用后跳过最小化、速度重建和 NVT/NPT。data 本身不证明已平衡，也不保存原力场、fix 状态或步数。\n二进制 restart 用于更接近原状态的续算；data 复用开启新的 RNEMD 阶段，不接续原步数，也不保证逐位相同。\n\nRNEMD 分析\n每块步数 = 采样间隔 × 每块采样次数。温度剖面各列为层号、约化层中心、平均粒子数、层温度。空层不可拿来拟合。\nheat_exchange.dat 各列为 step、elapsed、累计交换能量 Q、横截面积 A、传热方向盒长 L。\n梯度建立阶段不计入正式采样：重建交换 fix 后 Q 清零，同时 step 归零。生产段使用 NVE，盒长固定。\n先确认梯度与能量交换斜率达到稳定，再取同一稳态时间窗分析。换热层为第 1 层与第 Nbin/2+1 层。\n分别拟合两侧线性区，排除换热层及其附近非线性区；将约化层坐标乘以 L 得到实际约化长度坐标。\n周期边界有两条热流路径，J = ΔQ/(2*A*Δt)，κ = |J|/|dT/ds|。这里得到约化热导率，不能直接标为 W/(m·K)。\n改变交换频率、系统尺寸、平衡长度和采样长度并使用独立重复，验证线性响应和不确定度。\n本模板无 SHAKE/刚性约束，层温度按 3 个平移自由度计算，未扣除局部流动速度。\n\n适用范围\n最多 2 类粗粒化粒子、1 类键、正交盒、atom_style molecular、units lj。\n教学默认参数与短步数只为理解流程；不是导师论文的 PE/PP 力场，也不是可直接用于结题的收敛结果。\n不能通过把 units lj 改成 real 来实现单位或模型转换。\n\n导出时提示\n${result.warnings.map(t=>'- '+t).join('\n')||'无额外提示。'}\n\n官方说明\nhttps://docs.lammps.org/units.html\nhttps://docs.lammps.org/pair_lj.html\nhttps://docs.lammps.org/bond_fene.html\nhttps://docs.lammps.org/bond_harmonic.html\nhttps://docs.lammps.org/fix_nh.html\nhttps://docs.lammps.org/fix_thermal_conductivity.html\nhttps://docs.lammps.org/fix_ave_chunk.html\n`}
// A small, dependency-free ZIP writer (stored entries, UTF-8 names, CRC-32).
function zip(files){
 const enc=new TextEncoder(),parts=[],directory=[];let offset=0;
 const crc=bytes=>{let n=0xffffffff;for(const b of bytes){n^=b;for(let j=0;j<8;j++)n=(n>>>1)^((n&1)?0xedb88320:0)}return(n^0xffffffff)>>>0};
 const header=size=>{const bytes=new Uint8Array(size);return {bytes,v:new DataView(bytes.buffer)}};
 for(const [name,text] of Object.entries(files)){
  const filename=enc.encode(name),data=enc.encode(text),sum=crc(data),a=header(30+filename.length),b=header(46+filename.length);
  a.v.setUint32(0,0x04034b50,true);a.v.setUint16(4,20,true);a.v.setUint16(6,0x800,true);a.v.setUint16(12,0x21,true);a.v.setUint32(14,sum,true);a.v.setUint32(18,data.length,true);a.v.setUint32(22,data.length,true);a.v.setUint16(26,filename.length,true);a.bytes.set(filename,30);
  b.v.setUint32(0,0x02014b50,true);b.v.setUint16(4,20,true);b.v.setUint16(6,20,true);b.v.setUint16(8,0x800,true);b.v.setUint16(14,0x21,true);b.v.setUint32(16,sum,true);b.v.setUint32(20,data.length,true);b.v.setUint32(24,data.length,true);b.v.setUint16(28,filename.length,true);b.v.setUint32(42,offset,true);b.bytes.set(filename,46);
  parts.push(a.bytes,data);directory.push(b.bytes);offset+=a.bytes.length+data.length;
 }
 const dirLength=directory.reduce((n,b)=>n+b.length,0),end=header(22);end.v.setUint32(0,0x06054b50,true);end.v.setUint16(8,directory.length,true);end.v.setUint16(10,directory.length,true);end.v.setUint32(12,dirLength,true);end.v.setUint32(16,offset,true);
 const out=new Uint8Array(offset+dirLength+22);let at=0;for(const b of [...parts,...directory,end.bytes]){out.set(b,at);at+=b.length}return out;
}
function bundle(m,result){if(result.errors.length||!result.script)throw new Error('请先解决脚本检查错误。');return zip({'model.data':D.serialize(m),'in.lammps':result.script,'README.txt':readme(m,result),'parameters.json':JSON.stringify({formatVersion:1,parameters:result.p,atoms:m.atoms.length,bonds:m.bonds.length},null,2)+'\n'})}
const api={defaults,inspect,build,stages,readme,zip,bundle};if(typeof module!=='undefined')module.exports=api;else root.InCore=api;
})(typeof window!=='undefined'?window:globalThis);
