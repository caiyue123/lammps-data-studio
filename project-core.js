(function(root){
'use strict';
const FORMAT='lammps-molecular-studio',VERSION=1,MAX_BYTES=20*1024*1024;
const generatorKeys=['chains','length','aCount','sequence','seed','bond','spacing','padding','massA','massB'];
const simulationNumbers=['epsilonAA','epsilonAB','epsilonBB','sigmaAA','sigmaAB','sigmaBB','cutoff','k','rmax','bondEpsilon','bondSigma','harmonicK','r0','dt','temperature','seed','tdamp','pdamp','pressure','nvtSteps','nptSteps','settleSteps','bins','exchange','swaps','warmSteps','productionSteps','sampleEvery','sampleRepeat','thermoEvery','dumpEvery'];
const simulationChoices={bx:['p','f'],by:['p','f'],bz:['p','f'],pair:['wca','lj'],bond:['fene','harmonic'],direction:['x','y','z']};
const simulationBooleans=['minimize','npt','importUnitsConfirmed'];
const optionalSimulationBooleans=['reuseEquilibrated','reuseForceFieldConfirmed'];
const sections=['basicSettings','pairSettings','bondSettings','timeSettings','equilSettings','rnemdSettings'];
const fail=message=>{throw new Error(message)};
function object(v,label,required,optional=[]){
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype)fail(label+'格式无效。');
 const allowed=new Set([...required,...optional]);
 if(required.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>!allowed.has(k)))fail(label+'字段缺失或包含本版本不支持的内容。');
}
function text(v,label,max){if(typeof v!=='string'||v.length>max)fail(label+'须为不超过 '+max+' 字的文本。')}
function number(v,label,min=-1e15,max=1e15,integer=false){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isSafeInteger(v)))fail(label+'不是有效数值。')}
function bool(v,label){if(typeof v!=='boolean')fail(label+'须为布尔值。')}
function choice(v,label,values){if(!values.includes(v))fail(label+'选项无效。')}
function array(v,label,min,max){if(!Array.isArray(v)||v.length<min||v.length>max)fail(label+'数量无效。')}
// Preserve incomplete/out-of-range form values as drafts, not executable parameters.
function numericDraft(v,label){text(v,label,80);if(v!==''&&(!/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v)||!Number.isFinite(Number(v))))fail(label+'不是可恢复的数字草稿。')}
function checkModel(m){
 object(m,'结构',['title','atomTypes','bondTypes','masses','atoms','bonds','box','source'],['reference','velocities']);
 text(m.title,'结构标题',10000);choice(m.source,'结构来源',['generated','imported']);number(m.atomTypes,'粒子类型数',1,10000,true);number(m.bondTypes,'键类型数',0,10000,true);
 if(Object.hasOwn(m,'reference'))number(m.reference,'模型参考长度',Number.MIN_VALUE,1e15);
 array(m.box,'盒边界',3,3);for(const b of m.box){array(b,'轴边界',2,2);b.forEach(v=>number(v,'盒边界'));if(b[1]<=b[0])fail('盒边界上界必须大于下界。')}
 array(m.masses,'类型质量',m.atomTypes,m.atomTypes);const types=new Set();
 for(const a of m.masses){object(a,'质量行',['id','mass']);number(a.id,'质量类型',1,m.atomTypes,true);number(a.mass,'质量',Number.MIN_VALUE,Number.MAX_VALUE);if(types.has(a.id))fail('质量类型编号重复。');types.add(a.id)}
 array(m.atoms,'粒子',1,10000);const ids=new Set();
 for(const a of m.atoms){object(a,'粒子行',['id','mol','type','x','y','z'],['image']);number(a.id,'粒子 ID',1,Number.MAX_SAFE_INTEGER,true);number(a.mol,'分子 ID',0,Number.MAX_SAFE_INTEGER,true);number(a.type,'粒子类型',1,m.atomTypes,true);for(const k of ['x','y','z'])number(a[k],'粒子坐标');if(ids.has(a.id))fail('粒子 ID 重复。');ids.add(a.id);if(Object.hasOwn(a,'image')){array(a.image,'image flags',3,3);a.image.forEach(v=>number(v,'image flag',-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,true))}}
 array(m.bonds,'键',0,100000);const bondIds=new Set(),pairs=new Set();
 for(const b of m.bonds){object(b,'键行',['id','type','a','b']);number(b.id,'键 ID',1,Number.MAX_SAFE_INTEGER,true);number(b.type,'键类型',1,m.bondTypes,true);if(!ids.has(b.a)||!ids.has(b.b)||b.a===b.b)fail('键端点无效。');const pair=[b.a,b.b].sort((a,b)=>a-b).join(':');if(bondIds.has(b.id)||pairs.has(pair))fail('键编号或连接重复。');bondIds.add(b.id);pairs.add(pair)}
 if(Object.hasOwn(m,'velocities')){array(m.velocities,'速度',m.atoms.length,m.atoms.length);const seen=new Set();for(const v of m.velocities){object(v,'速度行',['id','vx','vy','vz']);number(v.id,'速度粒子 ID',1,Number.MAX_SAFE_INTEGER,true);if(!ids.has(v.id)||seen.has(v.id))fail('速度粒子 ID 不存在或重复。');seen.add(v.id);for(const k of ['vx','vy','vz'])number(v[k],'粒子速度')}}
 // Geometrically invalid coordinates remain editable after restoring an unfinished project.
 return ids;
}
function checkState(state){
 object(state,'工作区',['structure','simulation']);
 const s=state.structure;object(s,'结构编辑状态',['model','generator','dirty','checks','editor','view']);const ids=checkModel(s.model);
 object(s.generator,'生成器草稿',generatorKeys);for(const k of generatorKeys){if(k==='sequence')choice(s.generator[k],'链排列',['block','mixed','random']);else numericDraft(s.generator[k],'生成器 '+k)}
 bool(s.dirty,'结构待生成标记');object(s.checks,'几何检查设置',['periodic','reference']);bool(s.checks.periodic,'周期检查');numericDraft(s.checks.reference,'参考长度');
 const e=s.editor;object(e,'粒子编辑状态',['selectedId','searchId','atom','box','masses']);if(!ids.has(e.selectedId))fail('选中的粒子不存在。');numericDraft(e.searchId,'查找 ID');object(e.atom,'粒子编辑草稿',['mol','type','x','y','z']);Object.values(e.atom).forEach(v=>numericDraft(v,'粒子编辑值'));array(e.box,'盒边界草稿',3,3);for(const b of e.box){array(b,'轴边界草稿',2,2);b.forEach(v=>numericDraft(v,'盒边界草稿'))}array(e.masses,'质量草稿',s.model.masses.length,s.model.masses.length);e.masses.forEach(v=>numericDraft(v,'质量草稿'));
 const view=s.view;object(view,'结构视图',['angleX','angleY','zoom','showBonds','showBox','tab']);number(view.angleX,'旋转角',-1e9,1e9);number(view.angleY,'旋转角',-1e9,1e9);number(view.zoom,'缩放',.2,5);bool(view.showBonds,'键显示');bool(view.showBox,'盒显示');choice(view.tab,'结构详情页',['check','atoms','text','help']);
 const sim=state.simulation;object(sim,'模拟编辑状态',['mode','fields','expanded','workspace']);choice(sim.mode,'模拟流程',['check','equilibrate','rnemd']);choice(sim.workspace,'当前工作区',['structure','input']);
 object(sim.fields,'模拟参数草稿',[...simulationNumbers,...Object.keys(simulationChoices),...simulationBooleans],optionalSimulationBooleans);for(const k of simulationNumbers)numericDraft(sim.fields[k],'模拟参数 '+k);for(const [k,values] of Object.entries(simulationChoices))choice(sim.fields[k],k,values);for(const k of simulationBooleans)bool(sim.fields[k],k);for(const k of optionalSimulationBooleans)if(Object.hasOwn(sim.fields,k))bool(sim.fields[k],k);
 object(sim.expanded,'参数分组显示',sections);Object.values(sim.expanded).forEach(v=>bool(v,'分组显示'));
}
function validate(doc){
 if(!doc||doc.format!==FORMAT)fail('这不是分子结构工坊的工程文件。请打开 .lammps-project.json；data 文件和 parameters.json 请勿当作工程打开。');
 if(doc.version!==VERSION)fail('工程版本 '+String(doc.version)+' 暂不支持，当前支持版本 '+VERSION+'。原工程未被替换。');
 object(doc,'工程',['format','version','project','state','savedAt']);
 object(doc.project,'工程信息',['id','name','notes','createdAt']);text(doc.project.id,'工程标识',100);if(!doc.project.id)fail('工程标识不能为空。');text(doc.project.name,'工程名称',80);text(doc.project.notes,'备注',8000);
 for(const t of [doc.project.createdAt,doc.savedAt]){text(t,'时间',40);if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(t)||!Number.isFinite(Date.parse(t)))fail('工程时间格式无效。')}
 checkState(doc.state);return doc;
}
function parse(raw){if(typeof raw!=='string'||new TextEncoder().encode(raw).length>MAX_BYTES)fail('工程文件超过 20 MB 或不是文本。');let doc;try{doc=JSON.parse(raw.replace(/^\uFEFF/,''))}catch{fail('无法读取工程 JSON：文件可能损坏或不是工程文件。')}return validate(doc)}
function serialize(doc){validate(doc);const raw=JSON.stringify(doc);if(new TextEncoder().encode(raw).length>MAX_BYTES)fail('工程文件超过 20 MB。');return raw+'\n'}
function create(project,state,now=new Date().toISOString()){return validate({format:FORMAT,version:VERSION,project,state,savedAt:now})}
function filename(name){const s=name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,60)||'untitled';return 'project-'+s+'.lammps-project.json'}
const api={FORMAT,VERSION,MAX_BYTES,parse,serialize,create,validate,filename,checkState};if(typeof module!=='undefined')module.exports=api;else root.ProjectCore=api;
})(typeof window!=='undefined'?window:globalThis);
