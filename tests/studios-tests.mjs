// ZedForge v0.3.0 — run with node tests/studios-tests.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../studios.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const core=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const extract=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert(a>=0&&b>a,'Function section exists: '+start);return source.slice(a,b)};
const helpers=new Function(extract('function replaceAttribute(','function parseStudioNumber(')+'\nreturn {replaceAttribute,replaceNthOpeningTag,groupRange,modifyGroup} ')();
const classifyEvent=new Function(extract('function classifyEvent(','function studioOptionFiles(')+'\nreturn classifyEvent')();
let passed=0;function check(name,fn){fn();passed++;console.log('PASS',name)}
const original='<type name="M4A1">\n  <attachments chance="0.50"><item name="ACOGOptic" chance="0.25" /><item name="ReflexOptic" chance="0.35" /></attachments>\n  <cargo chance="0.70" preset="Medical" />\n  <damage min="0.0" max="0.3" />\n</type>';
check('Editing attachment group chance preserves cargo, damage and item names',()=>{
 const result=helpers.modifyGroup(original,'attachments',0,g=>helpers.replaceNthOpeningTag(g,'attachments',0,'chance',1));
 assert(result.includes('<attachments chance="1">'));assert(result.includes('<cargo chance="0.70" preset="Medical" />'));assert(result.includes('<damage min="0.0" max="0.3" />'));assert(result.includes('chance="0.25"'));
});
check('Edits only the requested candidate item',()=>{
 const output=helpers.modifyGroup(original,'attachments',0,g=>helpers.replaceNthOpeningTag(g,'item',1,'chance',.8));
 assert(output.includes('ACOGOptic" chance="0.25"'));assert(output.includes('ReflexOptic" chance="0.8"'));assert(output.includes('<cargo chance="0.70"'));
});
check('Self-closing cargo preset is editable without removing preset',()=>{
 const output=helpers.modifyGroup(original,'cargo',0,g=>helpers.replaceNthOpeningTag(g,'cargo',0,'chance',1));
 assert(output.includes("cargo chance=\"1\" preset=\"Medical\""));
});
check('Damage min and max may be individually controlled',()=>{
 const output=helpers.replaceNthOpeningTag(original,'damage',0,'max',0);
 assert(output.includes('<damage min="0.0" max="0" />'));
});
check('Missing attributes are not silently added',()=>assert.throws(()=>helpers.replaceAttribute('<item name="X"/>','chance',1),/not found/));
const event='<event name="VehicleOffroadHatchback"><nominal>8</nominal><min>5</min><max>11</max><children><child lootmax="0" lootmin="0" max="5" min="3" type="OffroadHatchback"/><child lootmax="0" lootmin="0" max="7" min="1" type="Variant"/></children></event>';
check('Event child adjustment targets the correct child',()=>{
 const output=helpers.replaceNthOpeningTag(event,'child',1,'max',12);
 assert(output.includes('max="5" min="3"'));assert(output.includes('max="12" min="1"'));
});
check('Vehicle classification is exact to prefix',()=>{
 assert.equal(classifyEvent('VehicleOffroadHatchback'),'vehicle');
 assert.equal(classifyEvent('AnimalDeer'),'animal');
 assert.equal(classifyEvent('InfectedArmy'),'infected');
 assert.equal(classifyEvent('StaticHeliCrash'),'crash');
});
check('Events and spawnable pages are in navigation',()=>{for(const id of ['view-events','view-spawnables','events-fields','spawnable-fields','spawnable-file','events-file','boost-exclusions'])assert(html.includes('id="'+id+'"'),id)});
check('Every core/editor UI reference exists',()=>{
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 for(const src of [core,source])for(const hit of src.matchAll(/\$\('([a-z0-9-]+)'\)/g))assert(ids.has(hit[1]),'Missing element: '+hit[1]);
});
check('Offline service worker includes both editors and bundled ZIP processing',()=>{assert(worker.includes('./studios.js'));assert(worker.includes('./vendor/jszip.min.js'))});
check('Bulk item exclusions are implemented',()=>assert(core.includes("boost-exclusions")));
console.log('\n'+passed+' studio checks passed.');
