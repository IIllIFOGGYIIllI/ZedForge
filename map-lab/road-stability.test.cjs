// Road flicker regression: run with node map-lab/road-stability.test.cjs
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=__dirname, source=fs.readFileSync(path.join(root,'app.js'),'utf8'),
  html=fs.readFileSync(path.join(root,'index.html'),'utf8'),projection=require('./projection.js'),data=require('./mapdata.js'),advanced=require('./advanced.js'),places=require('./places.js');
(async()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),events=[],frames=[];
 const counts={bufferStrokes:0,screenStrokes:0,screenImages:0,frames:0};
 const ctx=(id)=>({
  globalAlpha:1,measureText:s=>({width:String(s).length*7}),save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},strokeRect(){},fillRect(){},fill(){},
  arc(){},translate(){},scale(){},setTransform(){},clearRect(){},strokeText(){},fillText(){},setLineDash(){},
  transform(){},rect(){},clip(){},closePath(){},stroke(){counts[id==='buffer'?'bufferStrokes':'screenStrokes']++},
  drawImage(){if(id==='screen')counts.screenImages++}
 });
 const screen=ctx('screen'),buffer=ctx('buffer');
 function element(id){return{
  id,style:{},value:id==='overlay-alpha'?'85':id==='satellite-tone'?'natural':id==='event-filter'?'all':'',
  checked:true,disabled:false,textContent:'',width:180,height:180,
  classList:{add(){},remove(){},toggle(){}},
  getBoundingClientRect(){return{width:1000,height:640,left:0,top:0}},
  getContext(){return id==='map-canvas'?screen:buffer},
  addEventListener(type,fn){events.push({id,type,fn})},
  replaceChildren(){},append(){},add(){},click(){},remove(){},setAttribute(){}
 }}
 const nodes=new Map(ids.map(id=>[id,element(id)]));
 const document={getElementById:id=>nodes.get(id),createElement:()=>element('buffer'),body:element('body')};
 const window={ZedForgeProjection:projection,ZedForgeMapData:data,ZedForgeAdvanced:advanced,ZedForgePlaces:places,
  ZedForgeMapStorage:{read:async()=>null,write:async()=>{},remove:async()=>{}},
  addEventListener(type,fn){events.push({id:'window',type,fn})}};
 const raf=fn=>(frames.push(fn),frames.length);
 const drain=()=>{let n=0;while(frames.length){assert(++n<100,'Rendering did not settle');frames.shift()();counts.frames++}};
 new Function('window','document','requestAnimationFrame','setTimeout','clearTimeout','confirm','Option','console',source)(
  window,document,raf,()=>1,()=>{},()=>true,function Option(label,value){this.label=label;this.value=value},{warn(){}}
 );
 drain();
 const count=1500,raw=new ArrayBuffer(16+count*20),v=new DataView(raw);
 'DVMROAD1'.split('').forEach((letter,i)=>v.setUint8(i,letter.charCodeAt(0)));
 v.setUint32(8,count,true);v.setFloat32(12,16384,true);
 for(let i=0;i<count;i++){const k=16+i*20,x=(i*73)%16360,z=(i*101)%16360;
  v.setFloat32(k,x,true);v.setFloat32(k+4,z,true);v.setFloat32(k+8,x+15,true);
  v.setFloat32(k+12,z+15,true);v.setUint8(k+16,i%2)}
 const file={name:'nasdara.roads',size:raw.byteLength,arrayBuffer:async()=>raw};
 const importer=events.find(x=>x.id==='roads-file'&&x.type==='change');
 assert(importer,'Roads file input must be wired');
 await importer.fn({target:{files:[file],value:'nasdara.roads'}});
 drain();
 const base={...counts};
 assert.equal(base.bufferStrokes,4,'Both categories must be composed to a finished buffer');
 for(let i=0;i<4;i++){nodes.get('zoom-in').onclick();drain()}
 const deep={...counts};
 assert(deep.screenStrokes>base.screenStrokes,'Close zoom should draw visible road vectors');
 for(let i=0;i<4;i++){nodes.get('zoom-out').onclick();drain()}
 assert.equal(counts.bufferStrokes,base.bufferStrokes,'Zooming must never rebuild the entire road layer');
 assert(counts.screenImages>deep.screenImages,'Overview must reuse the completed road image');
 assert(!source.includes('desynchronized:true'),'Visible canvas must not expose partially drawn frames');
 console.log('PASS road network painted only at import or layer changes');
 console.log('PASS zoomed-in road vectors use viewport work');
 console.log('PASS overview reuses stable road image after panning/zooming');
 console.log('PASS visible canvas uses synchronized presentation');
 console.log('4 road stability integration checks passed.');
})().catch(err=>{console.error(err);process.exitCode=1});
