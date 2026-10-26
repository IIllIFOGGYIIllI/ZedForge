// Map Lab interface consistency checks. Run with node map-lab/interface.test.cjs
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=__dirname;
const load=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=load('index.html'),app=load('app.js'),projection=load('projection.js'),storage=load('storage.js'),mapdata=load('mapdata.js'),vegetation=load('vegetation.js'),advanced=load('advanced.js'),places=load('places.js'),services=load('services.js'),accuracy=load('accuracy.js'),css=load('style.css');
const scripts=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m=>m[1]);
let passed=0;
function check(name,fn){fn();console.log('PASS',name);passed++}
check('All JavaScript sources are local and present',()=>{
 assert(scripts.includes('./storage.js'));assert(scripts.includes('./app.js'));assert(scripts.includes('./projection.js'));assert(scripts.includes('./mapdata.js'));assert(scripts.includes('./advanced.js'));assert(scripts.includes('./places.js'));assert(scripts.includes('./services.js'));assert(scripts.includes('./accuracy.js'));assert(scripts.includes('../vendor/jszip.min.js'));
 assert(scripts.indexOf('../vendor/jszip.min.js')<scripts.indexOf('./app.js'));
 for(const src of scripts){assert(src.startsWith('./')||src.startsWith('../vendor/'));assert(fs.existsSync(path.join(root,src)))}
});
check('Grid accuracy source labelling and audit controls are provided',()=>{
 for(const id of ['show-accuracy-bounds','location-quality','export-accuracy'])assert(html.includes('id="'+id+'"'));
 for(const phrase of ['ZedForgeAccuracy','drawAccuracyBoundary','ACC.csvAudit','updateAccuracyReadout'])assert(app.includes(phrase));
 assert(accuracy.includes('gridBounds'));assert(accuracy.includes('official-structure'));
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


check('Consolidated POI, forest, satellite tiles and alignment controls exist',()=>{
 for(const id of ['tile-file','tile-status','clear-tiles','poi-file','trees-file','poi-search','poi-results','poi-search-status',
    'show-pois','show-trees','calibration-file','calibration-status','apply-calibration','reset-calibration','frame-metrics']){
  assert(html.includes('id="'+id+'"'),'Missing '+id);
 }
 assert(advanced.includes('parseTileManifest'));
 assert(advanced.includes('parseCalibration'));
});
check('Map drawing order preserves existing roads and structures',()=>{
 assert(app.includes('drawImage();drawTiles()'));
 assert(app.includes('drawRoads();drawStructures();drawTrees();drawEvents();drawLocations();drawServices()'));
 assert(app.includes('metrics(start)'));
 assert(app.includes('PICTURE_BUDGET=192*1024*1024'));
});
check('Optional imported map data is locally saved and restored',()=>{
 for(const name of ["cache.read('pois')","cache.read('trees')","cache.read('tilepack')",
    "cacheLayer('tilepack'","cacheLayer(type==='trees'?'trees':'pois'"])
  assert(app.includes(name),name);
 assert(app.includes("state.calibration={dx:result.dx,dz:result.dz}"));
});
check('Detailed raster overlays do not downgrade the base map at overview zoom',()=>{
 assert(app.includes('state.image&&tile.level===0'));
 assert(app.includes('TILE_BUDGET=144*1024*1024'));
 assert(app.includes('MAX_TILE_IMAGES=110'));
});
check('Minimap draws from cached thumbnail rather than decoding satellite every frame',()=>{
 assert(app.includes('let overviewThumb=null'));
 assert(app.includes('if(!overviewThumb)'));
 assert(app.includes('painter.drawImage(state.image,0,0,w,h)'));
});


check('Real Nasdara named locations are bundled and displayed without an upload',()=>{
 assert(places.includes('ZedForgePlaces'));
 assert(app.includes('poiIndex:A.groupPoints(PL?.points||[])'));
 assert(app.includes('mergePermanentPlaces()'));
 assert(app.includes('permanent Nasdara places ready'));
 assert(html.includes('78 named Nasdara locations included'));
 assert(html.includes('www.nasdaramap.com/guide'));
});
check('Cartographic labels use traditional typography and category visibility filters',()=>{
 for(const id of ['show-pois','show-villages','show-military','show-industry']){
  assert(html.includes('id="'+id+'"'));
  assert(app.includes("'"+id+"'"));
 }
 assert(app.includes('function poiVisible(loc)'));
 assert(app.includes('ctx.strokeText(label,pos.x,pos.y)'));
 assert(app.includes('ctx.fillText(label,pos.x,pos.y)'));
 assert(app.includes('Georgia, "Times New Roman", serif'));
 assert(app.includes("loc.name.toLocaleUpperCase()"));
 assert(!app.includes("ctx.fillRect(box.x,box.y,box.w,box.h)"));
 assert(places.includes("16384-(southRow*100+50)"));
});
check('Only the map-grid place data is inverted, not original game coordinates',()=>{
 assert(mapdata.includes('function paintRoadSegments'));
 assert(app.includes('state.selected={x:loc.x,z:loc.z}'));
 assert(places.includes('second grid number counts south'));
});
check('Existing custom place imports add to the built-in map rather than replacing it',()=>{
 assert(app.includes('mergePermanentPlaces(list)'));
 assert(app.includes("records.set(p.name.toLocaleLowerCase(),p)"));
 assert(app.includes("A.groupPoints(Array.from(records.values()))"));
});
check('Dynamic events are hidden until their distinct icon system is ready',()=>{
 assert(app.includes('showSpawns:false'));
 assert(html.includes('id="show-spawns" type="checkbox" disabled'));
 assert(html.includes('for="events-file" hidden'));
 assert(!app.includes("['show-spawns','spawns'],['show-grid','grid']"));
});


check('Official fixed facilities are locally bundled and source-attributed',()=>{
 assert(services.includes('ZedForgeServices'));
 assert(services.includes('44b32f032cc85b8ffdde94deda70b455d3fc94bb'));
 assert(services.includes("Water tower structure; drinking-water access is not guaranteed"));
 assert(html.includes('109 verified positions'));
 assert(html.includes('src="./services.js"'));
 assert(app.includes('serviceIndex:A.groupPoints(S?.points||[])'));
 assert(html.includes('Radio building <span>1'));
 assert(!services.includes("repair:'Repair centre'"));
});
check('Six retained facility types have vector map glyphs, hover details and click selection',()=>{
 for(const token of ['function drawFacilityGlyph','function drawServices','function hitService','function updateServiceTooltip',
    'function facilityVisible','ctx.fillRect(x-1.6,y-5,3.2,10)','site.name'])
  assert(app.includes(token),'Missing '+token);
 assert(html.includes('id="service-tooltip"'));
 assert(css.includes('.service-tooltip[hidden]'));
});
check('Permanent buildings can be filtered without changing town labels or events',()=>{
 for(const id of ['show-services','show-fuel','show-medical','show-emergency','show-water-facilities','show-infrastructure'])
  assert(html.includes('id="'+id+'"'),'Missing toggle '+id);
 assert(app.includes("['show-services','showServices']"));
 assert(app.includes("['show-water-facilities','waterFacilities']"));
 assert(app.includes('showSpawns:false'));
 assert(html.includes('id="show-spawns" type="checkbox" disabled'));
});
check('Search includes both named places and native static buildings',()=>{
 assert(app.includes("state.searchResults=[...named,...staticSites]"));
 assert(app.includes("A.searchPoints(facilities,search,26)"));
 assert(app.includes("loc.permanent?7:4"));
 assert(app.includes("state.selected={x:loc.x,z:loc.z}"));
});
check('Map product copy no longer calls the working map a prototype',()=>{
 assert(!html.includes('Satellite map prototype'));
 assert(!html.includes('EXPERIMENTAL • LOCAL ONLY'));
 assert(html.includes('Nasdara interactive map'));
});


check('Known model trees load automatically with a matching structure dataset',()=>{
 assert(advanced.includes('function extractKnownStructureTrees'));
 assert(advanced.includes('misc_tree_pavement1/2/3'));
 assert(app.includes('A.extractKnownStructureTrees(structures)'));
 assert(app.includes('function updateTreeLayer()'));
 assert(app.includes('state.nativeTreePoints,...state.manualTreePoints'));
 assert(html.includes('auto-detect if available'));
});

console.log('\n'+passed+' Map Lab interface checks passed.');
