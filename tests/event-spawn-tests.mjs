// ZedForge Event Spawn Studio — isolated XML mutation regression checks.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const E=require('../spawn-engine.js');
const sample=`<?xml version="1.0"?>
<eventposdef>
  <!-- Retain important admin comments -->
  <event name="VehicleOffroadHatchback">
    <pos x="3100.25" z='8500' a="-1" custom="keep" />
    <pos x="5100" z="9000" a="180" />
  </event>
  <event name="StaticHeliCrash"><pos x="100" z="200" a="90" /></event>
</eventposdef>`;
function validDoc(xml){
  const blocks=[...xml.matchAll(/<event\\b[^>]*name\\s*=\\s*(["'])([^"']+)\\1[^>]*>([\\s\\S]*?)<\\/event>/g)];
  return {documentElement:{localName:'eventposdef',children:blocks.map(b=>({
    localName:'event',getAttribute:()=>b[2],children:[...b[3].matchAll(/<pos\\b[^>]*\\/>/g)].map(m=>({
      localName:'pos',getAttribute:k=>(new RegExp('\\b'+k+'\\s*=\\s*(["\\\'])([^"\\\']*)\\1').exec(m[0])||[])[2]??null
    }))
  }))}};
}
const parsed=E.parse(sample,validDoc);
assert.equal(parsed.events.length,2);assert.equal(parsed.entries.length,3);
assert.equal(parsed.entries[0].x,3100.25);assert.equal(parsed.entries[0].a,-1);
const next=E.update(sample,0,0,{x:'3201.333',z:'8501.5',a:'-1'},validDoc,16384);
assert(next.includes('x="3201.333" z=\'8501.5\' a="-1" custom="keep"'));
assert(next.includes('<!-- Retain important admin comments -->'));
assert(next.includes('<pos x="5100" z="9000" a="180" />'));
assert(next.includes('<event name="StaticHeliCrash"><pos x="100" z="200" a="90" /></event>'));
assert.equal(E.parse(next,validDoc).entries[0].x,3201.333);
assert.equal(E.update(sample,0,0,{x:'3100.25',z:'8500',a:'-1'},validDoc),sample);
assert.throws(()=>E.update(sample,0,0,{x:'17000',z:'8500',a:30},validDoc),/X must/);
assert.throws(()=>E.update(sample,0,0,{x:'NaN',z:'8500',a:30},validDoc),/X must/);
assert.throws(()=>E.update(sample,0,0,{x:'100',z:'200',a:400},validDoc),/Orientation must/);
assert.throws(()=>E.parse('<types/>',()=>({documentElement:{localName:'types',children:[]}})),/eventposdef/);
assert(E.inspect(sample,validDoc,16384).some(x=>x.level==='ok'));
const ui=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../spawn-studio.js',import.meta.url),'utf8');
const map=readFileSync(new URL('../map-lab/app.js',import.meta.url),'utf8');
for(const id of ['view-spawns','spawns-file','spawns-event','spawns-position','spawns-save','spawns-map','spawns-x','spawns-z','spawns-a'])assert(ui.includes('id="'+id+'"'));
for(const match of script.matchAll(/\$\('([a-z0-9-]+)'\)/g))assert(ui.includes('id="'+match[1]+'"'),'Missing UI ID '+match[1]);
assert(map.includes("type:'zedforge:event-spawn-coordinate'"));
console.log('PASS Event Spawn Studio engine, validation, exact formatting, map handoff UI');
