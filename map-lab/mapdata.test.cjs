// Regression and binary-format tests for Map Lab v0.3.3.
// node map-lab/mapdata.test.cjs
'use strict';
const assert=require('node:assert/strict');
const M=require('./mapdata.js');
let passed=0;
function check(name,fn){fn();console.log('PASS',name);passed++}
const writeMagic=(view,text)=>{for(let i=0;i<text.length;i++)view.setUint8(i,text.charCodeAt(i))};
function roads(){
 const a=new ArrayBuffer(16+3*20),v=new DataView(a);writeMagic(v,'DVMROAD1');v.setUint32(8,3,true);v.setFloat32(12,16384,true);
 const records=[[0,0,150,200,0],[1200,4000,1600,4300,1],[15000,12000,15100,12200,0]];
 records.forEach((rec,i)=>{const b=16+i*20;for(let k=0;k<4;k++)v.setFloat32(b+k*4,rec[k],true);v.setUint8(b+16,rec[4])});
 return a
}
function structures(){
 const size=28+60+8+4*8+2*20,a=new ArrayBuffer(size),v=new DataView(a);
 writeMagic(v,'DVMOBJ1\0');v.setFloat32(8,16384,true);v.setUint32(12,1,true);v.setUint32(16,2,true);v.setUint32(20,1,true);v.setUint32(24,4,true);
 const b=28;v.setUint32(b+0,0,true);v.setUint32(b+4,1,true);v.setUint32(b+8,0,true);
 for(const [i,n]of [0,0,10,6].entries())v.setFloat32(b+44+i*4,n,true);
 const ring=28+60;v.setUint32(ring,0,true);v.setUint32(ring+4,4,true);
 const point=ring+8;[[0,0],[10,0],[10,6],[0,6]].forEach(([x,z],i)=>{v.setFloat32(point+i*8,x,true);v.setFloat32(point+i*8+4,z,true)});
 const placement=point+32;
 [[500,500,0,1],[700,700,90,2]].forEach(([x,z,deg,scale],i)=>{const p=placement+i*20;v.setUint32(p,0,true);v.setFloat32(p+4,x,true);v.setFloat32(p+8,z,true);v.setFloat32(p+12,deg,true);v.setFloat32(p+16,scale,true)});
 return a
}
check('Nasdara binary roads parse signed format and segment classes',()=>{
 const x=M.parseRoads(roads());assert.equal(x.count,3);assert.equal(x.asphalt,2);assert.equal(x.dirt,1);
 assert.equal(x.values[7],4300);assert.equal(x.kinds[1],1);
});
check('Invalid road signature is rejected',()=>{const a=roads();new DataView(a).setUint8(0,65);assert.throws(()=>M.parseRoads(a),/Invalid DVMROAD1/)});
check('Mismatched road count is rejected',()=>{const a=roads();new DataView(a).setUint32(8,100,true);assert.throws(()=>M.parseRoads(a),/size|count/)});
check('Wrong world size is rejected',()=>{const a=roads();new DataView(a).setFloat32(12,2000,true);assert.throws(()=>M.parseRoads(a),/world extent/)});
check('Invalid road coordinates are rejected',()=>{const a=roads();new DataView(a).setFloat32(16,-900,true);assert.throws(()=>M.parseRoads(a),/outside Nasdara/)});
check('Road GeoJSON LineString / MultiLineString are parsed',()=>{
 const x=M.parseGeoJSON({type:'FeatureCollection',features:[
  {type:'Feature',geometry:{type:'LineString',coordinates:[[10,20],[30,40],[50,60]]}},
  {type:'Feature',geometry:{type:'MultiLineString',coordinates:[[[100,200],[300,400]]]}}
 ]});assert.equal(x.count,3);assert.equal(x.values[8],100)
});
check('Geographical longitude/latitude is not treated as projected coordinates',()=>{
 assert.throws(()=>M.parseGeoJSON({type:'LineString',coordinates:[[20,-22],[22,-20]]}),/game X\/Z metres/)
});
check('Real object binary schema parses models and placements',()=>{
 const x=M.parseObjects(structures());assert.equal(x.count,2);assert.equal(x.modelCount,1);assert.equal(x.models[0].bounds[2],10);
 assert.equal(x.points.length,8);assert(x.gridLinks>=2);
});
check('Structures can be spatially queried',()=>{
 const layer=M.parseObjects(structures());
 assert.deepEqual(M.collectVisible(layer,{x0:475,x1:530,z0:475,z1:530}),[0]);
 assert.deepEqual(M.collectVisible(layer,{x0:660,x1:750,z0:660,z1:740}),[1]);
});
check('Invalid building binary signature is rejected',()=>{const a=structures();new DataView(a).setUint8(0,80);assert.throws(()=>M.parseObjects(a),/Invalid DVMOBJ1/)});
check('Truncated building binary fails without partial state',()=>{const a=structures().slice(0,-20);assert.throws(()=>M.parseObjects(a),/Incomplete DVMOBJ1/)});
check('Building placements outside expected bounds are rejected',()=>{const a=structures();new DataView(a).setFloat32(28+60+8+32+4,-600,true);assert.throws(()=>M.parseObjects(a),/Invalid structure placement/)});

