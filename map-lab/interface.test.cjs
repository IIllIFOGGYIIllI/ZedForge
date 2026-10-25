// Map Lab interface consistency checks. Run with node map-lab/interface.test.cjs
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=__dirname;
const load=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=load('index.html'),app=load('app.js'),projection=load('projection.js'),storage=load('storage.js'),css=load('style.css');
const scripts=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m=>m[1]);
let passed=0;
function check(name,fn){fn();console.log('PASS',name);passed++}
check('All JavaScript sources are local and present',()=>{
 assert(scripts.includes('./storage.js'));assert(scripts.includes('./app.js'));assert(scripts.includes('./projection.js'));
 for(const src of scripts){assert(src.startsWith('./'));assert(fs.existsSync(path.join(root,src)))}
});
check('Map Lab source contains no automatic remote image requests',()=>{assert(!/fetch\((['"])(https?:)/.test(app));assert(!/<script[^>]*src="https?:/.test(html))});
check('All referenced element IDs are present',()=>{
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 const refs=[...app.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]);
 for(const id of refs)assert(ids.has(id),'Missing element '+id);
});
check('No duplicate HTML IDs',()=>{const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size)});
check('Image persistence can be disabled and erased',()=>{for(const s of ['remember-image','forget-image','cache.remove','cacheLayer'])assert(app.includes(s))});
check('Marker editing and CSV exports are wired',()=>{for(const s of ['update-marker','marker-label','renderMarkerList','export-markers'])assert(app.includes(s))});
check('Road and event overlays can be locally restored',()=>{assert(app.includes("cache.read('roads')"));assert(app.includes("cache.read('events')"));assert(app.includes("cacheLayer('roads'"));assert(app.includes("cacheLayer('events'"))});
check('Map coordinates use verified 16384m world extent',()=>{assert(projection.includes('16384'));assert(projection.includes('(1-z/extent)'))});
check('Local storage uses IndexedDB, not network',()=>{assert(storage.includes('indexedDB.open'));assert(!storage.includes('fetch('))});
check('Map drag/drop and mobile image decoder fallback exist',()=>{assert(app.includes("'dragenter'"));assert(app.includes('new Image()'))});
check('Core visual styling exists',()=>{assert(css.includes('.marker-line.selected'));assert(css.includes('.source-quality'))});
console.log('\n'+passed+' Map Lab interface checks passed.');
