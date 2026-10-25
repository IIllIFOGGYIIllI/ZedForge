'use strict';
/* ZedForge Map Lab — browser-only Nasdara prototype; no proprietary map assets shipped. */
(() => {
  const P=window.ZedForgeProjection;
  const EXTENT=P.EXTENT, $=id=>document.getElementById(id);
  const canvas=$('map-canvas'),region=$('map-region'),ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});
  const state={camera:P.view(),width:0,height:0,dpr:1,image:null,imageUrl:null,roads:[],eventSpawns:[],eventNames:[],
    markers:[],cursor:null,selected:null,drag:null,pointerDown:null,showRoads:true,showSpawns:true,showGrid:true,showMarkers:true};
  let toastId=0,frame=0;
  function notify(text){const node=$('toast');node.textContent=text;node.style.display='block';clearTimeout(toastId);toastId=setTimeout(()=>node.style.display='none',4200)}
  function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;draw()})}
  function resize(){const rect=region.getBoundingClientRect();state.width=rect.width;state.height=rect.height;state.dpr=Math.min(2,window.devicePixelRatio||1);
    const width=Math.max(1,Math.round(state.width*state.dpr)),height=Math.max(1,Math.round(state.height*state.dpr));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}
    schedule()}
  function worldFromPointer(e){const r=canvas.getBoundingClientRect();return P.fromScreen(e.clientX-r.left,e.clientY-r.top,state.camera,state.width,state.height)}
  function pointerOffset(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
  function fmt(x){return Number(x).toFixed(2)}
  function worldValid(p){return P.validateWorld(p.x,p.z)}
  function coordsInSidebar(p){$('coord-x').value=Number(p.x.toFixed(3));$('coord-z').value=Number(p.z.toFixed(3))}
  function updateReadout(p){$('cursor-readout').textContent=worldValid(p)?'X '+fmt(p.x)+' • Z '+fmt(p.z):'Outside Nasdara terrain'}
  function updateZoom(){ $('zoom-label').textContent='Zoom '+(state.camera.zoom).toFixed(state.camera.zoom<10?2:1)+'×'}
  function toS(x,z){return P.toScreen(x,z,state.camera,state.width,state.height)}
  function visibleExtent(){const a=P.fromScreen(0,state.height,state.camera,state.width,state.height),b=P.fromScreen(state.width,0,state.camera,state.width,state.height);return{x0:Math.max(0,a.x),x1:Math.min(EXTENT,b.x),z0:Math.max(0,a.z),z1:Math.min(EXTENT,b.z)}}
  function drawWorldGrid(){
    const step=P.niceStep(100/P.scale(state.camera,state.width,state.height)),r=visibleExtent();if(r.x0>r.x1||r.z0>r.z1)return;
    ctx.save();ctx.strokeStyle=state.image?'rgba(205,243,232,.22)':'rgba(79,158,148,.21)';ctx.lineWidth=1;
    ctx.font='10px ui-monospace, SFMono-Regular, Consolas, monospace';ctx.fillStyle='#ccf9e1';
    const top=toS(0,EXTENT),left=toS(0,0);
    for(let x=Math.ceil(r.x0/step)*step;x<=r.x1;x+=step){const a=toS(x,0),xx=a.x;ctx.beginPath();ctx.moveTo(xx,0);ctx.lineTo(xx,state.height);ctx.stroke();ctx.fillText(String(x),xx+4,Math.max(20,Math.min(state.height-10,top.y+18)))}
    for(let z=Math.ceil(r.z0/step)*step;z<=r.z1;z+=step){const yy=toS(0,z).y;ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(state.width,yy);ctx.stroke();ctx.fillText('Z '+z,Math.max(12,Math.min(state.width-52,left.x+8)),yy-5)}
    ctx.restore();
  }
  function drawWorldBounds(){
    const tl=toS(0,EXTENT),br=toS(EXTENT,0);
    ctx.save();ctx.lineWidth=1.2;ctx.strokeStyle='#6ce6b9';ctx.strokeRect(tl.x,tl.y,br.x-tl.x,br.y-tl.y);ctx.restore()
  }
  function drawImage(){
    if(!state.image)return;
    const a=toS(0,EXTENT),b=toS(EXTENT,0),w=b.x-a.x,h=b.y-a.y;
    if(w<1||h<1)return;
    ctx.drawImage(state.image,a.x,a.y,w,h)
  }
  function drawRoads(){
    if(!state.showRoads||!state.roads.length)return;
    const bounds=visibleExtent(),s=P.scale(state.camera,state.width,state.height);
    ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=Math.max(1.2,Math.min(3.2,s*12));
    ctx.strokeStyle='rgba(255,226,152,.92)';
    for(const line of state.roads){
      if(line.length<2)continue;
      let inView=false;for(const [x,z] of line){if(x>=bounds.x0&&x<=bounds.x1&&z>=bounds.z0&&z<=bounds.z1){inView=true;break}}
      if(!inView&&line.length>2){ /* Segments may cross the viewport without a vertex inside; draw anyway. */ }
      ctx.beginPath();
      for(let i=0;i<line.length;i++){const a=toS(line[i][0],line[i][1]);if(!i)ctx.moveTo(a.x,a.y);else ctx.lineTo(a.x,a.y)}
      ctx.stroke()
    }
    ctx.restore()
  }
  function pin(x,z,fill,r,stroke='#09141a'){
    const p=toS(x,z);if(p.x<-15||p.x>state.width+15||p.y<-15||p.y>state.height+15)return;
    ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1.2;ctx.stroke()
  }
  function drawEvents(){
    if(!state.showSpawns||!state.eventSpawns.length)return;
    const filter=$('event-filter').value,v=visibleExtent(),zoom=state.camera.zoom,limit=zoom<1.6?1400:6000;let count=0;
    for(const p of state.eventSpawns){if(filter!=='all'&&p.name!==filter)continue;
      if(p.x<v.x0||p.x>v.x1||p.z<v.z0||p.z>v.z1)continue;
      if(++count>limit)break;
      pin(p.x,p.z,'rgba(253,190,86,.85)',zoom>5?3:2)
    }
  }
  function drawMarkers(){
    if(!state.showMarkers)return;
    ctx.save();ctx.font='11px system-ui,sans-serif';ctx.textBaseline='middle';
    state.markers.forEach((m,i)=>{pin(m.x,m.z,'#8ef3c7',5);const p=toS(m.x,m.z);if(state.camera.zoom>1.5) {ctx.fillStyle='#ffffff';ctx.fillText(String(i+1),p.x+10,p.y)}});
    ctx.restore()
  }
  function drawSelection(){
    if(!state.selected||!worldValid(state.selected))return;
    const p=toS(state.selected.x,state.selected.z);ctx.save();ctx.lineWidth=1.2;ctx.strokeStyle='#ffffffa8';
    ctx.beginPath();ctx.arc(p.x,p.y,10,0,Math.PI*2);ctx.moveTo(p.x-16,p.y);ctx.lineTo(p.x+16,p.y);ctx.moveTo(p.x,p.y-16);ctx.lineTo(p.x,p.y+16);ctx.stroke();ctx.restore()
  }
  function draw(){
    ctx.setTransform(state.dpr,0,0,state.dpr,0,0);
    ctx.fillStyle='#0d1e26';ctx.fillRect(0,0,state.width,state.height);
    drawImage();if(state.showGrid)drawWorldGrid();drawWorldBounds();drawRoads();drawEvents();drawMarkers();drawSelection()
  }
  function setCamera(next){state.camera=next;updateZoom();schedule()}
  function moveTo(p){if(!worldValid(p))return notify('Coordinates must be inside Nasdara: X and Z between 0 and 16384');
    state.selected={x:p.x,z:p.z};coordsInSidebar(p);setCamera(P.view(p.x,p.z,Math.max(2.5,state.camera.zoom)));
    $('selected-readout').textContent='Selected X '+fmt(p.x)+' • Z '+fmt(p.z)
  }
  function mouseEvent(e){
    if(e.button!==0)return;
    state.pointerDown={point:pointerOffset(e),camera:{...state.camera},shift:e.shiftKey};
    state.drag={x:e.clientX,y:e.clientY,moved:false};
    canvas.setPointerCapture(e.pointerId);
    region.classList.add('dragging')
  }
  canvas.addEventListener('pointerdown',mouseEvent);
  canvas.addEventListener('pointermove',e=>{
    const current=worldFromPointer(e);state.cursor=current;updateReadout(current);
    if(!state.drag)return;
    const dx=e.clientX-state.drag.x,dy=e.clientY-state.drag.y;
    if(Math.abs(e.clientX-state.pointerDown.point.x-canvas.getBoundingClientRect().left)>4||Math.abs(e.clientY-state.pointerDown.point.y-canvas.getBoundingClientRect().top)>4)state.drag.moved=true;
    const scale=P.scale(state.pointerDown.camera,state.width,state.height);
    setCamera(P.view(state.pointerDown.camera.x-dx/scale,state.pointerDown.camera.z+dy/scale,state.pointerDown.camera.zoom))
  });
  function addMarker(p){
    if(!worldValid(p))return notify('Cannot add a marker outside the map');
    state.markers.push({x:Number(p.x.toFixed(3)),z:Number(p.z.toFixed(3))});$('marker-count').textContent=state.markers.length+' marker'+(state.markers.length===1?'':'s')+' (in this tab)';schedule();notify('Marker added at X '+fmt(p.x)+' / Z '+fmt(p.z))
  }
  canvas.addEventListener('pointerup',e=>{
    if(!state.drag)return;
    const wasDrag=state.drag.moved;
    state.drag=null;region.classList.remove('dragging');
    if(!wasDrag){const p=worldFromPointer(e);if(worldValid(p)){state.selected=p;coordsInSidebar(p);$('selected-readout').textContent='Selected X '+fmt(p.x)+' • Z '+fmt(p.z);if(e.shiftKey)addMarker(p)}}
    schedule()
  });
  canvas.addEventListener('pointercancel',()=>{state.drag=null;region.classList.remove('dragging')});
  canvas.addEventListener('wheel',e=>{e.preventDefault();const p=pointerOffset(e);const multiplier=e.deltaY<0?1.17:1/1.17;setCamera(P.anchoredZoom(state.camera,p.x,p.y,state.camera.zoom*multiplier,state.width,state.height))},{passive:false});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  $('zoom-in').onclick=()=>setCamera(P.anchoredZoom(state.camera,state.width/2,state.height/2,state.camera.zoom*1.6,state.width,state.height));
  $('zoom-out').onclick=()=>setCamera(P.anchoredZoom(state.camera,state.width/2,state.height/2,state.camera.zoom/1.6,state.width,state.height));
  $('fit-map').onclick=()=>setCamera(P.view());
  for(const [checkbox,key] of [['show-grid','showGrid'],['show-roads','showRoads'],['show-spawns','showSpawns'],['show-markers','showMarkers']]){
    $(checkbox).onchange=e=>{state[key]=e.target.checked;schedule()}
  }
  function inputCoords(){
    const x=Number($('coord-x').value),z=Number($('coord-z').value);
    return $('coord-x').value.trim()&&$('coord-z').value.trim()&&P.validateWorld(x,z)?{x,z}:null
  }
  $('go-coords').onclick=()=>{const p=inputCoords();if(!p)return notify('Enter valid X/Z coordinates within 0–16384');moveTo(p)};
  $('add-marker').onclick=()=>{const p=inputCoords();if(!p)return notify('Enter valid X/Z coordinates');addMarker(p)};
  $('copy-coords').onclick=async()=>{const p=inputCoords();if(!p)return notify('Enter valid X/Z coordinates');try{await navigator.clipboard.writeText(fmt(p.x)+' '+fmt(p.z));notify('Coordinates copied')}catch{notify('Clipboard unavailable; select X/Z from the coordinate fields')}};
  $('clear-markers').onclick=()=>{if(!state.markers.length)return;if(!confirm('Clear '+state.markers.length+' local markers?'))return;state.markers=[];$('marker-count').textContent='0 markers (in this tab)';schedule()};
  $('export-markers').onclick=()=>{
    if(!state.markers.length)return notify('Add markers before exporting');
    const output='index,x,z\n'+state.markers.map((m,i)=>[i+1,m.x,m.z].join(',')).join('\n')+'\n';
    download(new Blob([output],{type:'text/csv;charset=utf-8'}),'ZedForge_Nasdara_Markers.csv')
  };
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
  function maxSize(file,limit){if(file.size>limit)throw Error('File too large (max '+(limit/1024/1024)+' MB)')}
  $('image-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    try{
      maxSize(file,100*1024*1024);
      if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Only PNG, JPG and WebP are supported');
      const image=await createImageBitmap(file);
      if(image.width<1000||image.height<1000)notify('This image may look blurry when zoomed; try a higher-resolution satellite render');
      if(image.width!==image.height)notify('Image is not square. It will be aligned to the 16.384 km world extent; verify calibration');
      if(state.image?.close)state.image.close();
      state.image=image;
      $('image-status').textContent=file.name+' • '+image.width+' × '+image.height+' pixels • '+(file.size/1024/1024).toFixed(1)+' MB';
      $('map-credit').textContent='Local satellite imagery: '+file.name;
      $('empty-overlay').classList.add('hidden');schedule();notify('Satellite image loaded locally');
    }catch(err){notify('Image loading failed: '+err.message)}
  });
  function validateCoords(pair){return Array.isArray(pair)&&pair.length>=2&&Number.isFinite(pair[0])&&Number.isFinite(pair[1])&&P.validateWorld(pair[0],pair[1])}
  function extractRoads(geojson){
    const result=[];const features=geojson.type==='FeatureCollection'?geojson.features:[geojson];
    if(!Array.isArray(features)||features.length>250000)throw Error('Too many GeoJSON features');
    for(const feature of features){
      const geometry=feature.geometry||feature;if(!geometry?.coordinates)continue;
      const lines=geometry.type==='LineString'?[geometry.coordinates]:geometry.type==='MultiLineString'?geometry.coordinates:[];
      for(const line of lines){if(!Array.isArray(line)||line.length>200000)throw Error('Too many points in road segment');
        if(line.length>=2&&line.every(validateCoords))result.push(line.map(p=>[p[0],p[1]]))
      }
    }
    if(result.length>100000)throw Error('Too many road segments');
    return result
  }
  $('roads-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    try{maxSize(file,15*1024*1024);const roads=extractRoads(JSON.parse(await file.text()));
      if(!roads.length)throw Error('No LineString/MultiLineString world-coordinate paths found');
      state.roads=roads;
      $('roads-status').textContent=roads.length.toLocaleString()+' road paths • '+file.name;
      schedule();notify('Loaded '+roads.length+' road paths')
    }catch(err){notify('Road layer rejected: '+err.message)}
  });
  function parseEventSpawns(raw){
    if(/<!DOCTYPE|<!ENTITY/i.test(raw))throw Error('DOCTYPE/ENTITY declarations are not supported');
    const doc=new DOMParser().parseFromString(raw,'application/xml');
    if(doc.getElementsByTagName('parsererror').length)throw Error('Malformed event spawns XML');
    if(doc.documentElement.localName!=='eventposdef')throw Error('Expected <eventposdef> root in cfgeventspawns.xml');
    const entries=[],names=new Set();
    for(const event of Array.from(doc.documentElement.children).filter(e=>e.localName==='event')){
      const name=event.getAttribute('name')||'Unnamed event';
      names.add(name);
      for(const pos of Array.from(event.children).filter(e=>e.localName==='pos')){
        const xRaw=pos.getAttribute('x'),zRaw=pos.getAttribute('z');if(xRaw===null||zRaw===null)continue;
        const x=Number(xRaw),z=Number(zRaw);
        if(P.validateWorld(x,z))entries.push({x,z,name});
      }
    }
    return{entries,names:[...names].sort((a,b)=>a.localeCompare(b))}
  }
  $('events-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    try{maxSize(file,8*1024*1024);const parsed=parseEventSpawns(await file.text());
      state.eventSpawns=parsed.entries;state.eventNames=parsed.names;
      const filter=$('event-filter');filter.replaceChildren(new Option('All events','all'));
      for(const name of parsed.names)filter.add(new Option(name,name));
      $('events-status').textContent=parsed.entries.length+' positions from '+parsed.names.length+' events';
      schedule();notify('Imported '+parsed.entries.length+' event positions')
    }catch(err){notify('Event-spawn layer rejected: '+err.message)}
  });
  $('event-filter').onchange=schedule;
  window.addEventListener('resize',resize);
  if('ResizeObserver'in window)new ResizeObserver(resize).observe(region);
  resize();updateZoom();
})();
