(function(root){
'use strict';
const MAX_BYTES=25*1024*1024,MAX_ROWS=200000,MAX_VALUES=5000000;
const fail=s=>{throw new Error(s)};
const names={step:'步数',time:'模拟时间',temp:'温度',press:'压力',density:'质量密度',poteng:'势能',kineng:'动能',toteng:'总能',volume:'体积',enthalpy:'焓',atoms:'粒子数',cpu:'计算耗时'};
const numeric=/^[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][+-]?\d+)?|nan|inf(?:inity)?)$/i;
const number=s=>{const n=Number(s.replace(/[dD]/,'e'));return Number.isFinite(n)?n:null};
const label=key=>names[key.toLowerCase()]||key;
function explanation(text){
 if(/no fixes with time integration/i.test(text))return '没有时间积分 fix。run 0 读取检查中可预期；如果希望粒子运动，应核对 NVE/NVT/NPT 等积分设置。';
 if(/lost atoms/i.test(text))return '粒子数丢失。检查初始重叠、时间步、边界和盒变化；不要仅关闭 lost 检查来掩盖问题。';
 if(/bond atoms missing/i.test(text))return '成键粒子无法定位。可能与键被过度拉伸、通信距离、时间步或初始结构有关，需结合报错前的轨迹检查。';
 if(/bad fene|fene bond too long/i.test(text))return 'FENE 键接近或超过允许伸长。核对初始键长、R₀、势参数与时间步。';
 if(/non-numeric|nan|infinite|non-finite/i.test(text))return '出现非有限数值。先检查重叠、极端受力、单位和时间步，排除数值发散。';
 if(/not computed at compatible times|inconsistent fix ave|not compatible/i.test(text))return '计算与输出时间不匹配。检查交换间隔及 ave/time、ave/chunk 的 Nevery、Nrepeat、Nfreq。';
 if(/unknown|unrecognized.*style|not enabled|not installed/i.test(text))return '命令或样式不可用。核对拼写、LAMMPS 版本及所需软件包是否编译启用。';
 if(/cannot open|could not open|no such file/i.test(text))return '文件无法打开。核对工作目录、相对路径、文件名、访问权限以及超算计算节点是否能访问它。';
 if(/dangerous builds/i.test(text))return '邻居表可能更新不够及时。需结合原日志检查邻居表设置及粒子位移；该计数本身不等于已经发生错误。';
 if(/new thermo_style/i.test(text))return '重新设置 thermo_style 会重置 thermo_modify 选项。核对之后是否重新指定了所需设置。';
 return '这是原日志报告的信息。请结合对应行和输入脚本核对；本网站不会自动修改模拟参数。';
}
function parse(raw){
 if(typeof raw!=='string'||new TextEncoder().encode(raw).length>MAX_BYTES)fail('日志超过 25 MB，请先按运行阶段拆分文件。');
 if(raw.includes('\0'))fail('这个文件可能是二进制文件。请选择文本 log.lammps，不要选择 restart。');
 const lines=raw.replace(/^\uFEFF/,'').split(/\r\n|\n|\r/),segments=[],issues=[];
 let active=null,rowCount=0,recordCount=0,valueCount=0,issueCount=0,errorCount=0,context={units:'unknown',norm:'unknown',command:'',kind:'unknown'},fixes=new Map(),version='',unsupported=false;
 const issue=(severity,line,message,help)=>{issueCount++;if(severity==='error')errorCount++;if(issues.length<150)issues.push({severity,line,message:message.slice(0,2000),help:help||explanation(message)})};
 const reset=()=>{context={units:'unknown',norm:'unknown',command:'',kind:'unknown'};fixes.clear()};
 const close=()=>{active=null};
 const stage=()=>{if(context.kind==='minimize')return '能量最小化';if(/^run\s+0(?:\s|$)/.test(context.command))return '零步读取检查';const styles=[...fixes.values()];if(styles.includes('thermal/conductivity'))return 'RNEMD 交换阶段';for(const v of ['npt','nvt','nve'])if(styles.some(s=>s===v||s.startsWith(v+'/')))return v.toUpperCase()+' 运行';return '热力学输出'};
 function begin(columns,line,reason){if(segments.length>=5000)fail('热力学表超过 5,000 段，请拆分日志。');active={id:segments.length,columns,rows:[],startLine:line,endLine:line,units:context.units,norm:context.norm,command:context.command,kind:context.kind,label:stage(),reason:reason||'header',ended:false,loop:null};segments.push(active)}
 for(let i=0;i<lines.length;i++){
  const s=lines[i].trim(),line=i+1;if(!s)continue;
  if(/^LAMMPS \(/.test(s)){close();reset();version=s.slice(0,200);continue}
  if(/^ERROR(?: on proc \d+)?:|^WARNING:/i.test(s)){issue(/^ERROR/i.test(s)?'error':'warning',line,s);if(/^ERROR/i.test(s)){if(active)active.failure=true;close()}continue}
  if(/^Last (?:input line|command):|^--> parsed line:/.test(s)){if(issues.length)issues[issues.length-1].context=s.slice(0,2000);continue}
  if(/^Loop time of /.test(s)){if(active){active.ended=true;active.endLine=line;const m=s.match(/^Loop time of (\S+) on (\d+) procs for (\d+) steps with (\d+) atoms/);if(m)active.loop={seconds:number(m[1]),processors:Number(m[2]),steps:Number(m[3]),atoms:Number(m[4])}}close();continue}
  if(/^Dangerous builds\s*=\s*[1-9]\d*/.test(s)){issue('warning',line,s);continue}
  if(/^---\s*Step|^keywords:\s*\[|^thermo_style\s+(?:multi|yaml)/i.test(s)){unsupported=true;close();continue}
  const command=s.split('#')[0].trim();
  if(/^clear(?:\s|$)/.test(command)){close();reset();continue}
  const reportedUnit=s.match(/^Unit style\s*:\s*(\S+)/);if(reportedUnit){context.units=reportedUnit[1];continue}
  const unit=command.match(/^units\s+(\S+)/);if(unit){close();context.units=unit[1];continue}
  if(/^thermo_style\s/.test(command)){close();context.norm='unknown';continue}
  if(/^thermo_modify\s/.test(command)){const m=command.match(/\bnorm\s+(yes|no)\b/);if(m)context.norm=m[1];continue}
  const fix=command.match(/^fix\s+(\S+)\s+\S+\s+(\S+)/);if(fix){close();fixes.set(fix[1],fix[2]);continue}
  const unfix=command.match(/^unfix\s+(\S+)/);if(unfix){close();fixes.delete(unfix[1]);continue}
  if(/^(?:run|minimize)\s/.test(command)){close();context.command=command.slice(0,250);context.kind=command.startsWith('minimize ')?'minimize':'run';continue}
  if(/^reset_timestep\s/.test(command)){close();continue}
  if(s.startsWith('#'))continue;
  const tokens=s.split(/\s+/),stepIndex=tokens.findIndex(t=>t.toLowerCase()==='step');
  if(stepIndex!==-1&&tokens.length>=2&&tokens.every(t=>/^[A-Za-z_][\w[\].:/+-]*$/.test(t))){
   if(tokens.length>64)fail('一张 thermo 表超过 64 列，请导出较少列再分析。');
   if(new Set(tokens.map(t=>t.toLowerCase())).size!==tokens.length)fail('第 '+line+' 行存在重复列名，无法可靠区分数据。');
   begin(tokens,line);continue;
  }
  if(!active)continue;
  if((tokens.every(t=>numeric.test(t))||/^[+-]?(?:\d|\.\d)/.test(s))&&++recordCount>MAX_ROWS)fail('日志超过 200,000 条表内记录，请拆分日志。');
  if(tokens.every(t=>numeric.test(t))){
   const cols=active.columns,si=cols.findIndex(t=>t.toLowerCase()==='step'),ti=cols.findIndex(t=>t.toLowerCase()==='time');
   if(tokens.length!==cols.length){issue('warning',line,'数据列数与表头不符，已跳过此行。','检查日志是否截断、多个任务输出是否交错，或使用了本版不支持的输出格式。');active.rows.push({line,values:null});continue}
   const values=tokens.map(number),step=values[si];
   if(step===null||!Number.isSafeInteger(step)||step<0){issue('warning',line,'Step 列不是有效的非负整数，已跳过此行。');active.rows.push({line,values:null});continue}
   const previous=active.rows.findLast(r=>r.values);
   if(previous&&(step<previous.values[si]||(ti>=0&&values[ti]!==null&&previous.values[ti]!==null&&values[ti]<previous.values[ti]))){
    const prior=active;issue('warning',line,'步数或 Time 回退，已拆成独立阶段，不跨归零点连线。');begin(cols,line,'reset');active.label=prior.label;active.command=prior.command;
   }else if(previous&&step===previous.values[si])issue('warning',line,'当前阶段出现重复步数，保留原记录；统计按记录计数。');
   if(values.some(v=>v===null))issue('error',line,'热力学数据包含 NaN / Inf 或溢出。曲线在缺失处断开，统计剔除对应无效值。','先检查数值发散；有效列仍可用于定位故障，但不能把无效值替换为零。');
   active.rows.push({line,values});active.endLine=line;rowCount++;valueCount+=values.length;
   if(rowCount>MAX_ROWS||valueCount>MAX_VALUES)fail('日志数据过多：最多 200,000 行、5,000,000 个数值。请拆分日志。');
  }else if(/^[+-]?(?:\d|\.\d)/.test(s)){
   issue('warning',line,'表内出现无法解析的数据行，已跳过：'+s.slice(0,160));active.rows.push({line,values:null});
  }else if(!/^(?:Setting up|Per MPI rank memory allocation|WARNING|Neighbor list info|Generated)/.test(s)){
   // Unknown text terminates a table instead of consuming unrelated numeric output.
   if(active.rows.length)close();
  }
 }
 if(unsupported)issue('warning',0,'发现 multi / YAML 输出；本版只解析包含 Step 表头的单行 thermo 表。','请在输入中使用 thermo_style custom step time temp press pe ke etotal density vol，或转换格式后导入。');
 const usable=segments.filter(s=>s.rows.some(r=>r.values));
 usable.forEach((s,i)=>s.id=i);
 if(!usable.length&&!errorCount&&!unsupported)fail('没有找到可读取的 thermo 表。需要包含 Step 列的单行表头及数值行；不支持轨迹、温度分层文件或 CSV。');
 for(const s of usable)if(!s.ended)issue('warning',s.endLine,'第 '+(s.id+1)+' 段未见 Loop time 结束标记。','可能是仍在写入、日志截断、run post no、报错或输出格式变化；不能仅据此断定计算仍在运行。');
 return {segments:usable,issues,issueCount,errorCount,rows:rowCount,version,lines:lines.length,unsupported};
}
function series(segment,column,axis='Step',low=-Infinity,high=Infinity){
 const yi=segment.columns.indexOf(column),xi=segment.columns.indexOf(axis);if(yi<0||xi<0)fail('所选数据列不存在。');
 if(Number.isNaN(low)||Number.isNaN(high)||low>high)fail('区间起点必须小于或等于终点。');
 const points=[],rows=[];let invalid=0,lastX=null;
 for(const row of segment.rows){if(!row.values){points.push(null);continue}const x=row.values[xi],y=row.values[yi];if(x===null){points.push(null);invalid++;continue}if(x<low||x>high)continue;rows.push(row);if(y===null){points.push(null);invalid++;continue}if(lastX!==null&&x<lastX)points.push(null);points.push({x,y,line:row.line});lastX=x}
 const valid=points.filter(Boolean);if(!valid.length)fail('所选区间没有有效数据点，请调整区间或数据列。');
 let mx=0,my=0,m2=0,xx=0,xy=0,n=0,min=Infinity,max=-Infinity;
 for(const {x,y} of valid){n++;const dx=x-mx,dy=y-my;mx+=dx/n;my+=dy/n;m2+=dy*(y-my);xx+=dx*(x-mx);xy+=dx*(y-my);min=Math.min(min,y);max=Math.max(max,y)}
 const safe=v=>Number.isFinite(v)?v:null,slope=xx>0?safe(xy/xx):null;
 const halves=Math.floor(n/2),mean=a=>a.reduce((m,p,i)=>m+(p.y-m)/(i+1),0);
 return {points,rows,stats:{n,invalid,mean:safe(my),sd:n>1?safe(Math.sqrt(Math.max(0,m2/(n-1)))):null,min,max,first:valid[0].y,last:valid.at(-1).y,delta:safe(valid.at(-1).y-valid[0].y),slope,centerX:safe(mx),halfDifference:n>=4?safe(mean(valid.slice(n-halves))-mean(valid.slice(0,halves))):null,start:valid[0].x,end:valid.at(-1).x}};
}
function unit(column,units,norm='unknown'){
 const c=column.toLowerCase();if(c==='step'||c==='atoms')return c==='step'?'步':'个';if(c==='cpu')return '秒';
 const energy=['poteng','kineng','toteng','enthalpy','ebond','eangle','edihed','eimp','evdwl','ecoul','elong','etail'].includes(c);
 const table={lj:{time:'τ',temp:'T*',press:'ε/σ³',density:'m/σ³',volume:'σ³',energy:'ε'},real:{time:'fs',temp:'K',press:'atm',density:'g/cm³',volume:'Å³',energy:'kcal/mol'},metal:{time:'ps',temp:'K',press:'bar',density:'g/cm³',volume:'Å³',energy:'eV'}};
 const u=table[units]?.[energy?'energy':c]||'原日志单位';return u+(energy&&norm==='yes'?' · 按粒子归一化':'');
}
function csv(segment,rows){const quote=s=>'"'+String(s).replace(/"/g,'""')+'"';return ['SourceLine,'+segment.columns.map(quote).join(','),...rows.map(r=>r.line+','+r.values.map(v=>v===null?'':String(v)).join(','))].join('\r\n')+'\r\n'}
function report(log,segment,column,axis,range,result,units,name){const s=result.stats;return ['LAMMPS 日志分析记录','来源文件：'+name,'LAMMPS 标识：'+(log.version||'日志未显示'),'阶段：'+(segment.id+1)+' / '+segment.label,'原命令：'+(segment.command||'日志未显示，阶段类型未确认'),'阶段行号：'+segment.startLine+'–'+segment.endLine,'结束标记：'+(segment.ended?'见到 Loop time':'未见到 Loop time，运行状态不确定'),'单位：'+units+'；norm = '+segment.norm,'数据列：'+column+' / '+unit(column,units,segment.norm),'横轴：'+axis+' / '+unit(axis,units),'选择区间：'+range[0]+'–'+range[1],'实际有效点区间：'+s.start+'–'+s.end,'有效点：'+s.n+'；剔除非有限值点：'+s.invalid,'均值：'+s.mean,'样本标准差（不是均值误差）：'+s.sd,'最小 / 最大：'+s.min+' / '+s.max,'末值 − 首值：'+s.delta,'线性拟合斜率：'+s.slope,'末半段均值 − 首半段均值：'+s.halfDifference,'','均值与标准差按所选有效输出记录等权计算，不是时间加权平均。','MD 相邻记录通常相关；本报告未估计相关时间、独立样本数或置信区间。','斜率与半段均值差仅用于观察趋势，不自动判断体系达到平衡。','不从当前结构或 in 编辑器推断日志的单位、粒子数、目标温度或力场。','不从 Step 乘当前时间步猜测时间；Time 仅使用日志已有列。','温控、压控及外场下总能可以改变，NVE 的能量漂移也需结合实际设置与收敛试验判断。','','解析与运行提示：',...log.issues.map(i=>'L'+i.line+' ['+i.severity+'] '+i.message),'','官方参考：','https://docs.lammps.org/Run_output.html','https://docs.lammps.org/thermo_style.html','https://docs.lammps.org/Errors_details.html'].join('\n')+'\n'}
function readSession(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>55*1024*1024)fail('分析文件超过 55 MB。');
 let doc;try{doc=JSON.parse(text)}catch{fail('分析文件不是有效的 JSON。')}
 const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
 if(!exact(doc,['format','version','raw','fileName','view'])||doc.format!=='lammps-log-analysis')fail('请选择日志或本网站下载的日志分析文件；工程 JSON 请通过“打开工程”载入。');
 if(doc.version!==1)fail('不支持这个日志分析文件版本。');
 if(typeof doc.fileName!=='string'||doc.fileName.length>500)fail('分析文件中的来源名称无效。');
 const log=parse(doc.raw),v=doc.view;
 if(!log.segments.length){if(v!==null)fail('无 thermo 表的分析文件不能含曲线设置。')}
 else {
  if(!exact(v,['segment','column','axis','from','to','units','mean','trend'])||!Number.isInteger(v.segment)||!log.segments[v.segment])fail('分析文件中的阶段设置无效。');
  const s=log.segments[v.segment];
  if(!s.columns.includes(v.column)||!s.columns.includes(v.axis)||!['step','time'].includes(v.axis.toLowerCase())||!['auto','unknown','lj','real','metal'].includes(v.units)||typeof v.mean!=='boolean'||typeof v.trend!=='boolean')fail('分析文件中的列或单位设置无效。');
  for(const value of [v.from,v.to])if(typeof value!=='string'||value.length>100||(value!==''&&(!numeric.test(value)||!Number.isFinite(Number(value)))))fail('分析区间必须为数字文本或空白草稿。');
 }
 return {raw:doc.raw,fileName:doc.fileName,view:v,log};
}
function writeSession(raw,fileName,view){const text=JSON.stringify({format:'lammps-log-analysis',version:1,raw,fileName,view},null,2);readSession(text);return text+'\n'}
const api={MAX_BYTES,parse,series,unit,label,explanation,csv,report,readSession,writeSession};if(typeof module!=='undefined')module.exports=api;else root.LogCore=api;
})(typeof window!=='undefined'?window:globalThis);
