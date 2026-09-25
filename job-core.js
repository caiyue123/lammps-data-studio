(function(root){
'use strict';
const I=typeof module!=='undefined'?require('./in-core.js'):root.InCore,D=typeof module!=='undefined'?require('./core.js'):root.DataCore;
const defaults=Object.freeze({mode:'fresh',scheduler:'unknown',name:'md-study',queue:'',account:'',nodes:'1',ranks:'4',memory:'4',hours:'1',minutes:'0',environment:'unknown',modules:'',executable:'',launcher:'unknown',checkpoint:'1000',resumeFile:'',origin:'unknown',ensemble:'nvt',temperature:'1',tdamp:'0.3',pressure:'1',pdamp:'3',extraSteps:'1000',thermoEvery:'100',dumpEvery:'200'});
const choices={mode:['fresh','resume'],scheduler:['unknown','slurm','pbs'],environment:['unknown','modules','existing'],launcher:['unknown','srun','mpiexec'],origin:['unknown','nvt','npt','nve','equilibrated','rnemd'],ensemble:['nvt','npt','nve']};
const numericKeys=['nodes','ranks','memory','hours','minutes','checkpoint','temperature','tdamp','pressure','pdamp','extraSteps','thermoEvery','dumpEvery'];
const fail=m=>{throw new Error(m)},quote=s=>"'"+String(s).replace(/'/g,"'\\''")+"'";
function validateDraft(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==Object.keys(defaults).length||Object.keys(defaults).some(k=>!Object.hasOwn(input,k)))fail('作业设置字段不完整或版本不兼容。');
 for(const [k,v] of Object.entries(input)){if(typeof v!=='string'||v.length>2000)fail('作业设置须为有限长度文本。');if(choices[k]&&!choices[k].includes(v))fail('作业选项无效：'+k);if(numericKeys.includes(k)&&v!==''&&(!/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v)||!Number.isFinite(Number(v))))fail('数字草稿无效：'+k)}
 return input;
}
function saveSettings(input){validateDraft(input);return JSON.stringify({format:'lammps-job-settings',version:1,settings:input},null,2)+'\n'}
function readSettings(text){if(typeof text!=='string'||new TextEncoder().encode(text).length>65536)fail('作业设置文件超过 64 KB。');let d;try{d=JSON.parse(text.replace(/^\uFEFF/,''))}catch{fail('无法读取作业设置 JSON。')}if(!d||d.format!=='lammps-job-settings'||d.version!==1||Object.keys(d).sort().join(',')!=='format,settings,version')fail('请选择本网站下载的作业设置文件（版本 1）。');return validateDraft(d.settings)}
function inspect(input){
 const p={...defaults,...input},errors=[],warnings=[];const err=m=>errors.push(m);
 try{validateDraft(p)}catch(e){return {p,errors:[e.message],warnings}}
 function integer(k,label,min,max){const n=Number(p[k]);if(!p[k].trim()||!Number.isSafeInteger(n)||n<min||n>max)err(label+'须为 '+min+'～'+max+' 的整数。')}
 function finite(k,label,min,max){const n=Number(p[k]);if(!p[k].trim()||!Number.isFinite(n)||n<min||n>max)err(label+'须为 '+min+'～'+max+' 的有限数。')}
 if(p.scheduler==='unknown')err('请根据学校说明选择 Slurm 或 PBS Pro / OpenPBS；暂不支持 Torque 的 nodes:ppn 语法。');
 if(!/^[A-Za-z][A-Za-z0-9_-]{0,14}$/.test(p.name))err('作业名用英文字母开头，最多 15 位字母、数字、下划线或短横线。');
 for(const k of ['queue','account'])if(p[k]&&!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(p[k]))err((k==='queue'?'分区 / 队列':'计费账号')+'只接受字母、数字、点、下划线或短横线。');
 for(const [k,label,min,max] of [['nodes','节点数',1,1024],['ranks','每节点 MPI 进程数',1,1024],['memory','每节点内存 / GiB',1,1048576],['hours','墙钟小时数',0,999],['minutes','墙钟分钟数',0,59],['checkpoint','检查点间隔',1,1e9]])integer(k,label,min,max);
 if(Number(p.hours)*60+Number(p.minutes)<1)err('墙钟时限至少为 1 分钟。');
 if(p.environment==='unknown')err('请选择软件环境加载方式；模块名和可执行文件须以学校提供的配置为准。');
 if(p.environment==='modules'&&(!p.modules.trim()||p.modules.trim().split(/\s+/).some(s=>!/^[A-Za-z0-9][A-Za-z0-9_./+-]*$/.test(s))))err('填写真实模块名，以空格或换行分隔；不要填写 module load 命令本身。');
 if(!(/^[A-Za-z0-9_][A-Za-z0-9_.+-]*$/.test(p.executable)||/^\/[A-Za-z0-9_./+-]+$/.test(p.executable)))err('填写 LAMMPS 命令名或 Linux 绝对路径，不含空格和额外参数。');
 if(p.launcher==='unknown')err('选择学校示例采用的启动方式：srun 或与调度器集成的 mpiexec。');
 if(p.scheduler==='pbs'&&p.launcher==='srun')err('PBS 模板不能使用 Slurm 的 srun。请核对学校的 MPI 启动方式。');
 if(!p.queue)warnings.push('分区 / 队列留空，将使用平台默认值；有的平台要求显式指定。');
 if(!p.account)warnings.push('计费账号留空；如平台要求，请按学校示例填写。');
 warnings.push('这是通用 CPU / MPI 模板，每个 MPI 进程使用 1 个 CPU 线程。实际可用节点、内存、模块和启动器需按学校配置核对。');
 if(p.mode==='resume'){
  if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/.test(p.resumeFile)||['model.data','in.lammps','resume.in','submit.sh','job-settings.json','parameters.json','README.txt','log.lammps','continued.data','continued.lammpstrj'].includes(p.resumeFile))err('restart 文件名只写当前目录下的独立文件名，不含路径、通配符、空格或文本输出保留名。');
  if(p.origin==='unknown')err('请明确 restart 来源阶段。本版只支持本站 LJ 珠簧模型（WCA/LJ + FENE/harmonic）的续算。');
  if(p.origin==='rnemd')err('暂不支持中断 RNEMD 的连续采样恢复：交换累计能量和平均采样状态不会完整保存在 restart 中。');
  if(['nvt','npt','nve'].includes(p.origin)&&p.ensemble!==p.origin)err('中断阶段的续算须使用原积分器；阶段结束的 equilibrated.restart 才可选择新的积分方式。');
  for(const [k,label] of [['extraSteps','新增运行步数'],['thermoEvery','日志间隔'],['dumpEvery','轨迹间隔']])integer(k,label,1,1e9);
  if(p.ensemble!=='nve'){finite('temperature','目标温度',1e-6,1e6);finite('tdamp','温度阻尼时间',1e-6,1e9)}
  if(p.ensemble==='npt'){finite('pressure','目标压力',-1e6,1e6);finite('pdamp','压力阻尼时间',1e-6,1e9)}
  warnings.push('网页不读取二进制 restart。来源、单位、边界和目标温压需要核对原脚本；本版不适用于任意手写 in 或真实材料力场。');
  warnings.push('保留 restart 中的坐标、速度、时间步长和步数；新增步数是在原步数上继续推进。请优先使用写出 restart 的同一 LAMMPS 可执行版本和平台。');
  warnings.push('续算后 thermo Time 的起算基准可能改变；对照前后日志请先用 Step 对齐，不直接拼接 Time。');
  if(p.ensemble==='npt')warnings.push('本版使用 NPT iso，restart 必须为三向周期正交盒。');
  if(p.origin!=='equilibrated')warnings.push('中断 NVT/NPT 使用原 fix ID 与样式，并须填写相同恒定目标与阻尼时间；升降温/变压程序不在本版恢复范围。');
  if(Number(p.extraSteps)<Number(p.checkpoint))warnings.push('新增步数短于检查点间隔；可能没有中途检查点，正常结束时仍写 continued.restart。');
 }
 return {p,errors,warnings};
}
function checkpoints(script,every){
 const fixes=new Map(),out=[];
 for(const line of script.trimEnd().split('\n')){
  const fix=line.match(/^fix (\S+) all (\S+)/),unfix=line.match(/^unfix (\S+)/);if(fix)fixes.set(fix[1],fix[2]);if(unfix)fixes.delete(unfix[1]);
  const run=line.match(/^run (\d+)$/),styles=[...fixes.values()],stage=styles.includes('thermal/conductivity')?null:['npt','nvt','nve'].find(s=>styles.includes(s));
  if(run&&Number(run[1])>0&&stage){out.push('# Periodic checkpoints for '+stage.toUpperCase()+': same fix remains active.','restart '+every+' checkpoint-'+stage+'.*.restart',line,'write_restart checkpoint-'+stage+'.end.restart','restart 0')}
  else out.push(line);
 }
 return out.join('\n')+'\n';
}
function resumeInput(p){
 const f=x=>Number(x).toString(),id={nvt:'thermostat',npt:'barostat',nve:'integrator'}[p.ensemble];
 const fix='fix '+id+' all '+p.ensemble+(p.ensemble==='nve'?'':' temp '+f(p.temperature)+' '+f(p.temperature)+' '+f(p.tdamp))+(p.ensemble==='npt'?' iso '+f(p.pressure)+' '+f(p.pressure)+' '+f(p.pdamp):'');
 return ['# Molecular Studio: continue a supported LJ bead-spring restart.','# Keep the original timestep and velocities. The run adds steps.','clear','read_restart '+p.resumeFile,'neighbor 0.3 bin','neigh_modify every 1 delay 0 check yes','# Restore the matching integrator BEFORE the first run.',fix,'thermo '+Number(p.thermoEvery),'thermo_style custom step time temp press pe ke etotal density vol','thermo_modify norm no','dump resumedtraj all custom '+Number(p.dumpEvery)+' continued.lammpstrj id mol type x y z ix iy iz','dump_modify resumedtraj sort id','restart '+Number(p.checkpoint)+' checkpoint-resume.*.restart','run '+Number(p.extraSteps),'# Write while the fix is still active so its state can be saved.','write_restart continued.restart','write_data continued.data nocoeff','restart 0','undump resumedtraj','unfix '+id,''].join('\n');
}
function schedulerScript(p){
 const slurm=p.scheduler==='slurm',ranks=Number(p.nodes)*Number(p.ranks),time=String(Number(p.hours)).padStart(2,'0')+':'+String(Number(p.minutes)).padStart(2,'0')+':00';
 const a=['#!/bin/bash','# Molecular Studio: generic template; adapt to your school platform.'];
 if(slurm){a.push('#SBATCH --job-name='+p.name,'#SBATCH --nodes='+Number(p.nodes),'#SBATCH --ntasks-per-node='+Number(p.ranks),'#SBATCH --ntasks='+ranks,'#SBATCH --cpus-per-task=1','#SBATCH --mem='+Number(p.memory)+'G','#SBATCH --time='+time,'#SBATCH --output=slurm-%j.out','#SBATCH --error=slurm-%j.err');if(p.queue)a.push('#SBATCH --partition='+p.queue);if(p.account)a.push('#SBATCH --account='+p.account)}
 else {a.push('#PBS -S /bin/bash','#PBS -N '+p.name,'#PBS -l select='+Number(p.nodes)+':ncpus='+Number(p.ranks)+':mpiprocs='+Number(p.ranks)+':ompthreads=1:mem='+Number(p.memory)+'gb','#PBS -l place=scatter','#PBS -l walltime='+time,'#PBS -j oe');if(p.queue)a.push('#PBS -q '+p.queue);if(p.account)a.push('#PBS -A '+p.account)}
 a.push('','# Stop on a failed command; never silently continue a failed simulation.','set -eo pipefail',slurm?': "${SLURM_JOB_ID:?Submit with sbatch, not bash on a login node}"':': "${PBS_JOBID:?Submit with qsub, not bash on a login node}"',slurm?'SUBMIT_DIR="${SLURM_SUBMIT_DIR:?Missing submission directory}"':'SUBMIT_DIR="${PBS_O_WORKDIR:?Missing submission directory}"','cd -- "$SUBMIT_DIR"');
 if(p.environment==='modules')a.push('type module >/dev/null 2>&1 || { echo "Module command unavailable; follow your site setup instructions." >&2; exit 2; }','module load '+p.modules.trim().split(/\s+/).map(quote).join(' '));
 a.push('set -u','export OMP_NUM_THREADS=1','LAMMPS_EXE='+quote(p.executable),'command -v "$LAMMPS_EXE" >/dev/null 2>&1 || { echo "LAMMPS executable not found." >&2; exit 2; }','command -v '+p.launcher+' >/dev/null 2>&1 || { echo "MPI launcher not found." >&2; exit 2; }');
 const file=p.mode==='fresh'?'in.lammps':'resume.in',dependency=p.mode==='fresh'?'model.data':p.resumeFile;
 a.push('for required in '+[file,dependency,'job-settings.json',...(p.mode==='fresh'?['parameters.json']:[])].map(quote).join(' ')+'; do','  test -s "$required" || { echo "Missing or empty input: $required" >&2; exit 2; }','done','# A unique directory keeps earlier output intact, including after requeue.','RUN_DIR=$(mktemp -d "$SUBMIT_DIR/run-'+p.name+'-'+(slurm?'${SLURM_JOB_ID}':'${PBS_JOBID}')+'-XXXXXX")','cp -- '+[file,dependency,'job-settings.json',...(p.mode==='fresh'?['parameters.json']:[])].map(quote).join(' ')+' "$RUN_DIR/"','cd -- "$RUN_DIR"','printf "Output directory: %s\\n" "$RUN_DIR"','# MPI runtime must be the one provided with the selected LAMMPS build.',(p.launcher==='srun'?'srun --ntasks='+ranks:'mpiexec -n '+ranks)+' "$LAMMPS_EXE" -in '+quote(file)+' -log log.lammps','');
 return a.join('\n');
}
function build(input,model,parameters,dirty=false){
 const r=inspect(input),p=r.p;let simulation=null,script='';
 if(p.mode==='fresh'){
  simulation=I.build(model,parameters,dirty);r.errors.push(...simulation.errors);r.warnings.push(...simulation.warnings);
  if(!simulation.errors.length){script=checkpoints(simulation.script,Number(p.checkpoint));if(simulation.p.mode==='check')r.warnings.push('当前是 run 0 读取检查，不推进时间，也不生成动力学检查点。');if(simulation.p.mode==='rnemd')r.warnings.push((simulation.p.reuseEquilibrated?'本次跳过 NVT/NPT；NVE 预运行':'本次 RNEMD 的 NVT/NPT/NVE 预运行')+'写中途检查点；交换阶段只保留原来的结束文件，尚不支持连续采样恢复。')}
 }else if(!r.errors.length)script=resumeInput(p);
 if(r.errors.length)return {...r,input:'',job:'',files:null,simulation};
 const job=schedulerScript(p),files={'submit.sh':job,[p.mode==='fresh'?'in.lammps':'resume.in']:script,'job-settings.json':saveSettings(p)};
 if(p.mode==='fresh'){files['model.data']=D.serialize(model);files['parameters.json']=JSON.stringify({formatVersion:1,parameters:simulation.p,atoms:model.atoms.length,bonds:model.bonds.length},null,2)+'\n'}
 const result={...r,input:script,job,files,simulation};files['README.txt']=readme(result);return result;
}
function readme(result){const {p,warnings}=result,submit=p.scheduler==='slurm'?'sbatch submit.sh':'qsub submit.sh';return ['分子结构工坊 · 超算作业包','这是通用模板，尚未在学校平台验证。网站只生成文件，不连接、上传或提交超算任务。','','准备与提交','1. 将 ZIP 解压到一个新的共享工作目录。不要改变包内固定文件名。',p.mode==='resume'?'2. 将原来的二进制 '+p.resumeFile+' 复制到包内同层目录。本 ZIP 不包含也不生成这个文件。':'2. model.data 与 in.lammps 已配套包含；这里使用第 02 页当前参数。','3. 按学校示例核对调度器、分区/队列、计费账号、节点、内存、墙钟时限、模块、LAMMPS 与 MPI 启动方式。','4. 在该目录运行：'+submit,'5. 保存返回的作业 ID；返回 ID 只代表已提交，不代表模拟已运行。',p.scheduler==='slurm'?'6. 用 squeue -j 作业ID 查看排队/运行；完成后可用 sacct -j 作业ID 查看状态与退出码（平台需启用记账）。':'6. 用 qstat -f 作业ID 查看状态；完成后如平台保留历史，可用 qstat -xf 作业ID。','7. 调度器输出中会打印 Output directory。模拟文件位于新建 run-... 目录，下载其中的 log.lammps 到第 03 页分析。','8. 调度器成功退出与 log 中的 Loop time 都不能证明物理收敛。','','资源口径','节点数 '+p.nodes+' × 每节点 MPI 进程数 '+p.ranks+' = '+(Number(p.nodes)*Number(p.ranks))+' 个 MPI 进程。','每个进程 1 个 CPU 线程；每节点内存 '+p.memory+' GiB。墙钟 '+p.hours+' 小时 '+p.minutes+' 分钟是计算机时限，不是模拟时间。','进程数不等于粒子数；10,000 粒子不需要申请 10,000 个进程。实际加速比需短作业测量。','Slurm 使用 --mem 每节点内存。PBS Pro/OpenPBS 使用 select 资源块与 place=scatter；不适用于 Torque 的 nodes:ppn 模板。','','检查点与续算','NVT/NPT/NVE 预运行按指定间隔写 checkpoint-阶段.步数.restart；阶段末尾另写 checkpoint-阶段.end.restart，写出时 fix 仍在。','检查点间隔按绝对步数的整数倍触发，不是从每段第一步起计数。不到间隔就中断时可能还没有检查点。','新目录保留旧结果；并不保证机器故障时最后一个 checkpoint 已完整写出。先检查文件及一次短续算。','中断阶段选对应 NVT/NPT/NVE，保持原 fix ID、恒定目标温压与阻尼参数；续算保留原 dt、步数和速度，只增加填写的步数。','原脚本的 equilibrated.restart 在 unfix 之后写出：可从该状态开始新的 NVT/NPT/NVE 阶段，但不含已取消恒温/恒压器的状态。','继续运行仍保持积分器启用时写 continued.restart，后续来源应选对应 NVT/NPT/NVE。','run 0 不产生动态检查点。RNEMD 交换/平均采样状态不完整保存在 restart，本版不拼接中断的 RNEMD 累计数据。','本版续算仅适用于本站 units lj、molecular、WCA/LJ + FENE/harmonic 教学模型。restart 请使用相同 LAMMPS 版本与平台读取；修改 MPI 数量可能改变轨迹。','','保存设置','job-settings.json 只保存作业面板，可在第 04 页重新导入；不包含结构或 in 参数。结构/in 请另存顶部工程文件。','文件采用 UTF-8 / LF。脚本不含学校密码、账号令牌或自动登录。','','本次提示',...warnings.map(s=>'- '+s),'','官方参考','https://docs.lammps.org/read_restart.html','https://docs.lammps.org/restart.html','https://docs.lammps.org/fix_nh.html','https://docs.lammps.org/fix_thermal_conductivity.html','https://slurm.schedmd.com/sbatch.html','https://help.altair.com/2024.1.0/PBS%20Professional/PBSUserGuide2024.1.pdf',''].join('\n')}
function bundle(result){if(result.errors.length||!result.files)fail('请先解决作业参数错误。');return I.zip(result.files)}
const api={defaults,inspect,build,checkpoints,resumeInput,schedulerScript,readme,bundle,saveSettings,readSettings};if(typeof module!=='undefined')module.exports=api;else root.JobCore=api;
})(typeof window!=='undefined'?window:globalThis);
