// End-to-end browser import simulation for the consolidated Nasdara Map Lab.
// Run: node map-lab/advanced-integration.test.cjs
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const P=require('./projection.js'),M=require('./mapdata.js'),A=require('./advanced.js'),PL=require('./places.js'),SV=require('./services.js'),ACC=require('./accuracy.js');
async function main(){
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 const listeners=[],frames=[],labelStrokes=[];
 const ctx={
  save(){},restore(){},fillRect(){},strokeRect(){},clearRect(){},setTransform(){},
  beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},fillText(){},strokeText(...args){labelStrokes.push(args)},
  arc(){},closePath(){},setLineDash(){},drawImage(){},scale(){},translate(){},transform(){},
  measureText:txt=>({width:txt.length*7})
 };
 function node(id){
  return {
   id,style:{},textContent:'',value:id==='overlay-alpha'?'85':id==='road-visibility'?'120':
    id==='road-width'?'8':id==='vegetation-detail'?'60':id==='satellite-tone'?'natural':
    id==='event-filter'?'all':'',
   checked:true,disabled:false,width:180,height:180,options:[],
   classList:{add(){},remove(){},toggle(){}},
   getContext(){return ctx},getBoundingClientRect(){return{width:1100,height:670,left:0,top:0}},
   addEventListener(type,fn){listeners.push({id,type,fn})},
   replaceChildren(...nodes){this.options=[...nodes]},
   append(...nodes){this.options.push(...nodes)},
   add(option){this.options.push(option)},
   remove(){},click(){},setAttribute(){},
   setPointerCapture(){}
  };
 }
 const elements=new Map(ids.map(id=>[id,node(id)]));
 const doc={
  getElementById:id=>elements.get(id),
  createElement:id=>node(id),
  body:node('body')
 };
 const requests=[];
 const storage={read:async()=>null,write:async(k,v)=>{requests.push({key:k,value:v})},remove:async()=>{}};
 const zipManifest={format:'zedforge-tiles-v1',worldSize:16384,tiles:[
  {path:'tiles/0.jpg',x:0,z:0,width:16384,height:16384,level:0},
  {path:'tiles/1.jpg',x:4096,z:4096,width:4096,height:4096,level:3}
 ]};
 const zip={
  files:{'zedforge-tiles.json':{dir:false},'tiles/0.jpg':{dir:false},'tiles/1.jpg':{dir:false}},
  file:name=>({async:async type=>type==='string'?JSON.stringify(zipManifest):new Blob(['fake'],{type:'image/jpeg'})})
 };
 const win={
  ZedForgeProjection:P,ZedForgeMapData:M,ZedForgeVegetation:{makeOverlay:()=>({canvas:node('mask')})},
  ZedForgeAdvanced:A,ZedForgePlaces:PL,ZedForgeServices:SV,ZedForgeAccuracy:ACC,ZedForgeMapStorage:storage,
  JSZip:{loadAsync:async()=>zip},
  addEventListener(type,fn){listeners.push({id:'window',type,fn})}
 };
 const fakeImage=()=>({width:4096,height:4096,close(){}});
 const script=new Function('window','document','requestAnimationFrame','setTimeout','clearTimeout',
   'confirm','Option','createImageBitmap','console',source);
 script(win,doc,fn=>(frames.push(fn),frames.length),()=>1,()=>{},()=>true,
   function Option(text,value){this.text=text;this.value=value},async()=>fakeImage(),{warn(){}});
 function flush(max=70){let n=0;while(frames.length&&n++<max)frames.shift()()}
 const handler=(id,type='change')=>{
  const found=listeners.find(e=>e.id===id&&e.type===type);
  assert(found,'Missing '+id+' '+type+' listener');return found.fn
 };
 await Promise.resolve();await Promise.resolve();flush();
 // Pinch keeps the source world point fixed while fingers move; the released
 // finger must not trigger an accidental selection.
 const pinchDown=handler('map-canvas','pointerdown');
 const pinchMove=handler('map-canvas','pointermove');
 const pinchUp=handler('map-canvas','pointerup');
 pinchDown({button:0,pointerId:11,clientX:500,clientY:300,shiftKey:false});
 pinchDown({button:0,pointerId:12,clientX:700,clientY:300,shiftKey:false});
 pinchMove({pointerId:12,clientX:820,clientY:300,button:0});
 flush();
 const pinchZoom=parseFloat(elements.get('zoom-label').textContent.slice(5));
 assert(pinchZoom>1.4&&pinchZoom<2);
 pinchUp({pointerId:12,clientX:820,clientY:300,button:0});
 pinchUp({pointerId:11,clientX:500,clientY:300,button:0});
 const wheelHandler=handler('map-canvas','wheel');
 wheelHandler({clientX:600,clientY:320,deltaY:-8,deltaMode:0,preventDefault(){}});
 flush();
 const wheelZoom=parseFloat(elements.get('zoom-label').textContent.slice(5));
 assert(wheelZoom>pinchZoom&&wheelZoom<pinchZoom*1.1,'Wheel zoom must be smooth, not a fixed 17% jump');
 console.log('PASS two-finger pinch and small wheel movements zoom smoothly without false clicks');
 assert(elements.get('poi-status').textContent.includes('78 permanent Nasdara places ready'));
 elements.get('poi-search').value='Dashtabad';
 elements.get('poi-search').oninput();
 assert.equal(elements.get('poi-results').options.length,2);
 assert(PL.points.find(p=>p.name==='Nasdara').z<PL.points.find(p=>p.name==='Dashtabad').z);
 assert.equal(PL.points.find(p=>p.name==='Nasdara').z,4234);
 assert(labelStrokes.some(p=>p[0]==='NASDARA'),'The capital must be drawn as uppercase map text');
 const capital=labelStrokes.find(p=>p[0]==='NASDARA'),northern=labelStrokes.find(p=>p[0]==='DASHTABAD');
 assert(northern,'Dashtabad city map label missing');
 assert(northern[2]<capital[2],'The northern city label must be above the southern capital');
 assert(!source.includes('ctx.fillRect(box.x,box.y,box.w,box.h)'),'Location labels must not use boxed badges');
 console.log('PASS map typography draws unboxed city text in corrected north-south order');
 assert(elements.get('show-military').checked);
 console.log('PASS all 78 named Nasdara locations are searchable on first load');
 assert.equal(SV.count,109);
 assert(!SV.points.some(p=>p.kind==='repair'));
 assert.equal(SV.points.filter(p=>p.kind==='radio').length,1);
 elements.get('poi-search').value='Fuel station';
 elements.get('poi-search').oninput();
 assert.equal(elements.get('poi-results').options.length,22);
 console.log('PASS 109 permanent source-verified facilities are searchable without user imports');
 assert(elements.get('show-fuel').checked);
 assert(elements.get('show-medical').checked);
 assert(elements.get('show-water-facilities').checked);
 elements.get('poi-results').onchange({target:{value:'0'}});
 flush();
 const facility=SV.points.find(x=>x.kind==='fuel');
 assert(elements.get('selected-readout').textContent.includes('Fuel station'));
 assert(elements.get('selected-readout').textContent.includes('X '));
 assert(elements.get('location-quality').textContent.includes('Official mission building coordinate'));
 console.log('PASS selecting a permanent facility jumps to its exact game coordinates');
 handler('map-canvas','pointermove')({clientX:550,clientY:335,button:0});
 assert(elements.get('service-tooltip').textContent.includes('Fuel station'),
   'Hovering over a facility should show its actual building');
 assert.equal(elements.get('service-tooltip').hidden,false);
 console.log('PASS facility symbols reveal hover details at close zoom');
 elements.get('poi-search').value='Nasdara';elements.get('poi-search').oninput();
 const capitalChoice=elements.get('poi-results').options.findIndex(x=>x.text.startsWith('Nasdara •'));
 assert(capitalChoice>=0);
 elements.get('poi-results').onchange({target:{value:String(capitalChoice)}});flush();
 assert(elements.get('location-quality').textContent.includes('Approximate 100 m grid square'));
 assert(elements.get('selected-readout').textContent.includes('±50 m per axis'));
 assert(elements.get('show-accuracy-bounds').checked);
 elements.get('export-accuracy').onclick();
 console.log('PASS selected map-grid places disclose their 100m uncertainty and export source audit');
 const satellite={name:'nasdara.png',type:'image/png',size:10000};
 await handler('image-file')({target:{files:[satellite],value:'nasdara.png'}});
 flush();
 assert(elements.get('image-status').textContent.includes('4096'));
 console.log('PASS satellite image loads before optional data layers');
 const poi={name:'points.csv',size:200,text:async()=> 'name,x,z,category\nNorth Town,1010,2020,town\nSupply Depot,4050,6060,landmark'};
 await handler('poi-file')({target:{files:[poi],value:'points.csv'}});
 flush();
 assert(elements.get('poi-status').textContent.includes('2 named'));
 elements.get('poi-search').value='North';
 elements.get('poi-search').oninput();
 assert.equal(elements.get('poi-results').options.length,1);
 console.log('PASS named locations import, render and search');
 const trees={name:'trees.geojson',size:1000,text:async()=>JSON.stringify({
   type:'FeatureCollection',features:[{type:'Feature',properties:{name:'Tree'},
   geometry:{type:'Point',coordinates:[1234,5678]}}]})};
 await handler('trees-file')({target:{files:[trees],value:'trees.geojson'}});
 flush();
 assert(elements.get('trees-status').textContent.includes('1 mapped'));
 assert.equal(elements.get('show-trees').checked,true);
 console.log('PASS real tree points load as spatially culled optional layer');
 const landmarks={name:'checks.csv',size:200,text:async()=>
   'name,x,z,pixelX,pixelY\nA,8292,8092,2048,2048\nB,4196,3996,1024,3072'};
 await handler('calibration-file')({target:{files:[landmarks],value:'checks.csv'}});
 assert(elements.get('calibration-status').textContent.includes('residual RMS 0.00'));
 assert.equal(elements.get('apply-calibration').disabled,false);
 elements.get('apply-calibration').onclick();
 assert(elements.get('calibration-status').textContent.includes('Applied measured'));
 elements.get('reset-calibration').onclick();
 assert(elements.get('calibration-status').textContent.includes('restored'));
 console.log('PASS two verified landmarks measure, apply and reset image offset');
 const rows=['name,x,z,pixelX,pixelY'];
 for(let i=0;i<25;i++){const x=1000+i*100,z=4000+i*100;rows.push('Site'+i+','+x+','+z+','+x/4+','+(16384-z)/4)}
 rows.push('Bad,8000,8000,1985,2096'); // 60m disagreement, RMS under 20m.
 const inconsistent={name:'outlier.csv',size:200,text:async()=>rows.join('\n')};
 await handler('calibration-file')({target:{files:[inconsistent],value:'outlier.csv'}});
 assert(elements.get('calibration-status').textContent.includes('worst'));
 assert.equal(elements.get('apply-calibration').disabled,true);
 console.log('PASS isolated severe landmark errors block calibration even when overall RMS is low');
 const tiles={name:'nasdara-tiles.zip',size:5000};
 await handler('tile-file')({target:{files:[tiles],value:'nasdara-tiles.zip'}});
 flush();
 assert(elements.get('tile-status').textContent.includes('2 calibrated'));
 elements.get('clear-tiles').onclick();
 assert(elements.get('tile-status').textContent.includes('cleared'));
 console.log('PASS multi-resolution ZIP manifest loads without a server or remote requests');
 assert(!source.includes('fetch('));
 console.log('PASS all new imports are local-only');
 console.log('11 advanced integration checks passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
