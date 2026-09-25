'use strict';
const $=id=>document.getElementById(id),C=window.DataCore;
const defaults={chains:8,length:16,aCount:8,sequence:'block',seed:2026,bond:.97,spacing:1.5,padding:1.5,massA:1,massB:1};
let model=C.generate(defaults),selected=1,angleX=.48,angleY=-.42,zoom=1,toastTimer,diagnostics,dirty=false;
function toast(msg){$('toast').textContent=msg;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000)}
function params(){return Object.fromEntries(Object.keys(defaults).map(k=>[k,k==='sequence'?$(k).value:Number($(k).value)]))}
function setParams(p){for(const k of Object.keys(defaults))$(k).value=p[k];$('seedLabel').hidden=p.sequence!=='random'}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function markDirty(value){dirty=value;$('dirtyHint').hidden=!value;$('exportButton').disabled=value||!!diagnostics?.errors.length;$('exportButton').title=value?'先生成当前填写的参数，避免导出旧结构':'导出当前结构';document.dispatchEvent(new Event('structurechange'))}
function changeModel(m){model=m;selected=m.atoms[0].id;$('atomId').value=selected;dirty=false;$('dirtyHint').hidden=true;render()}
function generateFromForm(){try{const m=C.generate(params());$('reference').value=m.reference;$('periodic').checked=true;changeModel(m);$('formError').hidden=true;toast('结构已生成，原文与预览已更新。');return summary()}catch(e){$('formError').textContent=e.message;$('formError').hidden=false;throw e}}
$('generatorForm').onsubmit=e=>{e.preventDefault();try{generateFromForm()}catch{}};
$('generatorForm').oninput=()=>markDirty(true);
$('sequence').onchange=()=>{$('seedLabel').hidden=$('sequence').value!=='random';markDirty(true)};
$('resetButton').onclick=()=>{setParams(defaults);$('periodic').checked=true;$('reference').value=.97;changeModel(C.generate(defaults));$('formError').hidden=true;toast('已恢复 8 条链、128 个粒子的示例。')};
function render(){
 const molecules=new Set(model.atoms.map(a=>a.mol).filter(x=>x>0)).size,volume=model.box.reduce((v,b)=>v*(b[1]-b[0]),1),a=model.atoms.filter(a=>a.type===1).length;
 $('stats').innerHTML=[['粒子数',model.atoms.length.toLocaleString()],['分子标签数',molecules.toLocaleString()],['键数',model.bonds.length.toLocaleString()],['粒子数密度',(model.atoms.length/volume).toPrecision(3)]].map(([label,value])=>'<div class="stat"><strong>'+value+'</strong><small>'+label+'</small></div>').join('');
 $('sourceLabel').textContent=model.source==='generated'?'规则直链 / LJ 约化单位':model.velocities?'已导入 / 含 '+model.velocities.length+' 组速度 · 请核对原运行':'已导入 / 无速度 · 单位须与原 in 文件一致';
 $('viewCount').textContent='显示全部 '+model.atoms.length+' 个粒子 · type 1: '+a;
 $('boxFields').innerHTML=model.box.map((b,i)=>'<div class="box-axis"><strong>'+'XYZ'[i]+'</strong>'+b.map((v,j)=>'<label>'+(j?'hi 上界':'lo 下界')+'<input id="box'+i+j+'" type="number" step="any" required value="'+C.format(v)+'"></label>').join('')+'</div>').join('');
 $('massFields').innerHTML=model.masses.map(a=>'<label>类型 '+a.id+'<input name="mass'+a.id+'" type="number" step="any" min="0.000000001" required value="'+a.mass+'"></label>').join('');
 $('rawData').textContent=C.serialize(model);renderAtom();renderChecks();draw();document.dispatchEvent(new Event('structurechange'));
}
function renderChecks(){
 const ref=Number($('reference').value);
 if(!Number.isFinite(ref)||ref<=0){$('validation').innerHTML='<div class="error error-box">参考长度必须大于 0。</div>';$('exportButton').disabled=true;return}
 diagnostics=C.validate(model,{periodic:$('periodic').checked,reference:ref});
 $('validation').innerHTML=(diagnostics.errors.length?'<div class="error error-box">'+diagnostics.errors.map(esc).join('<br>')+'</div>':'<div class="pass">结构格式检查通过 · 编号、质量、键连接与盒边界有效</div>')+diagnostics.warnings.map(t=>'<div class="warning">'+esc(t)+'</div>').join('')+'<p class="subtle">几何检查不能替代 LAMMPS 读取、能量检查与充分平衡。</p>';
 $('exportButton').disabled=diagnostics.errors.length>0||dirty;
 $('exportButton').title=dirty?'先生成当前填写的参数，避免导出旧结构':'导出当前结构';
}
$('periodic').onchange=renderChecks;$('reference').onchange=renderChecks;
$('boxForm').onsubmit=e=>{e.preventDefault();const box=model.box.map((b,i)=>b.map((v,j)=>Number($('box'+i+j).value)));if(box.some(b=>!b.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e15)||b[1]<=b[0])){$('boxError').textContent='边界须在 ±1e15 内，且每个上界大于下界。';return}$('boxError').textContent='';model.box=box;render();toast('盒边界已修改；粒子坐标保持原值。')};
function renderAtom(){
 const a=model.atoms.find(a=>a.id===selected);if(!a)return;
 $('atomFields').innerHTML=[['mol','分子编号',0,1],['type','类型',1,1],['x','X 坐标',null,'any'],['y','Y 坐标',null,'any'],['z','Z 坐标',null,'any']].map(([k,label,min,step])=>'<label>'+label+'<input id="edit-'+k+'" type="number" step="'+step+'" '+(min!==null?'min="'+min+'"':'')+' value="'+C.format(a[k])+'" required></label>').join('');
 const v=model.velocities?.find(v=>v.id===a.id);$('imageHint').textContent=(a.image?'image flags（保留）：'+a.image.join(', ')+'。当前编辑的是文件中的坐标。':'')+(v?' 速度（保留）：'+[v.vx,v.vy,v.vz].map(C.format).join(', ')+'。':'');
}
$('findAtomForm').onsubmit=e=>{e.preventDefault();const id=Number($('atomId').value);if(!model.atoms.some(a=>a.id===id)){$('atomError').textContent='找不到这个粒子 ID。';return}selected=id;$('atomError').textContent='';renderAtom();draw()};
$('atomForm').onsubmit=e=>{e.preventDefault();const a=model.atoms.find(a=>a.id===selected),changes=Object.fromEntries(['mol','type','x','y','z'].map(k=>[k,Number($('edit-'+k).value)]));if(!Number.isSafeInteger(changes.mol)||changes.mol<0||!Number.isInteger(changes.type)||changes.type<1||changes.type>model.atomTypes||!Object.values(changes).every(v=>Number.isFinite(v)&&Math.abs(v)<=1e15)){$('atomError').textContent='检查分子编号、类型范围与坐标。';return}Object.assign(a,changes);$('atomError').textContent='';render();toast('已更新粒子 '+selected+'。')};
$('massForm').onsubmit=e=>{e.preventDefault();const values=model.masses.map(a=>Number($('massForm').elements['mass'+a.id].value));if(values.some(v=>!Number.isFinite(v)||v<=0)){$('massError').textContent='质量须为大于 0 的有限数。';return}model.masses.forEach((a,i)=>a.mass=values[i]);$('massError').textContent='';render();toast('类型质量已更新。')};
const tabs=[...document.querySelectorAll('[role=tab]')];
function switchTab(button){for(const b of tabs){const active=b===button;b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1;$(b.dataset.tab).hidden=!active}}
for(const b of tabs){b.onclick=()=>switchTab(b);b.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const i=e.key==='Home'?0:e.key==='End'?tabs.length-1:(tabs.indexOf(b)+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;switchTab(tabs[i]);tabs[i].focus()}}}switchTab(tabs[0]);
function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000)}
$('exportButton').onclick=()=>{renderChecks();if(!$('exportButton').disabled){download(C.serialize(model),'model.data');toast('已发起下载；若浏览器拦截，可在 data 原文页复制。')}};
$('copyButton').onclick=async()=>{try{await navigator.clipboard.writeText(C.serialize(model));toast('data 原文已复制。')}catch{toast('浏览器未允许复制，请选择原文复制或直接导出。')}};
$('importButton').onclick=()=>{$('importError').hidden=true;$('importDialog').showModal()};
$('cancelImport').onclick=()=>$('importDialog').close();$('chooseFile').onclick=()=>$('fileInput').click();
let structureImportSerial=0,structureReading=false;
$('fileInput').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;const serial=++structureImportSerial;structureReading=true;
 try{if(file.size>15*1024*1024)throw new Error('文件超过 15 MB，请使用更小的结构。');const m=C.parse(await file.text());if(serial!==structureImportSerial)return;$('periodic').checked=false;changeModel(m);$('importDialog').close();toast('已导入 '+m.atoms.length+' 个粒子'+(m.velocities?'及全部速度':'')+'。请检查原力场、单位与边界。')}
 catch(err){$('importError').textContent=err.message;$('importError').hidden=false}
 finally{if(serial===structureImportSerial)structureReading=false;e.target.value=''}
};
// Orthographic projection displays coordinates; it does not integrate equations of motion.
const canvas=$('structure'),ctx=canvas.getContext('2d');
function draw(){
 const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
 const dpr=Math.min(devicePixelRatio||1,2);canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const lengths=model.box.map(b=>b[1]-b[0]),center=model.box.map(b=>(b[0]+b[1])/2),scale=Math.min(w,h)*1.15/Math.hypot(...lengths)*zoom;
 const project=p=>{const [x,y,z]=p.map((v,i)=>v-center[i]),xx=x*Math.cos(angleY)+z*Math.sin(angleY),zz=-x*Math.sin(angleY)+z*Math.cos(angleY);return{x:w/2+xx*scale,y:h/2-(y*Math.cos(angleX)-zz*Math.sin(angleX))*scale,z:y*Math.sin(angleX)+zz*Math.cos(angleX)}};
 if($('showBox').checked){
  const corners=Array.from({length:8},(_,n)=>project(model.box.map((b,i)=>b[(n>>i)&1])));
  ctx.strokeStyle='#b6c8e5';ctx.lineWidth=1;ctx.setLineDash([4,4]);
  for(let n=0;n<8;n++)for(let i=0;i<3;i++)if(!(n&(1<<i))){const a=corners[n],b=corners[n|(1<<i)];ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}ctx.setLineDash([]);
 }
 const points=model.atoms.map(a=>({...project([a.x,a.y,a.z]),a})),map=new Map(points.map(p=>[p.a.id,p]));
 if($('showBonds').checked){ctx.strokeStyle='#9aacc5';ctx.lineWidth=Math.min(3,Math.max(1,scale*.075));ctx.beginPath();for(const b of model.bonds){const a=map.get(b.a),c=map.get(b.b);if(a&&c){ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y)}}ctx.stroke()}
 const radius=Math.max(1.2,Math.min(9,scale*.22));points.sort((a,b)=>a.z-b.z);
 for(const p of points){ctx.fillStyle=p.a.type===1?'#3d6ced':p.a.type===2?'#ed9b58':['#349b90','#935cb9','#cb6171'][(p.a.type-3)%3];ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();if(radius>3){ctx.strokeStyle='#ffffffaa';ctx.lineWidth=.8;ctx.stroke()}if(p.a.id===selected){ctx.beginPath();ctx.arc(p.x,p.y,radius+3,0,Math.PI*2);ctx.strokeStyle='#172e55';ctx.lineWidth=1.4;ctx.stroke()}}
 const origin={x:35,y:h-48};
 for(const [label,p,color] of [['X',project([center[0]+1,center[1],center[2]]),'#ba5169'],['Y',project([center[0],center[1]+1,center[2]]),'#368f79'],['Z',project([center[0],center[1],center[2]+1]),'#477dc4']]){const x=origin.x+(p.x-w/2)/scale*22,y=origin.y+(p.y-h/2)/scale*22;ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(origin.x,origin.y);ctx.lineTo(x,y);ctx.stroke();ctx.font='12px monospace';ctx.fillStyle=color;ctx.fillText(label,x+3,y)}
}
let drag=null;
canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing'};
canvas.onpointermove=e=>{if(drag){angleY+=(e.clientX-drag.x)*.008;angleX+=(e.clientY-drag.y)*.008;drag={x:e.clientX,y:e.clientY};draw()}};
canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;canvas.style.cursor='grab'};
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.2,Math.min(5,zoom*Math.exp(-e.deltaY*.001)));draw()},{passive:false});
$('viewReset').onclick=()=>{angleX=.48;angleY=-.42;zoom=1;draw()};$('showBonds').onchange=draw;$('showBox').onchange=draw;new ResizeObserver(draw).observe(canvas);
function summary(){return {atoms:model.atoms.length,bonds:model.bonds.length,molecules:new Set(model.atoms.map(a=>a.mol).filter(x=>x>0)).size,box:model.box,atom_style:'molecular',source:model.source,checks:diagnostics}}
render();
window.StructureStudio={getModel:()=>model,isDirty:()=>dirty,isReading:()=>structureReading,toast,
 capture(){return {model:structuredClone(model),generator:Object.fromEntries(Object.keys(defaults).map(k=>[k,$(k).value])),dirty,
  checks:{periodic:$('periodic').checked,reference:$('reference').value},
  editor:{selectedId:selected,searchId:$('atomId').value,atom:Object.fromEntries(['mol','type','x','y','z'].map(k=>[k,$('edit-'+k).value])),box:model.box.map((b,i)=>b.map((v,j)=>$('box'+i+j).value)),masses:model.masses.map(a=>$('massForm').elements['mass'+a.id].value)},
  view:{angleX,angleY,zoom,showBonds:$('showBonds').checked,showBox:$('showBox').checked,tab:tabs.find(b=>b.getAttribute('aria-selected')==='true').dataset.tab}}},
 restore(state){
  ++structureImportSerial;structureReading=false;
  model=structuredClone(state.model);selected=state.editor.selectedId;dirty=state.dirty;setParams(state.generator);
  $('periodic').checked=state.checks.periodic;$('reference').value=state.checks.reference;
  ({angleX,angleY,zoom}=state.view);$('showBonds').checked=state.view.showBonds;$('showBox').checked=state.view.showBox;
  for(const id of ['boxError','atomError','massError'])$(id).textContent='';$('formError').hidden=true;
  render();$('dirtyHint').hidden=!dirty;$('atomId').value=state.editor.searchId;
  for(const k of ['mol','type','x','y','z'])$('edit-'+k).value=state.editor.atom[k];
  state.editor.box.forEach((b,i)=>b.forEach((v,j)=>$('box'+i+j).value=v));
  model.masses.forEach((a,i)=>$('massForm').elements['mass'+a.id].value=state.editor.masses[i]);
  switchTab(tabs.find(b=>b.dataset.tab===state.view.tab));
 }
};