check('Local building picture is drawn using model affine mapping',()=>{
 const bytes=structures(),v=new DataView(bytes),b=28;v.setUint32(b+8,4,true);v.setUint32(b+12,64,true);v.setUint32(b+16,32,true);
 v.setFloat32(b+20,1,true);v.setFloat32(b+32,1,true);
 const layer=M.parseObjects(bytes),projection=require('./projection.js'),images=[],transforms=[];
 const original=global.Path2D;global.Path2D=class{moveTo(){}lineTo(){}closePath(){}};
 const ctx={save(){},restore(){},transform(...args){transforms.push(args)},drawImage(...args){images.push(args)},fill(){},stroke(){}};
 try{
  let requested=0;const opts={camera:projection.view(500,500,30),width:1000,height:700,projection,
    pictureFor:index=>index===0?{width:64,height:32}:null,requestPicture:()=>requested++};
  const result=M.renderStructures(ctx,layer,opts);assert(result.drawn>0);assert(images.length>0,'Expected a textured model');assert.equal(requested,0);
  assert(images[0][3]===64&&images[0][4]===32);assert(transforms.some(a=>a.length===6&&a[0]===1&&a[3]===1));
 }finally{if(original===undefined)delete global.Path2D;else global.Path2D=original}
});


check('Road spatial index finds intersecting segments without scanning all roads',()=>{
 const layer=M.parseRoads(roads());
 assert.equal(layer.grid.length,4096);
 assert(layer.gridLinks>=3);
 assert.deepEqual(M.collectRoadSegments(layer,{x0:1190,x1:1400,z0:3990,z1:4200}),[1]);
 assert.deepEqual(M.collectRoadSegments(layer,{x0:9000,x1:10000,z0:9000,z1:10000}),[]);
});
check('Long segments crossing a viewport are included without internal endpoints',()=>{
 const a=roads(),v=new DataView(a);
 v.setFloat32(16,500,true);v.setFloat32(20,6000,true);
 v.setFloat32(24,12000,true);v.setFloat32(28,6000,true);
 const layer=M.parseRoads(a);
 assert(M.collectRoadSegments(layer,{x0:7500,x1:7600,z0:5900,z1:6100}).includes(0));
});
check('World road paint never clears a destination canvas',()=>{
 const layer=M.parseRoads(roads()),calls=[];
 const ctx={save(){calls.push('save')},restore(){calls.push('restore')},beginPath(){},moveTo(x,y){calls.push(['move',x,y])},
    lineTo(x,y){calls.push(['line',x,y])},stroke(){calls.push('stroke')}};
 const count=M.paintRoadSegments(ctx,layer,[0,1,2],(x,z)=>({x,y:z}),{overview:true});
 assert.equal(count,3);assert(calls.some(x=>x==='stroke'));
 assert(!calls.includes('clearRect'));assert(!calls.includes('fillRect'));
 assert.deepEqual(calls.filter(x=>x==='stroke').length,4);
});
check('Type-specific road overlays retain paved/dirt toggle separation',()=>{
 const layer=M.parseRoads(roads()),counts={strokes:0};
 const ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){counts.strokes++}};
 M.paintRoadSegments(ctx,layer,[0,1,2],(x,z)=>({x,y:z}),{asphalt:false,dirt:true});
 assert.equal(counts.strokes,2);
});


