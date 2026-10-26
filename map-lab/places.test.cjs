// Permanent Nasdara location layer regression tests.
// Run: node map-lab/places.test.cjs
'use strict';
const assert=require('node:assert/strict');
const places=require('./places.js');
const A=require('./advanced.js');
let passed=0;
function check(label,fn){fn();console.log('PASS',label);passed++}
check('Nasdara map includes 78 permanent named places by default',()=>{
 assert.equal(places.count,78);
 assert.equal(places.points.length,78);
 assert.equal(places.grouped.city,2);
 assert.equal(places.grouped.town,14);
 assert.equal(places.grouped.village,42);
 assert.equal(places.grouped.industrial,6);
 assert.equal(places.grouped.airfield,1);
 assert.equal(places.grouped.military,13);
});
check('Grid references convert from top-left map rows to north-increasing game Z',()=>{
 const keys=new Set();
 for(const p of places.points){
  assert(p.name&&typeof p.name==='string');
  const name=p.name.toLowerCase();
  assert(!keys.has(name),'Duplicated place '+name);keys.add(name);
  assert(p.x>0&&p.x<16384&&p.z>0&&p.z<16384,'Outside world '+p.name);
  assert.equal(p.x%100,50);assert.equal((16384-p.z)%100,50);
  assert(p.approximate);
  const grid=p.grid.split(' ').map(Number);
  assert.equal(p.x,grid[0]*100+50);assert.equal(p.z,16384-(grid[1]*100+50));
 }
});
check('Permanent city, airbase and military anchor examples are grounded',()=>{
 const byName=Object.fromEntries(places.points.map(p=>[p.name,p]));
 assert.deepEqual([byName.Dashtabad.x,byName.Dashtabad.z],[10450,10634]);
 assert.deepEqual([byName.Nasdara.x,byName.Nasdara.z],[10150,4234]);
 assert.deepEqual([byName['Dashtabad Airbase'].x,byName['Dashtabad Airbase'].z],[11950,10634]);
 assert.deepEqual([byName['COP Neptune'].x,byName['COP Neptune'].z],[12850,6634]);
 assert.deepEqual([byName['FOB Atlas'].x,byName['FOB Atlas'].z],[8350,5734]);
});
check('Place layer contains no events or dynamic vehicle spawn markers',()=>{
 const forbidden=/^(?:StaticHeliCrash|StaticMilitaryConvoy|VehicleMotorbike|Infected|ItemBricks|Loot)/;
 for(const item of places.points)assert(!forbidden.test(item.name));
 const source=places.SOURCE_URL;
 assert(/^https:\/\//.test(source));
 assert(places.POSITION_ACCURACY.includes('100m'));
});
check('Bundled place data supports fast local name and category search',()=>{
 const index=A.groupPoints(places.points);
 assert.equal(A.searchPoints(index,'DASHTABAD').length,2);
 assert(A.searchPoints(index,'COP Neptune').some(p=>p.kind==='military'));
 assert(A.searchPoints(index,'refinery').some(p=>p.kind==='industrial'));
 assert.equal(A.searchPoints(index,'heli crash').length,0);
});
check('Viewport culling returns permanent sites but excludes distant ones',()=>{
 const index=A.groupPoints(places.points);
 const visible=A.visiblePoints(index,{x0:10000,x1:10700,z0:10300,z1:10900},100);
 assert(visible.some(p=>p.name==='Dashtabad'));
 assert(!visible.some(p=>p.name==='Nasdara'));
});
check('Northern and southern settlements are no longer vertically mirrored',()=>{
 const d=places.points.find(p=>p.name==='Dashtabad');
 const n=places.points.find(p=>p.name==='Nasdara');
 assert(d.z>n.z,'Northern Dashtabad should have a larger game Z than southern Nasdara');
 assert(places.POSITION_ACCURACY.includes('second grid number counts south'));
});
check('User-provided exact POI class industrial remains intact',()=>{
 const imported=A.parsePoints('name,x,z,category\nRefinery,10510,10399,industrial');
 assert.equal(imported[0].kind,'industrial');
});
console.log(passed+' permanent-location tests passed.');
