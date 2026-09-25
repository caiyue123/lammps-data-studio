(function(root){
'use strict';
const node=typeof module!=='undefined',P=node?require('./project-core'):root.ProjectCore,J=node?require('./job-core'):root.JobCore,L=node?require('./log-core'):root.LogCore,H=node?require('./heat-core'):root.HeatCore,T=node?require('./trajectory-core'):root.TrajectoryCore;
const FORMAT='lammps-complete-experiment',VERSION=2,MAX_BYTES=150*1024*1024;
function need(ok,s){if(!ok)throw new Error(s)}
function exact(o,keys,label){need(o&&typeof o==='object'&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k)),label+'字段缺失或包含不支持的内容。')}
function time(t){need(typeof t==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(t)&&Number.isFinite(Date.parse(t)),'实验时间格式无效。')}
function validate(d){
 exact(d,['format','version','experiment','savedAt','workspace','project','job','log','heat',...(d?.version===2?['trajectory']:[])],'完整实验');need(d.format===FORMAT&&[1,2].includes(d.version),'请选择本网站的完整实验文件（版本 1 或 2）；单项工程/分析文件请从对应入口打开。');
 exact(d.experiment,['id','revision','createdAt','parentId'],'实验信息');const m=d.experiment;need(typeof m.id==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(m.id),'实验编号无效。');need(m.parentId===null||typeof m.parentId==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(m.parentId),'实验来源编号无效。');need(Number.isSafeInteger(m.revision)&&m.revision>=1,'实验版本须为正整数。');time(m.createdAt);time(d.savedAt);
 need(['structure','input','analysis','job','heat',...(d.version===2?['trajectory']:[])].includes(d.workspace),'实验工作页无效。');P.validate(d.project);P.serialize(d.project);J.saveSettings(d.job);
 if(d.log!==null)L.readSession(JSON.stringify(d.log));if(d.heat!==null)H.readSession(JSON.stringify(d.heat));if(d.version===2&&d.trajectory!==null)T.readSession(d.trajectory);return d;
}
function serialize(d){validate(d);const s=JSON.stringify(d);need(new TextEncoder().encode(s).length<=MAX_BYTES,'完整实验超过 150 MB，请分别保存大结果文件。');return s+'\n'}
function parse(s){need(typeof s==='string'&&new TextEncoder().encode(s).length<=MAX_BYTES,'完整实验文件最大 150 MB。');let d;try{d=JSON.parse(s.replace(/^\uFEFF/,''))}catch{throw new Error('完整实验不是有效 JSON。')}return validate(d)}
function summary(d){const m=d.project.state.structure.model;return {id:d.experiment.id,revision:d.experiment.revision,savedAt:d.savedAt,name:d.project.project.name||'未命名实验',atoms:m.atoms.length,mode:d.project.state.simulation.mode,logName:d.log?.fileName||'',heatNames:d.heat?.names||[],job:d.job.scheduler,trajectoryName:d.trajectory?.name||'',notes:d.project.project.notes}}
function fork(d,id,now,{empty=false}={}){const n=structuredClone(d);n.version=VERSION;n.trajectory??=null;n.experiment={id,revision:1,createdAt:now,parentId:d.experiment.id};n.savedAt=now;n.project.project.id=id;n.project.project.createdAt=now;n.project.savedAt=now;if(empty){n.project.project.name=(n.project.project.name+' · 新实验').slice(0,80);n.project.project.notes='';n.job={...n.job,mode:'fresh',resumeFile:'',origin:'unknown'};n.log=null;n.heat=null;n.trajectory=null;n.workspace='input'}return validate(n)}
function inputChanged(a,b){return JSON.stringify({model:a.project.state.structure.model,simulation:a.project.state.simulation.fields,mode:a.project.state.simulation.mode})!==JSON.stringify({model:b.project.state.structure.model,simulation:b.project.state.simulation.fields,mode:b.project.state.simulation.mode})}
function filename(d){const name=(d.project.project.name||'untitled').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,45);return 'experiment-'+name+'-r'+d.experiment.revision+'.lammps-experiment.json'}
const api={FORMAT,VERSION,MAX_BYTES,validate,serialize,parse,summary,fork,inputChanged,filename};if(node)module.exports=api;else root.ExperimentCore=api;
})(typeof window!=='undefined'?window:globalThis);