check('Building paint job can be split into complete, ordered batches',()=>{
 const a=structures(),layer=M.parseObjects(a),projection=require('./projection.js');
 const original=global.Path2D,seen=[],ctx={
  save(){},restore(){},transform(...args){if(args.length===6)seen.push(args)},beginPath(){},fill(){},stroke(){},
  drawImage(){}
 };
 global.Path2D=class{moveTo(){}lineTo(){}closePath(){}};
 try{
  const task=M.createStructureJob(ctx,layer,{camera:projection.view(600,600,30),width:1000,height:700,projection});
  const first=task.step(1);
  assert.equal(first.done,false,'First batch must not publish an incomplete image');
  assert.equal(first.drawn,1);
  const completed=task.step(1);
  assert.equal(completed.done,true);
  assert.equal(completed.drawn,2);
  assert.equal(completed.visible,2);
  assert.equal(task.step(1).done,true,'Re-entered completed job must remain complete');
 }finally{if(original===undefined)delete global.Path2D;else global.Path2D=original}
});
check('Cancelled structure jobs do not continue painting',()=>{
 const layer=M.parseObjects(structures()),projection=require('./projection.js');
 const original=global.Path2D;global.Path2D=class{moveTo(){}lineTo(){}closePath(){}};
 let fills=0,restores=0;
 const ctx={save(){},restore(){restores++},transform(){},fill(){fills++},stroke(){}};
 try{
   const task=M.createStructureJob(ctx,layer,{camera:projection.view(600,600,30),width:1000,height:700,projection});
   const partial=task.step(1);assert.equal(partial.done,false);
   task.cancel();assert.equal(task.step(1).done,true);
   assert.equal(fills,1,'Cancellation must prevent additional draw calls');
   assert.equal(restores,2,'One per-object restore plus one final job restore');
 }finally{if(original===undefined)delete global.Path2D;else global.Path2D=original}
});
check('Completed textured roofs report their real drawn picture count',()=>{
 const layer=M.parseObjects(structures()),projection=require('./projection.js');
 const original=global.Path2D;global.Path2D=class{moveTo(){}lineTo(){}closePath(){}};
 const ctx={save(){},restore(){},transform(){},fill(){},stroke(){},drawImage(){}};
 try{
   const model=layer.models[0];model.flags=4;model.width=64;model.height=32;
   model.matrix.set([1,0,0,1,0,0]);
   const rendered=M.renderStructures(ctx,layer,{camera:projection.view(600,600,30),width:1000,height:700,
     projection,pictureFor:()=>({width:64,height:32})});
   assert.equal(rendered.pictures,2);
 }finally{if(original===undefined)delete global.Path2D;else global.Path2D=original}
});


check('Short aligned road gaps are joined without changing original segments',()=>{
 const coords=new Float32Array([100,200,180,200,185,200,265,200]);
 const layer=M.buildRoadIndex({format:'synthetic',count:2,values:coords,kinds:new Uint8Array([0,0]),asphalt:2,dirt:0});
 assert.equal(layer.baseCount,2);assert.equal(layer.count,2);
 assert.equal(layer.repairedJoins,1);assert.equal(layer.drawCount,3);
 assert.deepEqual(Array.from(layer.values.slice(0,8)),Array.from(coords));
 assert.deepEqual(Array.from(layer.values.slice(8,12)),[180,200,185,200]);
 assert.deepEqual(M.collectRoadSegments(layer,{x0:181,x1:183,z0:199,z1:201}).includes(2),true);
});
check('No artificial connectors across parallel lanes or unrelated roads',()=>{
 const l=M.buildRoadIndex({count:2,
   values:new Float32Array([100,200,180,200,100,205,180,205]),
   kinds:new Uint8Array([0,0])});
 assert.equal(l.repairedJoins,0);
 const other=M.buildRoadIndex({count:2,
   values:new Float32Array([100,200,180,200,185,200,265,200]),
   kinds:new Uint8Array([0,1])});
 assert.equal(other.repairedJoins,0);
});
check('Long gaps and directionally opposed candidates remain disconnected',()=>{
 const long=M.buildRoadIndex({count:2,values:new Float32Array([100,200,180,200,200,200,280,200]),kinds:new Uint8Array([0,0])});
 assert.equal(long.repairedJoins,0);
 const reversed=M.buildRoadIndex({count:2,values:new Float32Array([100,200,180,200,185,200,105,200]),kinds:new Uint8Array([0,0])});
 assert.equal(reversed.repairedJoins,0);
});
check('Intersection styling keeps round ends and paints all outlines first',()=>{
 const calls=[];
 const ctx={save(){},restore(){},beginPath(){calls.push('begin')},moveTo(){},lineTo(){},
   stroke(){calls.push(['stroke',this.strokeStyle,this.lineWidth])}};
 const layer={values:new Float32Array([100,200,110,200,105,190,105,210]),kinds:new Uint8Array([0,1])};
 const count=M.paintRoadSegments(ctx,layer,[0,1],(x,z)=>({x,y:z}));
 assert.equal(count,2);
 assert.equal(ctx.lineCap,'round');
 const paints=calls.filter(a=>Array.isArray(a));
 assert.equal(paints.length,4);
 assert(paints[0][2]>paints[2][2], 'Edges precede road interiors');
 assert(paints[1][2]>paints[3][2], 'Both classes outlined before filling');
});

