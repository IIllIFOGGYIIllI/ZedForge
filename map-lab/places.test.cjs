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
check('All names are unique and use actual Nasdara game X/Z grid metres',()=>{
 const keys=new Set();
 for(const p of places.points){
  assert(p.name&&typeof p.name==='string');
  const name=p.name.toLowerCase();
  assert(!keys.has(name),'Duplicated place '+name);keys.add(name);
  assert(p.x>0&&p.x<16384&&p.z>0&&p.z<16384,'Outside world '+p.name);
  assert.equal(p.x%100,50);assert.equal(p.z%100,50);
  assert(p.approximate);
  const grid=p.grid.split(' ').map(Number);
  assert.equal(p.x,grid[0]*100+50);assert.equal(p.z,grid[1]*100+50);
 }
});
check('Permanent city, airbase and military anchor examples are grounded',()=>{
 const byName=Object.fromEntries(places.points.map(p=>[p.name,p]));
 assert.deepEqual([byName.Dashtabad.x,byName.Dashtabad.z],[10450,5750]);
 assert.deepEqual([byName.Nasdara.x,byName.Nasdara.z],[10150,12150]);
 assert.deepEqual([byName['Dashtabad Airbase'].x,byName['Dashtabad Airbase'].z],[11950,5750]);
 assert.deepEqual([byName['COP Neptune'].x,byName['COP Neptune'].z],[12850,9750]);
 assert.deepEqual([byName['FOB Atlas'].x,byName['FOB Atlas'].z],[8350,10650]);
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
 const visible=A.visiblePoints(index,{x0:10000,x1:10700,z0:5400,z1:6100},100);
 assert(visible.some(p=>p.name==='Dashtabad'));
 assert(!visible.some(p=>p.name==='Nasdara'));
});
check('User-provided exact POI class industrial remains intact',()=>{
 const imported=A.parsePoints('name,x,z,category\nRefinery,10510,10399,industrial');
 assert.equal(imported[0].kind,'industrial');
});
console.log(passed+' permanent-location tests passed.');
