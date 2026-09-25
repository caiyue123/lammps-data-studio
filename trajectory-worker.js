importScripts('trajectory-core.js?v=trajectory3');
onmessage=({data:raw})=>{try{const data=TrajectoryCore.parse(raw),buffers=[];for(const f of data.frames){buffers.push(f.positions.buffer);if(f.unwrapped)buffers.push(f.unwrapped.buffer)}postMessage({data},buffers)}catch(e){postMessage({error:e.message})}};
