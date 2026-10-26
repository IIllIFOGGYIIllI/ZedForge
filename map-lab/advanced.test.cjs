// node map-lab/advanced.test.cjs
'use strict';
const assert=require('node:assert/strict'),A=require('./advanced.js');
let passed=0;
function check(label,fn){fn();console.log('PASS',label);passed++}
check('Quoted CSV supports commas, CRLF and BOM',()=>{
 const rows=A.parseCSV('\uFEFFname,x,z,category\r\n"Town, North",1000,2000,town\r\n');
 assert.equal(rows.length,2);assert.equal(rows[1][0],'Town, North');
});
check('CSV POIs retain named categories and accurate X/Z',()=>{
 const places=A.parsePoints('name,x,z,category\nAirfield,1234.25,5678.75,airfield\nFuel Stop,150,250,fuel');
 assert.equal(places.length,2);assert.equal(places[0].x,1234.25);assert.equal(places[0].z,5678.75);
 assert.equal(places[0].kind,'airfield');assert.equal(places[1].kind,'fuel');
});
check('GeoJSON location import accepts game-coordinate Points',()=>{
 const text=JSON.stringify({type:'FeatureCollection',features:[
  {type:'Feature',properties:{name:'North',category:'city'},geometry:{type:'Point',coordinates:[111,222]}},
  {type:'Feature',properties:{name:'South',category:'forest'},geometry:{type:'Point',coordinates:[333,444]}}
 ]});
 const p=A.parsePoints(text,'geojson','other');
 assert.deepEqual(p.map(x=>[x.x,x.z,x.kind]),[[111,222,'city'],[333,444,'forest']]);
});
check('Coordinates outside Nasdara are excluded',()=>{
 const p=A.parsePoints('name,x,z\nValid,0,16384\nOut,16385,100\nInvalid,-1,100\nNull,,200');
 assert.equal(p.length,1);assert.equal(p[0].name,'Valid');
});
check('Map POI spatial index culls outside-viewport entries',()=>{
 const points=A.parsePoints('name,x,z\nA,100,200\nB,5000,6000\nC,102,204');
 const index=A.groupPoints(points);
 assert.deepEqual(A.visiblePoints(index,{x0:90,x1:120,z0:190,z1:220}).map(x=>x.name),['A','C']);
 assert.deepEqual(A.visiblePoints(index,{x0:250,x1:290,z0:300,z1:400}),[]);
});
check('POI search is case-insensitive and bounded',()=>{
 const i=A.groupPoints(A.parsePoints('name,x,z,category\nWest Town,10,20,town\nEast Port,40,50,airfield'));
 assert.equal(A.searchPoints(i,'WEST')[0].name,'West Town');
 assert.equal(A.searchPoints(i,'airfield')[0].name,'East Port');
 assert.equal(A.searchPoints(i,'',10).length,0);
});
check('Two-landmark image calibration measures a 100m translation exactly',()=>{
 const csv='name,x,z,pixelX,pixelY\nA,8292,8092,2048,2048\nB,4196,3996,1024,3072';
 const result=A.parseCalibration(csv,4096,4096);
 assert.equal(result.count,2);assert.equal(result.dx,100);assert.equal(result.dz,-100);
 assert.equal(result.rms,0);
});
check('Conflicting landmarks produce non-zero error',()=>{
 const csv='name,x,z,pixelX,pixelY\nA,8292,8092,2048,2048\nB,4396,3996,1024,3072';
 const value=A.parseCalibration(csv,4096,4096);
 assert(value.rms>90);assert.equal(value.count,2);
});
check('Calibration requires real image dimensions and two references',()=>{
 assert.throws(()=>A.parseCalibration('name,x,z,pixelX,pixelY\nA,10,20,30,40',4096,4096),/At least two/);
 assert.throws(()=>A.parseCalibration('name,x,z,pixelX,pixelY\nA,10,20,30,40\nB,20,30,40,50',0,4096),/image first/);
});
check('Valid tile manifest checks local image paths and bounds',()=>{
 const input={format:'zedforge-tiles-v1',worldSize:16384,tiles:[
  {path:'tiles/1.png',x:0,z:0,width:8192,height:8192,level:2},
  {path:'tiles/2.png',x:8192,z:0,width:8192,height:8192,level:2}
 ]};
 const result=A.parseTileManifest(input,new Set(['tiles/1.png','tiles/2.png']));
 assert.equal(result.length,2);assert.equal(result[1].x,8192);
});
check('Tile parser rejects path traversal and missing files',()=>{
 const base={format:'zedforge-tiles-v1',worldSize:16384,tiles:[
  {path:'../bad.png',x:0,z:0,width:8192,height:8192,level:1}
 ]};
 assert.throws(()=>A.parseTileManifest(base,new Set(['../bad.png'])),/Invalid tile path/);
 base.tiles[0].path='missing.png';
 assert.throws(()=>A.parseTileManifest(base,new Set()),/Missing tile/);
});
check('Tile LOD selects suitable zoom and only visible coverage',()=>{
 const tiles=[
  {path:'overview.jpg',x:0,z:0,width:16384,height:16384,level:0},
  {path:'detail.jpg',x:5000,z:6000,width:1000,height:1000,level:3},
  {path:'far.jpg',x:12000,z:12000,width:1000,height:1000,level:3}
 ];
 const view={x0:4800,x1:6200,z0:5900,z1:7200};
 assert.deepEqual(A.selectTiles(tiles,view,2).map(x=>x.path),['overview.jpg']);
 assert.deepEqual(A.selectTiles(tiles,view,16).map(x=>x.path),['overview.jpg','detail.jpg']);
});

check('Known Nasdara static structure models yield true tree coordinates',()=>{
 const count=295195,modelCount=1697;
 const placements=new Array(count).fill({model:10}),coordinates=new Float32Array(count*4);
 placements[12]={model:915};coordinates[12*4]=8300;coordinates[12*4+1]=10500;
 placements[24]={model:917};coordinates[24*4]=8305;coordinates[24*4+1]=10510;
 const result=A.extractKnownStructureTrees({format:'dvmobj1',modelCount,count,placements,coordinates});
 assert(result.compatible);assert.equal(result.points.length,2);
 assert.deepEqual(result.points.map(p=>[p.x,p.z,p.model]),[
  [8300,10500,'misc_tree_pavement1'],[8305,10510,'misc_tree_pavement3']
 ]);
});
check('Unknown structure releases do not fabricate tree points',()=>{
 const result=A.extractKnownStructureTrees({format:'dvmobj1',modelCount:1696,
   count:295195,placements:[],coordinates:new Float32Array(0)});
 assert.equal(result.compatible,false);assert.deepEqual(result.points,[]);
});

console.log(passed+' advanced mapping tests passed.');
