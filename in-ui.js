(() => {
'use strict';
const I=window.InCore,S=window.StructureStudio,$=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let mode='check',result=null,lastModel=S.getModel(),activeCommand='',editorWorkspace='structure';
const descriptions={};
function num(key,label,hint,command,{min=0.000001,max=1000000,step='any'}={}){
 descriptions[key]={label,hint,command};return `<label>${label}<input id="in-${key}" name="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${I.defaults[key]}" required data-command="${command}"><small>${hint}</small></label>`;
}
function steps(key,label,hint){return num(key,label,hint,'run',{min:1,max:1e9,step:1})}
function select(key,label,options,hint,command){descriptions[key]={label,hint,command};return `<label>${label}<select id="in-${key}" name="${key}" data-command="${command}">${options.map(([value,text])=>`<option value="${value}" ${value===I.defaults[key]?'selected':''}>${text}</option>`).join('')}</select><small>${hint}</small></label>`}
function check(key,label,hint,command){descriptions[key]={label,hint,command};return `<label class="check"><input id="in-${key}" name="${key}" type="checkbox" ${I.defaults[key]?'checked':''} data-command="${command}">${label}</label><p>${hint}</p>`}
const pair=(a,b)=>`<div class="field-pair">${a}${b}</div>`;
const detail=(id,title,code,html,open=true)=>`<details id="${id}" ${open?'open':''}><summary>${title}<code>${code}</code></summary>${html}</details>`;
let matrix='<table class="force-matrix"><thead><tr><th>作用对</th><th>能量尺度 ε</th><th>长度尺度 σ</th></tr></thead><tbody>';
for(const key of ['AA','AB','BB']){matrix+='<tr><th scope="row">'+key[0]+'–'+key[1]+'</th>';for(const [prefix,title,hint] of [['epsilon','ε','控制这一对粒子的相互作用能量尺度。WCA 下仅有排斥。'],['sigma','σ','LJ 长度尺度，不是 data 中的初始键长。']]){const k=prefix+key;descriptions[k]={label:key+' '+title,hint,command:'pair_coeff'};matrix+=`<td><input type="number" aria-label="${key} ${title}" name="${k}" id="in-${k}" min="0.000001" max="1000000" step="any" value="1" required data-command="pair_coeff"></td>`}matrix+='</tr>'}matrix+='</tbody></table>';
$('inputForm').innerHTML=
 detail('basicSettings','01 · 单位与边界','units / boundary',
 '<div class="unit-label"><strong>LJ 约化单位</strong> · units lj</div><p>温度 T*、长度 σ、时间 τ。本模板固定使用 LJ，不自动换算成 K、Å 或 ps。</p><div id="importUnitCheck" hidden>'+check('importUnitsConfirmed','确认导入结构使用 LJ 约化单位','请对照原始模型的单位；仅修改单位名称不会转换数值。','units')+'</div><div class="boundary-fields">'+['x','y','z'].map(a=>select('b'+a,a.toUpperCase()+' 边界',[['p','p · 周期'],['f','f · 非周期']],'','boundary')).join('')+'</div><p>周期边界会连接盒子的相对两侧。固定边界不等于反射墙。</p>')+
 detail('pairSettings','02 · 非键相互作用','pair_style / pair_coeff',
 select('pair','粒子之间怎样作用',[['wca','WCA · 只有排斥'],['lj','LJ · 包含吸引尾部']],'WCA 的截断位置自动取 2^(1/6) × σ。','pair_style')+matrix+'<div id="ljCutoff">'+num('cutoff','截断半径 / σ','每一对粒子的实际截断半径 = 该值 × 对应 σ。','pair_coeff',{min:1.13,max:10})+'</div><p>所有作用对都显式写出，不依赖自动混合规则。两种模式均将截断处势能平移为零。</p>')+
 detail('bondSettings','03 · 链内键作用','bond_style / bond_coeff',
 select('bond','用什么势连接粒子',[['fene','FENE · 有限伸长弹簧'],['harmonic','Harmonic · 谐键']],'这控制键的力学行为；连接关系仍由 data 的 Bonds 决定。','bond_style')+
 '<div id="feneFields">'+pair(num('k','FENE 刚度 K','数值越大，键越难拉伸。','bond_coeff'),num('rmax','最大伸长 R₀','不是平衡键长；初始键长必须小于它。','bond_coeff'))+pair(num('bondEpsilon','键内排斥 ε','FENE 自带短程 LJ 排斥能量尺度。','bond_coeff'),num('bondSigma','键内排斥 σ','FENE 自带短程 LJ 排斥长度尺度。','bond_coeff'))+'<p>自动使用 special_bonds fene，避免重复计算直接相连粒子的非键作用。</p></div>'+
 '<div id="harmonicFields">'+pair(num('harmonicK','谐键刚度 K','LAMMPS 中 E = K(r − r₀)²，K 已含 1/2 因子。','bond_coeff'),num('r0','平衡键长 r₀','与生成 data 时的初始键长是不同概念。','bond_coeff'))+'</div>')+
 detail('timeSettings','04 · 时间与输出','timestep / thermo / dump',
 num('dt','时间步长 Δt','每一步推进多少 τ；不是输出间隔，也不是电脑耗时。','timestep',{min:1e-7,max:1})+pair(steps('thermoEvery','日志间隔 / 步','多少步输出一次温度、能量等。'),steps('dumpEvery','轨迹间隔 / 步','多少步保存一次粒子坐标。'))+'<p>run 0 模式不生成轨迹。动力学模式会额外写出 restart 与 data。</p>',false)+
 detail('equilSettings','05 · 最小化与平衡','minimize / fix nvt / fix npt',
 check('minimize','运行前先最小化能量','降低初始势能；不等于在目标温度下完成平衡。','minimize')+
 pair(num('temperature','目标温度 T*','LJ 约化温度，不是开尔文。','fix'),num('tdamp','温度阻尼时间','达到目标温度的调节时间尺度，单位 τ。','fix',{min:1e-6,max:1e9}))+
 steps('nvtSteps','NVT 平衡步数','粒子数、盒体积固定，控制温度。')+
 num('seed','速度随机种子','相同种子可重复初始速度；并行运行不保证逐位一致。','velocity',{min:1,max:899999999,step:1})+
 check('npt','接着进行 NPT 调密度','控制温度和压力，三个盒长等比例调整；要求三向周期边界。','fix')+
 '<div id="nptFields">'+pair(num('pressure','目标压力 P*','LJ 约化压力，不是 bar。','fix',{min:-1e6,max:1e6}),num('pdamp','压力阻尼时间','盒尺寸调节的时间尺度，单位 τ。','fix',{min:1e-6,max:1e9}))+steps('nptSteps','NPT 平衡步数','持续观察密度、能量和压力是否稳定。')+'</div><div class="note">默认步数用于演示。正式研究需根据稳定性与链构象松弛来确定平衡时长。</div>')+
 detail('rnemdSettings','06 · 交换能量与采样','thermal/conductivity',
 '<div class="note"><strong>从平衡后结构开始？</strong><p>先在第 01 页导入原运行的 equilibrated.data（须含完整 Velocities），再开启下面的选项。开启后保留文件中的速度，跳过最小化与 NVT/NPT。</p>'+check('reuseEquilibrated','从已平衡 data 开始 RNEMD','此选项不会自动证明体系已平衡；请先检查原日志。','read_data')+'<div id="reuseConfirmation">'+check('reuseForceFieldConfirmed','已核对原运行来源及力场参数','对照原 parameters.json / in.lammps，确认质量、WCA/LJ、键势、时间步、边界与当前设置匹配。','pair_coeff')+'</div></div>'+
 select('direction','传热方向',[['x','X 方向'],['y','Y 方向'],['z','Z 方向']],'沿该方向分层，交换第 1 层和中间层粒子的动能。','fix')+
 pair(num('bins','分层数','偶数；若用第 05 页拟合热导率，至少填 8 层。','compute',{min:4,max:200,step:2}),num('swaps','每次交换对数','每次从冷热层中选几对粒子交换动能。','fix',{min:1,max:10000,step:1}))+
 steps('exchange','能量交换间隔 / 步','间隔越小，通常施加的热流越强；需要验证线性响应。')+
 steps('settleSteps','NVE 预运行步数','移除控温控压，检查能量稳定。')+
 steps('warmSteps','温度梯度建立步数','交换已开始，但这段累计能量不计入正式输出。')+
 steps('productionSteps','正式采样步数','须为每块步数的整数倍。')+
 pair(steps('sampleEvery','采样间隔 / 步','多少步采集一次各层温度。'),steps('sampleRepeat','每块采样次数','多少次采样合成一个时间块。'))+
 '<div class="note"><strong id="blockSummary"></strong><p>每块独立输出温度剖面与累计交换能量，便于选择稳态时间窗。</p></div><p>生产段使用 NVE，不叠加全局恒温器。脚本不会自动判断稳态或输出最终热导率。</p>');
// Output intervals have their own commands, even though all are integer step counts.
for(const [key,command] of [['thermoEvery','thermo'],['dumpEvery','dump']]){descriptions[key].command=command;$('in-'+key).dataset.command=command}
function values(){const p={...I.defaults,mode};for(const el of $('inputForm').elements){if(!el.name)continue;p[el.name]=el.type==='checkbox'?el.checked:el.type==='number'?(el.value===''?NaN:Number(el.value)):el.value}if(mode!=='rnemd')p.reuseEquilibrated=false;return p}
function syntax(script){return script.trimEnd().split('\n').map(line=>'<span class="code-line'+(line.startsWith('# 0')?' section-comment':line.startsWith('#')?' comment':'')+(activeCommand&&line.startsWith(activeCommand+' ')?' related':'')+'">'+(line.startsWith('#')?esc(line):esc(line).replace(/^(\S+)/,'<span class="command">$1</span>'))+'</span>').join('')}
function update(){
 const m=S.getModel(),p=values();
 $('inputModelSummary').textContent=m.atoms.length.toLocaleString()+' 个粒子 · '+m.bonds.length.toLocaleString()+' 条键';
 $('inputModelUnits').textContent=S.isDirty()?'结构修改待生成':m.source==='generated'?'已连接当前生成结构':'已连接导入结构';
 $('importUnitCheck').hidden=m.source!=='imported';$('ljCutoff').hidden=p.pair!=='lj';$('feneFields').hidden=p.bond!=='fene';$('harmonicFields').hidden=p.bond!=='harmonic';$('bondSettings').hidden=!m.bondTypes;
 $('equilSettings').hidden=mode==='check'||p.reuseEquilibrated;$('nptFields').hidden=!p.npt;$('rnemdSettings').hidden=mode!=='rnemd';$('reuseConfirmation').hidden=!p.reuseEquilibrated;
 for(const el of $('inputForm').elements)if(el.name){const hidden=!!el.closest('[hidden]');el.disabled=hidden}
 const block=p.sampleEvery*p.sampleRepeat;$('blockSummary').textContent=Number.isFinite(block)?'每块 '+block.toLocaleString()+' 步 · '+(block*p.dt).toPrecision(4)+' τ':'请填写有效的采样间隔与次数';
 result=I.build(m,p,S.isDirty());
 $('inputValidation').className='input-validation';
 $('inputValidation').innerHTML=(result.errors.length?'<div class="error error-box"><strong>请先处理以下问题</strong><ul>'+result.errors.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul></div>':'<div class="pass">脚本与当前结构的静态检查通过 · 仍需用 LAMMPS 试运行</div>')+(result.warnings.length?'<details class="input-warnings"><summary>'+result.warnings.length+' 条模型与参数提示</summary><ul>'+result.warnings.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul></details>':'');
 const compatibility=result.warnings.filter(s=>s.startsWith('本站热导率分析'));if(compatibility.length)$('inputValidation').insertAdjacentHTML('beforeend','<div class="note"><strong>导出前：与第 05 页的兼容性</strong><p>'+compatibility.map(esc).join('<br>')+'</p></div>');
 $('inputCode').innerHTML=result.script?syntax(result.script):'<span class="code-empty">参数尚未通过检查。\n修正上方问题后，这里将实时显示 in 文件。</span>';
 $('inputLineCount').textContent=result.script?result.script.trimEnd().split('\n').length+' 行 · 实时更新':'';
 for(const id of ['copyInput','downloadInput','downloadBundle'])$(id).disabled=!!result.errors.length;
 $('inputFlow').innerHTML=result.errors.length?'<span class="subtle">等待有效参数</span>':result.stages.map((s,i)=>(i?'<span class="flow-connector" aria-hidden="true">→</span>':'')+'<span class="flow-node">'+esc(s.name)+'<small>'+(s.steps===null?'最多 1,000 次迭代':s.steps===0?'不推进时间':s.steps.toLocaleString()+' 步')+'</small></span>').join('');
 $('inputDuration').textContent=result.errors.length?'':result.totalSteps.toLocaleString()+' 步 / '+Number((result.totalSteps*p.dt).toPrecision(6))+' τ';
}
function showInput(yes){editorWorkspace=yes?'input':'structure';$('structureWorkspace').hidden=yes;$('inputWorkspace').hidden=!yes;$('structureStep').setAttribute('aria-pressed',!yes);$('inputStep').setAttribute('aria-pressed',yes);for(const prefix of ['analysis','job','heat','trajectory']){if($(prefix+'Workspace'))$(prefix+'Workspace').hidden=true;if($(prefix+'Step'))$(prefix+'Step').setAttribute('aria-pressed',false)}update()}
$('structureStep').onclick=()=>showInput(false);$('inputStep').onclick=()=>showInput(true);$('backToData').onclick=()=>showInput(false);
for(const b of document.querySelectorAll('.recipe'))b.onclick=()=>{mode=b.dataset.mode;for(const x of document.querySelectorAll('.recipe'))x.setAttribute('aria-pressed',x===b);update()};
$('inputForm').onsubmit=e=>e.preventDefault();
const sourceCritical=new Set(['bx','by','bz','pair','bond','epsilonAA','epsilonAB','epsilonBB','sigmaAA','sigmaAB','sigmaBB','cutoff','k','rmax','bondEpsilon','bondSigma','harmonicK','r0','dt']);
function inputChanged(e){if(sourceCritical.has(e.target.name))$('in-reuseForceFieldConfirmed').checked=false;update()}
$('inputForm').oninput=inputChanged;$('inputForm').onchange=inputChanged;
$('inputForm').onfocusin=e=>{const d=descriptions[e.target.name];if(!d)return;activeCommand=d.command;$('inputHelp').textContent=d.label+'：'+d.hint+' 对应命令：'+d.command;for(const line of $('inputCode').children)line.classList.toggle('related',line.textContent.startsWith(activeCommand+' '))};
$('resetInput').onclick=()=>{for(const el of $('inputForm').elements)if(el.name){if(el.type==='checkbox')el.checked=I.defaults[el.name];else el.value=I.defaults[el.name]}activeCommand='';$('inputHelp').textContent='教学参数已恢复。点击参数查看含义和对应命令。';update();S.toast('已恢复教学参数，当前结构保持不变。')};
function save(content,name,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);S.toast('已发起下载 '+name+'。如浏览器拦截，可复制脚本，或在常用浏览器中打开本页。')}
$('copyInput').onclick=async()=>{update();if(result.errors.length)return;try{await navigator.clipboard.writeText(result.script);S.toast('in 脚本已复制，不含显示行号。')}catch{S.toast('浏览器不允许自动复制，请选择脚本原文复制。')}};
$('downloadInput').onclick=()=>{update();if(!result.errors.length)save(result.script,'in.lammps','text/plain;charset=utf-8')};
$('downloadBundle').onclick=()=>{update();if(!result.errors.length)save(I.bundle(S.getModel(),result),'lammps-'+mode+'.zip','application/zip')};
document.addEventListener('structurechange',()=>{if(S.getModel()!==lastModel){$('in-importUnitsConfirmed').checked=false;lastModel=S.getModel()}$('in-reuseForceFieldConfirmed').checked=false;update()});
window.InputStudio={parameters:values,capture(){return {mode,fields:Object.fromEntries([...$('inputForm').elements].filter(el=>el.name).map(el=>[el.name,el.type==='checkbox'?el.checked:el.value])),expanded:Object.fromEntries([...$('inputForm').querySelectorAll('details')].map(el=>[el.id,el.open])),workspace:editorWorkspace}},
 restore(state){mode=state.mode;for(const b of document.querySelectorAll('.recipe'))b.setAttribute('aria-pressed',b.dataset.mode===mode);for(const el of $('inputForm').elements)if(el.name){if(el.type==='checkbox')el.checked=state.fields[el.name];else el.value=state.fields[el.name]}for(const [id,open] of Object.entries(state.expanded))$(id).open=open;lastModel=S.getModel();activeCommand='';$('inputHelp').textContent='已恢复工程参数。点击参数查看含义及对应命令。';showInput(state.workspace==='input')}
};
update();
})();
