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

console.log('\n'+passed+' detailed map layer checks passed.');