check('Yellow paved roads have wider outlines only at close zoom',()=>{
 const layer={values:new Float32Array([10,20,30,40,40,50,60,70]),kinds:new Uint8Array([0,1])};
 function collect(overview){
  const strokes=[];
  const ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},
   stroke(){strokes.push({colour:this.strokeStyle,width:this.lineWidth})}};
  M.paintRoadSegments(ctx,layer,[0,1],(x,z)=>({x,y:z}),{overview});
  return strokes;
 }
 const detailed=collect(false),overview=collect(true);
 assert.deepEqual(detailed,[
  {colour:'#4b4338',width:2.8},{colour:'#5a4a1f',width:4},
  {colour:'#d8c29a',width:1.7},{colour:'#f2d35b',width:2.6}
 ]);
 assert.deepEqual(overview,[
  {colour:'#4b4338',width:1.3},{colour:'#5a4a1f',width:1.75},
  {colour:'#d8c29a',width:.7},{colour:'#f2d35b',width:1}
 ]);
});

check('Close-up road strokes match metres-to-pixels map scale',()=>{
 const layer={values:new Float32Array([10,20,30,40,40,50,60,70]),kinds:new Uint8Array([0,1])};
 const result=[];
 const ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},
   stroke(){result.push({colour:this.strokeStyle,width:this.lineWidth})}};
 M.paintRoadSegments(ctx,layer,[0,1],(x,z)=>({x,y:z}),{
   worldScale:2,pavedWidthMeters:8
 });
 assert.equal(result.length,4);
 assert.equal(result[0].colour,'#4b4338');
 assert.equal(result[1].colour,'#5a4a1f');
 assert.equal(result[3].colour,'#f2d35b');
 assert(Math.abs(result[0].width-8.8)<.01,'Dirt road width should scale in world metres');
 assert(Math.abs(result[1].width-16)<.01,'Paved road should cover 8 metres at 2px/m');
 assert(Math.abs(result[2].width-6.776)<.01,'Dirt inner line should retain edge');
 assert(Math.abs(result[3].width-13.28)<.01,'Yellow centre should fill most of the paved road');
});
check('Overview keeps its original road line widths regardless of world scale',()=>{
 const layer={values:new Float32Array([10,20,30,40,40,50,60,70]),kinds:new Uint8Array([0,1])},paint=[];
 const ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},
   stroke(){paint.push([this.strokeStyle,this.lineWidth])}};
 M.paintRoadSegments(ctx,layer,[0,1],(x,z)=>({x,y:z}),{
   overview:true,worldScale:12,pavedWidthMeters:12
 });
 assert.deepEqual(paint,[
  ['#4b4338',1.3],['#5a4a1f',1.75],['#d8c29a',.7],['#f2d35b',1]
 ]);
});
check('Road widths are bounded even at maximum zoom',()=>{
 const layer={values:new Float32Array([10,20,30,40,40,50,60,70]),kinds:new Uint8Array([0,1])},widths=[];
 const ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},
   stroke(){widths.push(this.lineWidth)}};
 M.paintRoadSegments(ctx,layer,[0,1],(x,z)=>({x,y:z}),{worldScale:999,pavedWidthMeters:999});
 assert.equal(widths[0],15);
 assert.equal(widths[1],26);
 assert(widths[2]<widths[0]&&widths[3]<widths[1],'Road borders must remain visible');
});
check('At zoom 64, an eight-metre paved road occupies road-sized pixels',()=>{
 const P=require('./projection.js'),scale=P.scale(P.view(8192,8192,64),1245,576);
 const widths=[];
 const ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},
   stroke(){widths.push(this.lineWidth)}};
 const layer={values:new Float32Array([10,20,30,40]),kinds:new Uint8Array([0])};
 M.paintRoadSegments(ctx,layer,[0],(x,z)=>({x,y:z}),{worldScale:scale,pavedWidthMeters:8});
 assert(widths[0]>14&&widths[0]<20,'Close-up paved overlay should be ~15-18px, not 4px');
});

console.log('\n'+passed+' detailed map layer checks passed.');
