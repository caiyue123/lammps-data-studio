(() => {
'use strict';
const L=window.LogCore,G=window.LogPlot,$=id=>document.getElementById(id),e=G.escape,f=G.format;
let data=null,raw='',fileName='',selected=0,current=null,plot=null,loadSerial=0;
function show(){for(const id of ['structureWorkspace','inputWorkspace','jobWorkspace','heatWorkspace','trajectoryWorkspace'])if($(id))$(id).hidden=true;$('analysisWorkspace').hidden=false;for(const id of ['structureStep','inputStep','jobStep','heatStep','trajectoryStep'])if($(id))$(id).setAttribute('aria-pressed',false);$('analysisStep').setAttribute('aria-pressed',true)}
$('analysisStep').onclick=show;
function error(message){$('logError').textContent=message;$('logError').hidden=false}
const segment=()=>data?.segments[selected];
function currentUnits(){return $('logUnits').value==='auto'?segment().units:$('logUnits').value}
function selectSegment(index,view){
 selected=index;const s=segment();$('logSegment').value=String(index);
 $('logMetric').innerHTML=s.columns.filter(c=>!['step','time'].includes(c.toLowerCase())).map(c=>'<option value="'+e(c)+'">'+e(L.label(c))+' · '+e(c)+'</option>').join('');
 if(!$('logMetric').options.length)$('logMetric').innerHTML=s.columns.map(c=>'<option value="'+e(c)+'">'+e(c)+'</option>').join('');
 $('logMetric').value=s.columns.find(c=>c.toLowerCase()==='temp')||$('logMetric').options[0].value;
 const axes=s.columns.filter(c=>['step','time'].includes(c.toLowerCase()));$('logAxis').innerHTML=axes.map(c=>'<option value="'+e(c)+'">'+e(L.label(c))+' · '+e(c)+'</option>').join('');$('logAxis').value=axes.find(c=>c.toLowerCase()==='step');
 $('logUnits').value='auto';$('logMean').checked=true;$('logTrend').checked=false;
 resetRange();if(view){$('logMetric').value=view.column;$('logAxis').value=view.axis;$('logUnits').value=view.units;$('logMean').checked=view.mean;$('logTrend').checked=view.trend;$('logFrom').value=view.from;$('logTo').value=view.to}
 render();
}
function resetRange(){const s=segment(),xi=s.columns.indexOf($('logAxis').value),values=s.rows.filter(r=>r.values&&r.values[xi]!==null).map(r=>r.values[xi]);if(!values.length){$('logFrom').value='';$('logTo').value='';return}let low=Infinity,high=-Infinity;for(const x of values){low=Math.min(low,x);high=Math.max(high,x)}$('logFrom').value=low;$('logTo').value=high}
function issues(){
 $('logIssuesSummary').textContent=data.issueCount?'日志与解析提示 · '+data.issueCount+' 条':'日志与解析提示 · 未发现已识别的 ERROR / WARNING';
 $('logIssues').innerHTML=data.issues.map(i=>'<div class="log-issue '+i.severity+'"><div><span>'+({error:'错误',warning:'提示'}[i.severity]||'提示')+'</span><small>'+(i.line?'原文第 '+i.line+' 行':'格式提示')+'</small></div><pre>'+e(i.message)+'</pre>'+(i.context?'<code>'+e(i.context)+'</code>':'')+'<p>'+e(i.help)+'</p></div>').join('')+(data.issueCount>150?'<p class="subtle">提示较多，只展示前 150 条。请检查原始日志。</p>':'');
 $('logIssuesDetails').open=data.errorCount>0||!data.segments.length;
}
function commit(parsed,text,name,view){
 data=parsed;raw=text;fileName=name;current=null;plot=null;$('logError').hidden=true;$('logEmpty').hidden=true;$('logLoaded').hidden=false;$('logFileName').textContent=fileName;
 const errors=data.errorCount;
 $('logFileInfo').textContent=data.segments.length+' 段 thermo · '+data.rows.toLocaleString()+' 条数值记录 · '+(data.version||'未显示 LAMMPS 版本');
 $('logHealth').textContent=errors?'发现错误，请先检查下方提示':!data.segments.length?'未解析到支持的 thermo 表':data.segments.some(s=>!s.ended)?'存在未见结束标记的阶段':'各段均见运行结束标记；不代表已平衡';$('logHealth').dataset.kind=errors?'error':'info';
 $('logWorkspace').hidden=!data.segments.length;$('downloadLogSession').disabled=false;
 $('logSegment').innerHTML=data.segments.map(s=>'<option value="'+s.id+'">'+(s.id+1)+' · '+e(s.label)+' · '+s.rows.filter(r=>r.values).length+' 点</option>').join('');
 issues();if(data.segments.length)selectSegment(view?view.segment:data.segments.length-1,view);show();document.dispatchEvent(new Event('studiochange'));
}
async function importFile(file){
 const serial=++loadSerial;$('logBusy').hidden=false;
 try{
  if(file.size>55*1024*1024)throw new Error('文件超过 55 MB；普通日志上限为 25 MB。');
  const text=await file.text();let parsed,content=text,name=file.name,view=null;
  if(text.trimStart().startsWith('{')){const restored=L.readSession(text);parsed=restored.log;content=restored.raw;name=restored.fileName;view=restored.view}
  else {parsed=L.parse(text)}
  if(serial!==loadSerial)return;commit(parsed,content,name,view);window.StructureStudio.toast('日志已载入分析区，结构与模拟参数未修改。');
 }catch(err){if(serial===loadSerial)error(err.message+' 当前已载入的分析保留。')}
 finally{if(serial===loadSerial)$('logBusy').hidden=true}
}
$('chooseLog').onclick=$('chooseLogEmpty').onclick=()=>$('logFile').click();
$('logFile').onchange=ev=>{const file=ev.target.files[0];if(file)importFile(file);ev.target.value=''};
$('loadLogDemo').onclick=async()=>{const serial=++loadSerial;$('logBusy').hidden=false;try{const response=await fetch('samples/teaching-rnemd.log');if(!response.ok)throw new Error('示例读取失败');const text=await response.text(),parsed=L.parse(text);if(serial===loadSerial)commit(parsed,text,'教学示例 · 128 粒子 RNEMD.log')}catch(err){if(serial===loadSerial)error(err.message+'。可通过“导入日志”选择本机日志。')}finally{if(serial===loadSerial)$('logBusy').hidden=true}};
function render(){
 if(!segment())return;current=null;plot=null;
 const s=segment(),column=$('logMetric').value,axis=$('logAxis').value,units=currentUnits();
 $('logStageInfo').textContent='原日志 '+s.startLine+'–'+s.endLine+' 行 · '+(s.command||'未显示 run/minimize 命令，阶段类型未知')+' · '+(s.ended?'见到 Loop time':'未见结束标记');
 $('logUnitHint').textContent=($('logUnits').value==='auto'?'按日志识别：'+s.units:'你指定的单位标签：'+units)+'；norm = '+s.norm+'。仅标注单位，不改变原始数值。'+(s.norm==='unknown'?'能量是否按粒子归一化须核对原脚本。':'');
 const title=L.label(column)+'随'+L.label(axis)+'变化';$('logChartTitle').textContent=title;$('logChartUnit').textContent=L.unit(column,units,s.norm);
 for(const id of ['downloadLogCsv','downloadLogReport','downloadLogSvg'])$(id).disabled=true;
 try{
  if($('logFrom').value===''||$('logTo').value==='')throw new Error('请填写区间起点和终点。');const from=Number($('logFrom').value),to=Number($('logTo').value);if(!Number.isFinite(from)||!Number.isFinite(to))throw new Error('区间必须为有限数字。');
  current=L.series(s,column,axis,from,to);plot=G.render(current,{title,xLabel:axis+' / '+L.unit(axis,units),yLabel:column+' / '+L.unit(column,units,s.norm),mean:$('logMean').checked,trend:$('logTrend').checked});
  $('logRangeError').hidden=true;$('logChart').innerHTML=plot.svg;
  const q=current.stats;$('logStatistics').innerHTML=[['有效记录',q.n.toLocaleString(),'剔除 '+q.invalid+' 个非有限值点'],['区间均值',f(q.mean),'按输出记录等权平均'],['样本标准差',f(q.sd),'衡量波动，不是均值误差'],['末值 − 首值',f(q.delta),'首值 '+f(q.first)+' → 末值 '+f(q.last)]].map(([a,b,c])=>'<div class="log-stat"><span>'+e(a)+'</span><strong>'+e(b)+'</strong><small>'+e(c)+'</small></div>').join('');
  $('logTrendInfo').textContent='范围 '+f(q.min)+' ～ '+f(q.max)+'；线性斜率 '+f(q.slope)+' / '+L.unit(axis,units)+'；末半段均值 − 首半段均值 '+f(q.halfDifference)+'。至少 4 点时比较首末各半数记录，奇数时略过中间点。';
  $('logPointHint').textContent=plot.shown<q.n?'图形为保留极值的抽样显示；统计和 CSV 使用全部有效记录。':'图中显示所选区间的全部有效记录。';
  $('logReadout').textContent='鼠标移到曲线附近，查看原始记录。';
  $('logTableHead').innerHTML='<tr><th>原文行</th>'+s.columns.map(c=>'<th>'+e(c)+'</th>').join('')+'</tr>';
  $('logTableBody').innerHTML=current.rows.slice(0,100).map(r=>'<tr><td>'+r.line+'</td>'+r.values.map(v=>'<td>'+f(v)+'</td>').join('')+'</tr>').join('');
  $('logTableHint').textContent='展示区间内前 '+Math.min(100,current.rows.length)+' 条记录；CSV 包含区间内所有可定位的记录。NaN / Inf 显示为 —，CSV 留空。';
  for(const id of ['downloadLogCsv','downloadLogReport','downloadLogSvg'])$(id).disabled=false;
 }catch(err){$('logRangeError').textContent=err.message;$('logRangeError').hidden=false;$('logChart').innerHTML='<div class="log-chart-placeholder">'+e(err.message)+'</div>';$('logStatistics').innerHTML='';$('logTrendInfo').textContent='';$('logTableBody').innerHTML='';$('logTableHead').innerHTML='';$('logTableHint').textContent='';$('logPointHint').textContent='';$('logReadout').textContent=''}
}
$('logSegment').onchange=()=>selectSegment(Number($('logSegment').value));
$('logAxis').onchange=()=>{resetRange();render()};for(const id of ['logMetric','logUnits','logMean','logTrend'])$(id).onchange=render;for(const id of ['logFrom','logTo'])$(id).oninput=render;
$('logAll').onclick=()=>{resetRange();render()};$('logLastHalf').onclick=()=>{resetRange();const a=Number($('logFrom').value),b=Number($('logTo').value);$('logFrom').value=a+(b-a)/2;render()};
$('logChart').onpointermove=ev=>{
 if(!plot||!current)return;const rect=$('logChart').getBoundingClientRect(),sx=(ev.clientX-rect.left)/rect.width*plot.width,x=plot.xmin+(sx-plot.left)/(plot.width-plot.left-plot.right)*(plot.xmax-plot.xmin);
 let nearest=null,distance=Infinity;for(const p of current.points){if(!p)continue;const d=Math.abs(p.x-x);if(d<distance){distance=d;nearest=p}}if(nearest)$('logReadout').textContent=$('logAxis').value+' = '+f(nearest.x)+' · '+$('logMetric').value+' = '+f(nearest.y)+' · 原文第 '+nearest.line+' 行';
};
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);window.StructureStudio.toast('已发起下载 '+name+'，请在浏览器下载记录中确认。')}
function view(){return data?.segments.length?{segment:selected,column:$('logMetric').value,axis:$('logAxis').value,from:$('logFrom').value,to:$('logTo').value,units:$('logUnits').value,mean:$('logMean').checked,trend:$('logTrend').checked}:null}
$('downloadLogCsv').onclick=()=>{if(current)download(L.csv(segment(),current.rows),'thermo-stage-'+(selected+1)+'.csv','text/csv;charset=utf-8')};
$('downloadLogReport').onclick=()=>{if(current)download(L.report(data,segment(),$('logMetric').value,$('logAxis').value,[$('logFrom').value,$('logTo').value],current,currentUnits(),fileName),'log-analysis-stage-'+(selected+1)+'.txt','text/plain;charset=utf-8')};
$('downloadLogSvg').onclick=()=>{if(plot)download(plot.svg,'thermo-stage-'+(selected+1)+'.svg','image/svg+xml')};
$('downloadLogSession').onclick=()=>{if(!data)return;try{download(L.writeSession(raw,fileName,view()),'lammps-log-analysis.json','application/json;charset=utf-8')}catch(err){error(err.message)}};
window.LogStudio={capture(){return data?JSON.parse(L.writeSession(raw,fileName,view())):null},restore(doc){const parsed=doc===null?null:L.readSession(JSON.stringify(doc));++loadSerial;$('logBusy').hidden=true;if(parsed){commit(parsed.log,parsed.raw,parsed.fileName,parsed.view);return}data=null;raw='';fileName='';selected=0;current=null;plot=null;$('logEmpty').hidden=false;$('logLoaded').hidden=true;$('logError').hidden=true;for(const id of ['downloadLogSession','downloadLogCsv','downloadLogReport','downloadLogSvg'])$(id).disabled=true}};
})();
