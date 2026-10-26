// ZedForge Map Lab stable-building integration test.
// Run: node map-lab/building-stability.test.cjs
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=__dirname;
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const P=require('./projection.js'),M=require('./mapdata.js'),A=require('./advanced.js'),PL=require('./places.js'),SV=require('./services.js');
const originalPath=global.Path2D;
global.Path2D=class{moveTo(){}lineTo(){}closePath(){}};
async function main(){
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),timers=[],frames=[],listeners=[];
 const counts={screenImages:0,paintedStructures:0,frames:0};
 const canvasContext=kind=>{
  const value={lineWidth:1,font:'11px sans',globalAlpha:1,measureText:s=>({width:String(s).length*7})};
  for(const name of ['save','restore','beginPath','moveTo','lineTo','strokeRect','fillRect','arc','translate',
   'scale','setTransform','clearRect','strokeText','fillText','setLineDash','transform','rect','clip','closePath','stroke'])
   value[name]=()=>{};
  value.fill=()=>{if(kind==='buffer')counts.paintedStructures++};
  value.drawImage=()=>{if(kind==='screen')counts.screenImages++};
  return value
 };
 const frontCtx=canvasContext('screen'),backCtx=canvasContext('buffer');
 function node(id){return{
   id,style:{},value:id==='road-visibility'?'120':id==='overlay-alpha'?'85':
     id==='satellite-tone'?'natural':id==='event-filter'?'all':'',
   checked:true,disabled:false,width:180,height:180,textContent:'',
   classList:{add(){},remove(){},toggle(){return true}},
   getBoundingClientRect(){return{width:1200,height:680,left:0,top:0}},
   getContext(){return id==='map-canvas'?frontCtx:backCtx},
   replaceChildren(){},append(){},add(){},click(){},remove(){},setAttribute(){},setPointerCapture(){},
   addEventListener(type,fn){listeners.push({id,type,fn})}
 }}
 const nodes=new Map(ids.map(id=>[id,node(id)]));
 const document={getElementById:id=>nodes.get(id),createElement:()=>node('buffer'),body:node('body')};
 const window={ZedForgeProjection:P,ZedForgeMapData:M,ZedForgeAdvanced:A,ZedForgePlaces:PL,ZedForgeServices:SV,
   ZedForgeMapStorage:{read:async()=>null,write:async()=>{},remove:async()=>{}},
   addEventListener(type,fn){listeners.push({id:'window',type,fn})}};
 let nextTimerId=1;
 const setTimer=(fn,delay)=>(timers.push({id:nextTimerId,fn,delay}),nextTimerId++);
 const clearTimer=id=>{const i=timers.findIndex(t=>t.id===id);if(i>=0)timers.splice(i,1)};
 const raf=fn=>(frames.push(fn),frames.length);
 async function flush(max=500){
   for(let i=0;i<max;i++){
     await Promise.resolve();
     if(frames.length){frames.shift()();counts.frames++}
     else if(timers.length)timers.shift().fn();
     else{await Promise.resolve();if(!frames.length&&!timers.length)break}
   }
 }
 function fixture(count){
   const buffer=new ArrayBuffer(28+60+8+4*8+count*20),v=new DataView(buffer);
   'DVMOBJ1\0'.split('').forEach((c,i)=>v.setUint8(i,c.charCodeAt(0)));
   v.setFloat32(8,16384,true);v.setUint32(12,1,true);v.setUint32(16,count,true);
   v.setUint32(20,1,true);v.setUint32(24,4,true);v.setUint32(32,1,true);
   [0,0,7,7].forEach((n,i)=>v.setFloat32(28+44+i*4,n,true));
   v.setUint32(88,0,true);v.setUint32(92,4,true);
   [[0,0],[7,0],[7,7],[0,7]].forEach(([x,z],i)=>{
     v.setFloat32(96+i*8,x,true);v.setFloat32(100+i*8,z,true)
   });
   for(let i=0;i<count;i++){
     const o=128+i*20;
     v.setUint32(o,0,true);v.setFloat32(o+4,8200+(i*13)%900,true);
     v.setFloat32(o+8,8200+(i*43)%900,true);v.setFloat32(o+12,0,true);
     v.setFloat32(o+16,1,true)
   }
   return buffer
 }
 new Function('window','document','requestAnimationFrame','setTimeout','clearTimeout','confirm',
   'Option','console',app)(window,document,raf,setTimer,clearTimer,()=>true,
   function Option(label,value){this.label=label;this.value=value},{warn(){}});
 await flush(30);
 const importer=listeners.find(e=>e.id==='objects-file'&&e.type==='change');
 assert(importer,'Structure importer not wired');
 const raw=fixture(3000),file={name:'nasdara.objects',size:raw.byteLength,arrayBuffer:async()=>raw};
 const done=importer.fn({target:{files:[file],value:'nasdara.objects'}});
 await flush(60);await done;
 for(let i=0;i<5;i++)nodes.get('zoom-in').onclick();
 await flush(650);
 assert(counts.paintedStructures>2000,'Expected a large structure layer to be painted');
 assert(counts.screenImages>0,'A completed structure buffer must be composited');
 console.log('PASS 3,000-object scene completes in background batches');
 const painted=counts.paintedStructures,images=counts.screenImages;
 nodes.get('zoom-in').onclick();
 // Draw one visible frame without running the delayed replacement job.
 assert(frames.length,'Zoom should request an immediate frame');
 frames.shift()();counts.frames++;
 assert.equal(counts.paintedStructures,painted,'Navigation must not synchronously repaint roofs');
 assert(counts.screenImages>images,'The last completed structure layer must remain visible');
 console.log('PASS navigating immediately reuses the stable completed frame');
 await flush(650);
 assert(counts.paintedStructures>painted,'A replacement frame must eventually be rebuilt');
 console.log('PASS replacement building frame completes only after navigation settles');
 assert(!app.includes('desynchronized:true'),'Visible canvas cannot expose incomplete content');
 console.log('3 building stability integration checks passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{
 if(originalPath===undefined)delete global.Path2D;else global.Path2D=originalPath
});
