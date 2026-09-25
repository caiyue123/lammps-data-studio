(() => {
'use strict';
const J=window.JobCore,S=window.StructureStudio,I=window.InputStudio,$=id=>document.getElementById(id),e=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let result=null;
function field(key,label,hint,type='text',opts=''){return '<label>'+label+'<input id="job-'+key+'" name="'+key+'" type="'+type+'" value="'+e(J.defaults[key])+'" '+opts+'><small>'+hint+'</small></label>'}
function select(key,label,items,hint=''){return '<label>'+label+'<select id="job-'+key+'" name="'+key+'">'+items.map(([v,t])=>'<option value="'+v+'"'+(J.defaults[key]===v?' selected':'')+'>'+t+'</option>').join('')+'</select><small>'+hint+'</small></label>'}
function num(k,l,h,min=1,max=1e9,step='1'){return field(k,l,h,'number','min="'+min+'" max="'+max+'" step="'+step+'"')}
const pair=(a,b)=>'<div class="field-pair">'+a+b+'</div>';
$('jobForm').innerHTML=
 '<fieldset><legend>01 · 这次从哪里开始</legend>'+select('mode','作业内容',[['fresh','从当前 data / in 新建运行'],['resume','从已有 restart 继续运行']])+'<div id="jobFreshInfo" class="note"></div><div id="jobResumeFields" hidden>'+field('resumeFile','restart 文件名','将文件复制到作业包同层；只写文件名。','text','placeholder="checkpoint-nvt.1000.restart" maxlength="120"')+
 select('origin','本站 LJ 珠簧模型中的来源阶段',[['unknown','尚未确认来源'],['nvt','中断的 NVT / checkpoint-nvt / continued'],['npt','中断的 NPT / checkpoint-npt / continued'],['nve','中断的 NVE / checkpoint-nve / continued'],['equilibrated','已结束平衡：equilibrated.restart'],['rnemd','RNEMD 交换阶段（本版不支持接续）']],'只支持本站 WCA/LJ + FENE/harmonic 教学模型。网页不读取二进制文件。')+
 select('ensemble','继续使用的积分方式',[['nvt','NVT · 保持温度与体积'],['npt','NPT · 控温并调节密度'],['nve','NVE · 不加控温控压']],'中断阶段自动匹配原积分器；平衡结束后可选新的阶段。')+
 '<div id="jobResumeTemperature">'+pair(num('temperature','目标温度 T*','与原阶段相同的恒定目标。',1e-6,1e6,'any'),num('tdamp','温度阻尼 / τ','保持原阶段参数。',1e-6,1e9,'any'))+'</div><div id="jobResumePressure">'+pair(num('pressure','目标压力 P*','iso 要求三向周期正交盒。',-1e6,1e6,'any'),num('pdamp','压力阻尼 / τ','保持原阶段参数。',1e-6,1e9,'any'))+'</div>'+num('extraSteps','新增步数','从 restart 中的原步数继续加上这些步；不是最终目标步数。')+pair(num('thermoEvery','日志间隔 / 步','输出温度、密度与能量。'),num('dumpEvery','轨迹间隔 / 步','输出 continued.lammpstrj。'))+'<p class="job-hint">保留原时间步长、步数、坐标与速度。续算不重新生成速度，不重新最小化。</p></div>'+num('checkpoint','检查点间隔 / 步','定期保存可续算状态；每个阶段的文件前缀不同。')+'</fieldset>'+
 '<fieldset><legend>02 · 学校平台与计算资源</legend>'+select('scheduler','作业调度器',[['unknown','暂不清楚，请先查学校示例'],['slurm','Slurm · sbatch'],['pbs','PBS Pro / OpenPBS · qsub']],'PBS 不包含 Torque 的 nodes:ppn 语法。')+field('name','作业名','英文开头，最多 15 位。','text','maxlength="15"')+pair(field('queue','分区 / 队列','留空使用平台默认值。','text','placeholder="按学校说明填写"'),field('account','计费账号','不是密码；平台不要求可留空。','text','placeholder="按学校说明填写"'))+pair(num('nodes','节点数','使用多少台计算节点。',1,1024),num('ranks','每节点 MPI 进程数','每个进程固定使用 1 个 CPU 线程。',1,1024))+num('memory','每节点内存 / GiB','这是每台节点的申请值，不是整个作业的总内存。',1,1048576)+pair(num('hours','墙钟时限 / 小时','计算机实际运行时限。',0,999),num('minutes','补充分钟','不是模拟步数或模拟时间。',0,59))+'</fieldset>'+
 '<fieldset><legend>03 · LAMMPS 软件环境</legend>'+select('environment','如何加载软件',[['unknown','暂不清楚，请先查学校示例'],['modules','module load 指定模块'],['existing','学校运行环境已提供 PATH']])+'<div id="jobModuleFields">'+field('modules','模块名（按顺序）','用空格或换行分隔；仅模块名，不写 module load。','text','placeholder="填写学校真实模块名"')+'</div>'+field('executable','LAMMPS 命令名或 Linux 绝对路径','例如学校提供的 lmp；不是你电脑上的 Windows 路径。','text','placeholder="按学校安装填写"')+select('launcher','并行启动方式',[['unknown','暂不清楚，请先查学校示例'],['srun','srun · 仅用于 Slurm'],['mpiexec','mpiexec · 须由学校集成调度器']],'MPI 与 LAMMPS 编译环境必须匹配；本版不配置 GPU、容器或自定义 MPI 参数。')+'</fieldset>';
function values(){return Object.fromEntries([...$('jobForm').elements].filter(el=>el.name).map(el=>[el.name,el.value]))}
function restore(p){for(const el of $('jobForm').elements)if(el.name)el.value=p[el.name];$('jobImportError').hidden=true;update();document.dispatchEvent(new Event('studiochange'))}
function show(){for(const prefix of ['structure','input','analysis','heat','trajectory']){$(prefix+'Workspace').hidden=true;$(prefix+'Step').setAttribute('aria-pressed',false)}$('jobWorkspace').hidden=false;$('jobStep').setAttribute('aria-pressed',true);update()}
$('jobStep').onclick=show;
function update(){
 const p=values(),resume=p.mode==='resume',sim=I.parameters();
 $('jobResumeFields').hidden=!resume;$('jobFreshInfo').hidden=resume;$('jobModuleFields').hidden=p.environment!=='modules';$('jobResumeTemperature').hidden=p.ensemble==='nve';$('jobResumePressure').hidden=p.ensemble!=='npt';$('job-ensemble').disabled=['nvt','npt','nve'].includes(p.origin);
 $('jobFreshInfo').textContent='使用当前 '+S.getModel().atoms.length.toLocaleString()+' 粒子结构 · '+(sim.mode==='rnemd'&&sim.reuseEquilibrated?'已导入速度 → NVE / RNEMD':({check:'run 0 读取检查',equilibrate:'平衡模拟',rnemd:'先平衡再 RNEMD'}[sim.mode]))+'。要改变力场、时间步或模拟步数，请到“02 模拟 in”。';
 result=J.build(p,S.getModel(),sim,S.isDirty());
 $('jobValidation').innerHTML=result.errors.length?'<div class="error error-box"><strong>还需填写或调整</strong><ul>'+result.errors.map(x=>'<li>'+e(x)+'</li>').join('')+'</ul></div>':'<div class="pass">文件生成检查通过 · 通用模板尚未在学校超算验证</div>';
 $('jobWarnings').innerHTML='<summary>适用范围与本次提示 · '+result.warnings.length+' 条</summary><ul>'+result.warnings.map(x=>'<li>'+e(x)+'</li>').join('')+'</ul>';
 const total=Number(p.nodes)*Number(p.ranks);
 $('jobResourceSummary').textContent=Number.isSafeInteger(total)&&total>0?total.toLocaleString()+' 个 MPI 进程 · 1 线程 / 进程 · 时限 '+(p.hours||'…')+' 小时 '+(p.minutes||'…')+' 分':'请填写资源数值';
 $('jobStageSummary').textContent=resume?'restart → 恢复积分器 → 增加 '+(p.extraSteps||'…')+' 步 → 保存 continued.restart':'当前 data + in → 分阶段检查点 → 原定输出';
 $('jobCode').textContent=result.job||'# 请先完成左侧设置；也可载入教学示例认识提交脚本。';$('jobInputCode').textContent=result.input||'# 参数通过检查后显示 '+(resume?'read_restart 续算脚本。':'包含检查点设置的配套 in。');$('jobInputName').textContent=resume?'resume.in':'in.lammps';
 for(const id of ['downloadJob','downloadJobZip','copyJob','downloadJobInput'])$(id).disabled=!!result.errors.length;
 $('jobFiles').innerHTML=result.files?Object.keys(result.files).map(name=>'<code>'+e(name)+'</code>').join('')+(resume?'<span>另需手动放入 '+e(p.resumeFile)+'（不在 ZIP 中）</span>':''):'<span>设置完成后显示配套文件清单。</span>';
 const slurm=p.scheduler==='slurm';$('jobCommands').textContent=p.scheduler==='unknown'?'先获取学校示例，确认用 sbatch 还是 qsub。':(slurm?'sbatch submit.sh\nsqueue -j 作业ID\nsacct -j 作业ID':'qsub submit.sh\nqstat -f 作业ID\nqstat -xf 作业ID');
}
$('jobForm').onsubmit=ev=>ev.preventDefault();$('jobForm').oninput=update;$('jobForm').onchange=ev=>{if(ev.target.name==='origin'&&['nvt','npt','nve'].includes(ev.target.value))$('job-ensemble').value=ev.target.value;update()};
document.addEventListener('structurechange',()=>{if(!$('jobWorkspace').hidden)update()});
$('jobDemo').onclick=()=>{restore({...values(),scheduler:'slurm',environment:'existing',executable:'lmp',launcher:'srun',name:'md-study',queue:'',account:'',nodes:'1',ranks:'4',memory:'4',hours:'1',minutes:'0'});S.toast('已填入 Slurm 教学资源示例；这些值不是学校平台配置。')};
$('jobReset').onclick=()=>{restore({...J.defaults});S.toast('作业设置已恢复为空平台配置。')};
function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);S.toast('已发起下载 '+name+'，请在浏览器下载记录中确认。')}
$('downloadJob').onclick=()=>{update();if(!result.errors.length)download(result.job,'submit.sh','text/plain;charset=utf-8')};
$('downloadJobInput').onclick=()=>{update();if(!result.errors.length)download(result.input,result.p.mode==='resume'?'resume.in':'in.lammps','text/plain;charset=utf-8')};
$('downloadJobZip').onclick=()=>{update();if(!result.errors.length)download(J.bundle(result),'lammps-'+result.p.mode+'-'+result.p.scheduler+'.zip','application/zip')};
$('copyJob').onclick=async()=>{update();if(result.errors.length)return;try{await navigator.clipboard.writeText(result.job);S.toast('提交脚本已复制。')}catch{S.toast('自动复制失败，可选择脚本原文手动复制。')}};
$('saveJobSettings').onclick=()=>{try{download(J.saveSettings(values()),'job-settings.json','application/json;charset=utf-8')}catch(err){$('jobImportError').textContent=err.message;$('jobImportError').hidden=false}};
$('openJobSettings').onclick=()=>$('jobSettingsFile').click();let importSerial=0,reading=false;
$('jobSettingsFile').onchange=async ev=>{const file=ev.target.files[0];ev.target.value='';if(!file)return;const serial=++importSerial;reading=true;try{if(file.size>65536)throw new Error('作业设置文件超过 64 KB。');const p=J.readSettings(await file.text());if(serial!==importSerial)return;restore(p);$('jobImportError').hidden=true;S.toast('作业面板已恢复；结构与 in 参数不变。')}catch(err){if(serial===importSerial){$('jobImportError').textContent=err.message+' 当前设置保留。';$('jobImportError').hidden=false}}finally{if(serial===importSerial)reading=false}};
update();
window.JobStudio={capture:values,isReading:()=>reading,restore(p){J.saveSettings(p);++importSerial;reading=false;restore(p)}};
})();
