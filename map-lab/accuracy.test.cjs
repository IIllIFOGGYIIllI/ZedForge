// Nasdara provenance and source-accuracy regression tests.
'use strict';
const assert=require('node:assert/strict');
const ACC=require('./accuracy.js'),PL=require('./places.js'),SV=require('./services.js');
let passed=0;
function check(name,fn){fn();console.log('PASS',name);passed++}
check('The 78 built-in names remain approximate and 109 facilities retain mission positions',()=>{
  const c=ACC.coverage(PL.points,SV.points);
  assert.deepEqual(c,{total:187,grid:78,official:109,user:0});
});
check('Published top-left paper grid converts to the correct world square',()=>{
  const capital=PL.points.find(p=>p.name==='Nasdara');
  assert.deepEqual(ACC.gridBounds(capital),{x0:10100,x1:10200,z0:4184,z1:4284,metres:100});
  const city=PL.points.find(p=>p.name==='Dashtabad');
  assert.deepEqual(ACC.gridBounds(city),{x0:10400,x1:10500,z0:10584,z1:10684,metres:100});
});
check('Native game mission positions never receive an invented grid box',()=>{
  assert.equal(ACC.gridBounds(SV.points[0]),null);
  assert(ACC.provenance(SV.points[0]).detail.includes('does not guarantee'));
  assert.equal(ACC.gridBounds({...PL.points[0],x:1}),null);
});
check('User-supplied locations stay unverified rather than becoming official points',()=>{
  const value={name:'Example',x:6500,z:6500};
  assert.equal(ACC.provenance(value).key,'user-supplied');
  assert.deepEqual(ACC.coverage([value],[]),{total:1,grid:0,official:0,user:1});
});
check('CSV exports all native and grid positions with provenance, not fabricated precision',()=>{
  const csv=ACC.csvAudit(PL.points,SV.points);
  assert.equal(csv.trim().split('\r\n').length,188);
  assert(csv.includes('grid-approximate'));
  assert(csv.includes('official-structure'));
  assert(csv.includes('±50 m'));
  assert(!csv.includes('Repair centre'));
});
check('User-supplied names cannot become spreadsheet formulas on export',()=>{
  const csv=ACC.csvAudit([{name:'=HYPERLINK("evil")',x:1,z:2}],[]);
  assert(csv.includes("'=HYPERLINK"));
});
console.log(passed+' accuracy checks passed.');
