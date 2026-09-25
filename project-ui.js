(() => {
'use strict';
const P=window.ProjectCore,T=window.ProjectStore,S=window.StructureStudio,I=window.InputStudio,$=id=>document.getElementById(id);
let project={id:crypto.randomUUID(),name:'未命名工程',notes:'',createdAt:new Date().toISOString()},restoring=false,timer=null,expected=null,storage=null,paused=false,pending=null,pendingRaw=undefined,undo=null,preview=null,previewText='',lastState=null,needsSave=false;
function status(text,kind=''){const el=$('projectStatus');el.textContent=text;el.dataset.kind=kind}
function capture(){project.name=$('projectName').value;project.notes=$('projectNotes').value;return P.create({...project},{structure:S.capture(),simulation:I.capture()})}
function fingerprint(doc){return JSON.stringify({project:doc.project,state:doc.state})}
function showRecovery(message,doc,raw){pending=doc;pendingRaw=raw;$('recoveryMessage').textContent=message;$('recoveryBanner').hidden=false;$('restoreDraft').disabled=!doc;paused=true;status('自动保存暂停，请先选择如何继续','warning')}
function conflict(){let current=null,doc=null;try{current=T.read(storage);if(current)doc=P.parse(current)}catch{}showRecovery('另一个页面更新了本机草稿。为避免互相覆盖，自动保存已暂停。可以恢复那个版本，或保留本页并将旧草稿备份。',doc,current)}
function flush(){
 clearTimeout(timer);if(restoring||paused||!storage)return false;
 try{const doc=capture(),state=fingerprint(doc);if(state===lastState){needsSave=false;status(expected?'当前内容已保存到本机':'自动保存已就绪 · 编辑后写入本机');return true}const raw=P.serialize(doc);expected=T.write(storage,raw,expected);lastState=state;needsSave=false;status('已自动保存到本机 · '+new Date(doc.savedAt).toLocaleTimeString('zh-CN',{hour12:false}));return true}
 catch(e){if(e.message==='CONFLICT'){conflict();return false}status('本机自动保存失败，请下载工程备份','error');$('projectStorageHint').textContent='浏览器存储不可用、空间不足或工程状态暂不可保存。当前编辑仍在页面中，可尝试下载工程文件。';return false}
}
function changed(){if(restoring)return;if(paused){try{if(fingerprint(capture())===lastState)return}catch{}needsSave=true;status('有编辑未自动保存 · 先处理草稿提示','warning');return}needsSave=true;status(storage?'正在保存到本机…':'本机存储不可用，请下载工程','warning');clearTimeout(timer);timer=setTimeout(flush,650)}
function load(doc,save=true){
 // Complete validation before any DOM/model mutation; keep the current state for one-step recovery.
 P.validate(doc);const previous=capture();restoring=true;
 try{S.restore(doc.state.structure);I.restore(doc.state.simulation);project={...doc.project};$('projectName').value=project.name;$('projectNotes').value=project.notes;undo=previous;$('undoProject').hidden=false;$('projectError').hidden=true}
 catch(e){S.restore(previous.state.structure);I.restore(previous.state.simulation);project={...previous.project};$('projectName').value=project.name;$('projectNotes').value=project.notes;throw e}
 finally{restoring=false}
 lastState=null;needsSave=true;if(save)flush();
}
function error(e){$('projectError').textContent=e.message;$('projectError').hidden=false}
function download(raw,name){const url=URL.createObjectURL(new Blob([raw],{type:'application/json;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);S.toast('已发起工程下载。请确认浏览器实际保存；若拦截，可用“工程文本”复制保存。')}
$('saveProject').onclick=()=>{try{const doc=capture();download(P.serialize(doc),P.filename(doc.project.name));flush()}catch(e){error(e)}};
$('projectTextButton').onclick=()=>{try{const doc=capture();$('projectText').value=P.serialize(doc);$('projectTextName').textContent=P.filename(doc.project.name);$('projectTextDialog').showModal()}catch(e){error(e)}};
$('copyProjectText').onclick=async()=>{try{await navigator.clipboard.writeText($('projectText').value);S.toast('工程文本已复制，请以 UTF-8 纯文本保存为显示的 .json 文件名。')}catch{$('projectText').focus();$('projectText').select();S.toast('请按 Ctrl+C 复制选中的工程文本。')}};
$('closeProjectText').onclick=()=>$('projectTextDialog').close();
$('openProject').onclick=()=>$('projectFile').click();
$('projectFile').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{if(file.size>P.MAX_BYTES)throw new Error('工程文件超过 20 MB。');preview=P.parse(await file.text());previewText=P.serialize(preview);$('projectOpenSummary').textContent=(preview.project.name||'未命名工程')+' · '+preview.state.structure.model.atoms.length.toLocaleString()+' 个粒子 · '+({check:'读取检查',equilibrate:'平衡模拟',rnemd:'RNEMD 采样'}[preview.state.simulation.mode]);$('projectOpenDetails').textContent='保存于 '+new Date(preview.savedAt).toLocaleString('zh-CN')+'。打开后会恢复结构、模拟参数、备注和未应用的草稿；可用“撤销打开/恢复”回到当前页面。';$('projectOpenError').hidden=true;$('projectOpenDialog').showModal()}
 catch(e){error(e)}finally{e.target.value=''}
};
$('cancelProjectOpen').onclick=()=>{$('projectOpenDialog').close();preview=null;previewText=''};
$('confirmProjectOpen').onclick=()=>{
 if(!preview)return;
 try{const previous=capture(),previousRaw=expected;if(storage){const raw=T.read(storage);if(raw!==expected){conflict();throw new Error('本机草稿已变化。请先关闭此窗口并处理草稿提示，再打开工程。')}T.preserve(storage,paused&&raw!==null?raw:P.serialize(previous));expected=T.write(storage,previewText,expected)}
  try{load(preview,false)}catch(e){if(storage)try{expected=T.write(storage,previousRaw||P.serialize(previous),expected)}catch{}throw e}paused=false;pending=null;pendingRaw=undefined;$('recoveryBanner').hidden=true;$('projectOpenDialog').close();preview=null;previewText='';flush();S.toast('工程已打开。未应用的修改仍保留为草稿。')
 }catch(e){$('projectOpenError').textContent=e.message==='CONFLICT'?'本机草稿已变化，已暂停自动保存。':e.message;$('projectOpenError').hidden=false;if(e.message==='CONFLICT')conflict()}
};
$('restoreDraft').onclick=()=>{if(!pending)return;try{const doc=pending;if(storage){const raw=T.read(storage);if(pendingRaw!==undefined&&raw!==pendingRaw){conflict();return}expected=raw}load(doc,false);paused=false;pending=null;pendingRaw=undefined;$('recoveryBanner').hidden=true;flush();S.toast('已恢复上次的工程与编辑草稿。')}catch(e){error(e)}};
$('keepCurrentProject').onclick=()=>{try{if(storage){const raw=T.read(storage);T.preserve(storage,raw);expected=raw}paused=false;pending=null;$('recoveryBanner').hidden=true;lastState=null;changed();flush()}catch(e){error(new Error('无法备份已有草稿，请先下载当前工程再继续。'))}};
$('undoProject').onclick=()=>{if(!undo)return;try{const doc=undo;load(doc);S.toast('已恢复打开前的页面。可再次点击切回。')}catch(e){error(e)}};
$('restoreBackup').onclick=()=>{try{if(!storage)throw new Error('本机存储不可用。');const raw=storage.getItem(T.BACKUP);if(!raw)throw new Error('目前没有打开前的备份。');const doc=P.parse(raw);showRecovery('找到打开其他工程前保留的备份：'+(doc.project.name||'未命名工程')+'。选择恢复后会替换当前页面，可撤销恢复。',doc)}catch(e){error(e)}};
$('projectName').oninput=$('projectNotes').oninput=changed;
// Observe UI events after their existing handlers have applied changes.
for(const event of ['input','change','click','submit','pointerup'])document.addEventListener(event,e=>{if(restoring||e.target.closest('#projectOpenDialog,#projectTextDialog,#recoveryBanner')||e.target.closest('.project-tools'))return;if(e.target.closest('#structureWorkspace,#inputWorkspace,.workflow-nav'))changed()});
document.addEventListener('toggle',e=>{if(e.target.closest?.('#inputForm'))changed()},true);
document.addEventListener('structurechange',changed);
document.addEventListener('wheel',e=>{if(e.target.id==='structure')changed()},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush()});
window.addEventListener('pagehide',flush);
window.addEventListener('beforeunload',e=>{if(needsSave&&!flush()){e.preventDefault();e.returnValue=''}});
window.addEventListener('storage',e=>{if(e.key===T.KEY&&e.newValue!==expected)conflict()});
$('projectName').value=project.name;
lastState=fingerprint(capture());
try{storage=window.localStorage;expected=T.read(storage);if(expected){try{const doc=P.parse(expected);showRecovery('发现本机草稿：'+(doc.project.name||'未命名工程')+' · '+doc.state.structure.model.atoms.length.toLocaleString()+' 个粒子 · '+new Date(doc.savedAt).toLocaleString('zh-CN')+'。',doc,expected)}catch{showRecovery('本机草稿无法读取。它尚未被覆盖；可以打开已下载的工程，或备份旧草稿后使用当前页面。',null,expected)}}else{status('自动保存已就绪 · 编辑后写入本机');lastState=fingerprint(capture())}}
catch{storage=null;status('本机存储不可用，请下载工程','error');$('projectStorageHint').textContent='当前浏览器未允许本机存储。请用“下载工程”保存；刷新前确认备份。'}
window.ProjectStudio={capture,assertReady(){if(paused)throw new Error('请先处理“继续上次的工作”：恢复草稿，或保留本页并备份旧草稿。')},restore(doc){this.assertReady();P.validate(doc);if(storage){const raw=T.read(storage);if(raw!==expected){conflict();throw new Error('另一个页面修改了结构工程草稿，请先处理恢复提示。')}T.preserve(storage,P.serialize(capture()))}clearTimeout(timer);load(doc,false)},finishRestore(){flush()}};
})();
