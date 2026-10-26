// Static facility geography from official DayZ Nasdara mission XML.
// Run: node map-lab/services.test.cjs
'use strict';
const assert=require('node:assert/strict');
const S=require('./services.js');
const A=require('./advanced.js');
let passed=0;
function check(name,fn){fn();console.log('PASS',name);passed++}
check('Permanent service index includes 115 official building sites',()=>{
 assert.equal(S.count,115);assert.equal(S.points.length,115);
 for(const [type,count] of Object.entries({fuel:22,medical:28,police:19,fire:11,watertower:28,repair:6,radio:1}))
  assert.equal(S.grouped[type],count);
});
check('Service coordinates are valid native DayZ metres with unique identifiers',()=>{
 const ids=new Set();
 for(const p of S.points){
  assert(p.x>=0&&p.x<=16384&&p.z>=0&&p.z<=16384);
  assert(p.model.startsWith('Land_'));
  assert(p.permanent===true);
  assert(!ids.has(p.id));ids.add(p.id);
 }
});
check('Data contains no heli crashes, dynamic vehicles or mission spawns',()=>{
 for(const p of S.points){
  assert(!/^(Static|Vehicle|Infected|Loot|Ambient)/i.test(p.model));
  assert(!p.kind.includes('event'));
 }
});
check('Fuel sites within 45m are deduplicated',()=>{
 const f=S.points.filter(p=>p.kind==='fuel');
 for(let i=0;i<f.length;i++)for(let j=i+1;j<f.length;j++){
  assert(Math.hypot(f[i].x-f[j].x,f[i].z-f[j].z)>=45);
 }
});
check('Native world Z is not flipped as the place-name paper grid is',()=>{
 const gas=S.points.find(p=>p.model==='Land_FuelStation_Build_Takistan');
 assert(gas&&gas.x>3000&&gas.z>4000);
 assert.equal(gas.z,4728);
});
check('Spatial culling and name search find official services',()=>{
 const index=A.groupPoints(S.points);
 const near=A.visiblePoints(index,{x0:3000,x1:4000,z0:4500,z1:5300},50);
 assert(near.some(p=>p.kind==='fuel'));
 assert(A.searchPoints(index,'medical').length>0);
});
check('Service location descriptions distinguish buildings from guaranteed supplies',()=>{
 assert(S.points.find(p=>p.kind==='fuel').note.includes('not guaranteed'));
 assert(S.points.find(p=>p.kind==='watertower').note.includes('not guaranteed'));
 assert(S.SOURCE_URL.includes('BohemiaInteractive'));
});
console.log(passed+' service geography checks passed.');
