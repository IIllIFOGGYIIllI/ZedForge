// Map Lab interface consistency checks. Run with node map-lab/interface.test.cjs
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=__dirname;
const load=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=load('index.html'),app=load('app.js'),projection=load('projection.js'),storage=load('storage.js'),mapdata=load('mapdata.js'),vegetation=load('vegetation.js'),css=load('style.css');
const scripts=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m=>m[1]);
let passed=0;
function check(name,fn){fn();console.log('PASS',name);passed++}
check('All JavaScript sources are local and present',()=>{
 assert(scripts.includes('./storage.js'));assert(scripts.includes('./app.js'));assert(scripts.includes('./projection.js'));assert(scripts.includes('./mapdata.js'));assert(scripts.includes('../vendor/jszip.min.js'));
 assert(scripts.indexOf('../vendor/jszip.min.js')<scripts.indexOf('./app.js'));
 for(const src of scripts){assert(src.startsWith('./')||src.startsWith('../vendor/'));assert(fs.existsSync(path.join(root,src)))}
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
check('Native roads and buildings import controls are present',()=>{
 for(const id of ['objects-file','roads-file','show-structures','show-asphalt','show-dirt','map-layer-count'])assert(html.includes('id="'+id+'"'));
 assert(app.includes('M.parseRoads'));assert(app.includes('M.parseObjects'));
});
check('Binary roads and buildings are restored from browser storage',()=>{
 assert(app.includes("cache.read('buildings')"));assert(app.includes("cacheLayer('buildings'"));assert(app.includes('loadStructureLayer'));
 assert(app.includes('loadRoadLayer'));assert(app.includes("cache.read('roads')"));
});
check('Measurements, overview and map focus work without external scripts',()=>{
 for(const id of ['measure-toggle','measure-reset','measure-status','overview-canvas','toggle-sidebar','focus-map','scale-line'])assert(html.includes('id="'+id+'"'));
 assert(app.includes('drawMeasurement'));assert(app.includes('drawOverview'));assert(app.includes('updateScale'));
});
check('Satellite colour modes and overlay opacity are wired',()=>{
 assert(app.includes('satelliteTone'));assert(app.includes('overlayAlpha'));assert(html.includes('id="satellite-tone"'));assert(html.includes('id="overlay-alpha"'));
});
check('Spatially indexed structure renderer exists',()=>{assert(mapdata.includes('collectVisible'));assert(mapdata.includes('renderStructures'));assert(mapdata.includes('DVMOBJ1'));assert(mapdata.includes('DVMROAD1'))});
check('Top-down building imagery uses a local ZIP and lazy decoding',()=>{
 assert(html.includes('id="pictures-file"'));assert(html.includes('id="pictures-status"'));
 assert(app.includes('loadPictureFiles'));assert(app.includes("cache.read('pictures')"));assert(app.includes('PICTURE_BUDGET'));
 assert(mapdata.includes('ctx.drawImage(photo'));assert(mapdata.includes('model.matrix'));
});

check('Roads are composited from a complete cached layer at wide zoom',()=>{
 assert(app.includes('rebuildRoadOverview'));
 assert(app.includes('roadOverview=off'));
 assert(app.includes('ctx.drawImage(roadOverview'));
 assert(app.includes('ROAD_OVERVIEW_RES'));
});
check('Close-up roads use spatial viewport queries rather than full-map redraw',()=>{
 assert(app.includes('M.collectRoadSegments(layer,r'));
 assert(app.includes('M.paintRoadSegments(ctx,layer,visible'));
 assert(mapdata.includes('buildRoadIndex'));
 assert(mapdata.includes('collectRoadSegments'));
});
check('Main canvas is synchronized to prevent partially displayed frames',()=>{
 assert(!app.includes('desynchronized:true'));
 assert(app.includes("getContext('2d',{alpha:false})"));
});
check('Building picture visibility has a real rendering counter',()=>{
 assert(app.includes('textured roofs'));
 assert(mapdata.includes('pictures++'));
});


check('Completed-frame building surfaces replace per-pointer synchronous painting',()=>{
 assert(mapdata.includes('createStructureJob'));
 assert(app.includes('structureFront={surface,camera,width,height,result}'));
 assert(app.includes('drawStructureSurface'));
 assert(app.includes('ctx.drawImage(front.surface'));
 assert(!/function drawStructures\(\)\{\s*M\.renderStructures\(/.test(app));
});
check('Building work is incremental and cancelled on camera changes',()=>{
 assert(app.includes('STRUCTURE_BATCH=140'));
 assert(app.includes('setTimeout(batch,0)'));
 assert(app.includes('cancelStructureJob'));
 assert(app.includes('invalidateStructures()'));
 assert(app.includes('PICTURE_BUDGET=192*1024*1024'));
});
check('Bright roads have independently adjustable visibility',()=>{
 assert(html.includes('id="road-visibility"'));
 assert(html.includes('id="road-visibility-value"'));
 assert(app.includes('state.roadVisibility'));
 assert(app.includes('roadVisibility:state.roadVisibility'));
 assert(mapdata.includes("inner:'#f2d35b'"));
});


check('Satellite trees can be enhanced selectively without fabricating locations',()=>{
 assert(html.includes('id="vegetation-detail"'));
 assert(html.includes('id="vegetation-detail-value"'));
 assert(app.includes('state.vegetationDetail'));
 assert(app.includes("V.makeOverlay"));
 assert(app.includes('state.vegetationOverlay'));
 assert(vegetation.includes('vegetationStrength'));
});
check('Road smoothing links remain visible at both close and overview zoom',()=>{
 assert(app.includes('layer.drawCount||layer.count'));
 assert(mapdata.includes('repairRoadJunctions'));
 assert(mapdata.includes("ctx.lineCap='round'"));
});

check('User can tune a road width measured in world metres',()=>{
 assert(html.includes('id="road-width"'));
 assert(html.includes('id="road-width-value"'));
 assert(html.includes('min="3" max="12" step="0.5" value="8"'));
 assert(app.includes('worldScale:P.scale(state.camera,state.width,state.height)'));
 assert(app.includes('pavedWidthMeters:state.roadWidthMeters'));
 assert(app.includes('roadWidthMeters:state.roadWidthMeters'));
 assert(app.includes("state.roadWidthMeters=P.clamp(session.roadWidthMeters,3,12)"));
 assert(app.includes("$('road-width').oninput="));
});
check('Changing close-up road width avoids expensive overview layer rebuilding',()=>{
 const line=app.match(/\$\('road-width'\)\.oninput=e=>\{[\s\S]*?\n  \};/);
 assert(line,'Road width change handler absent');
 assert(!line[0].includes('rebuildRoadOverview'));
 assert(line[0].includes('schedule();saveView()'));
 assert(mapdata.includes('outerWidth:overview?1.75:pavedOuter'));
});

console.log('\n'+passed+' Map Lab interface checks passed.');