// Optional WebMCP interface shares the exact visible generator actions.
const context=document.modelContext;
if(context?.registerTool){
 const lifecycle=new AbortController();
 const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(e=>console.warn('WebMCP registration unavailable:',e.message))}catch(e){console.warn('WebMCP registration unavailable:',e.message)}};
 register({name:'read_structure_summary',title:'读取当前结构摘要',description:'读取当前可见结构的粒子数、键数、盒边界和检查结果，不改变模型。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('Expected an empty object.');return summary()}});
 register({name:'generate_chain_structure',title:'生成并替换珠簧链结构',description:'填写数字并生成规则直链，替换当前可见结构；不会运行 LAMMPS 或导出文件。省略字段沿用参数面板的值。',inputSchema:{type:'object',properties:{chains:{type:'integer',minimum:1,maximum:10000},length:{type:'integer',minimum:2,maximum:10000},aCount:{type:'integer',minimum:0},sequence:{type:'string',enum:['block','mixed','random']},seed:{type:'integer',minimum:1,maximum:2147483646},bond:{type:'number',minimum:1e-6,maximum:1e9},spacing:{type:'number',minimum:1e-6,maximum:1e9},padding:{type:'number',minimum:1e-6,maximum:1e9},massA:{type:'number',minimum:1e-6,maximum:1e9},massB:{type:'number',minimum:1e-6,maximum:1e9}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!(k in defaults)))throw new Error('Unknown parameter.');const p={...params(),...input};C.generate(p);setParams(p);return generateFromForm()}});
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
