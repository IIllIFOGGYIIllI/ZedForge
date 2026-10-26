'use strict';
/* ZedForge Map Lab — browser-only Nasdara prototype; no proprietary map assets shipped. */
(() => {
  const P=window.ZedForgeProjection,M=window.ZedForgeMapData,V=window.ZedForgeVegetation,A=window.ZedForgeAdvanced,PL=window.ZedForgePlaces;
  const EXTENT=P.EXTENT, $=id=>document.getElementById(id);
  const canvas=$('map-canvas'),region=$('map-region'),ctx=canvas.getContext('2d',{alpha:false});
  const state={camera:P.view(),width:0,height:0,dpr:1,image:null,imageUrl:null,roads:[],eventSpawns:[],eventNames:[],
    markers:[],cursor:null,selected:null,drag:null,pointerDown:null,showRoads:true,showSpawns:false,showGrid:false,showMarkers:true,imageFile:null,selectedMarkerIndex:null,
    roadLayer:null,objectLayer:null,roadVisibility:1.2,roadWidthMeters:8,vegetationDetail:.6,vegetationOverlay:null,showAsphalt:true,showDirt:true,showStructures:true,showOverview:true,satelliteTone:'natural',overlayAlpha:.85,measuring:false,measurement:null,structureStats:{drawn:0,pictures:0,visible:0},poiIndex:A.groupPoints(PL?.points||[]),treeIndex:null,showPois:true,showVillages:true,showMilitary:true,showIndustry:true,showTrees:false,calibration:{dx:0,dz:0},candidateCalibration:null};
  let toastId=0,frame=0,saveTimer=0,cacheChain=Promise.resolve(),interacted=false;

  /*
   * The old renderer painted thousands of roofs onto the visible canvas
   * every time the camera moved. Work now happens on a private surface in
   * small batches, and the most recent complete frame is transformed
   * during navigation until its replacement is fully ready.
   */
  let structureFront=null,structureJob=null,structureTimer=0,structureToken=0;
  let pictureRefreshDirty=false,lastStructureCommit=0;
  const STRUCTURE_BATCH=140;
  function cancelStructureJob(){
    clearTimeout(structureTimer);structureTimer=0;structureToken++;
    if(structureJob){structureJob.cancel();structureJob=null}
  }
  function invalidateStructures(delay=130){
    cancelStructureJob();
    if(!state.showStructures||!state.objectLayer||state.camera.zoom<3.8){schedule();return}
    const generation=structureToken;
    structureTimer=setTimeout(()=>{
      structureTimer=0;
      if(generation===structureToken)startStructureJob(generation);
    },Math.max(0,delay))
  }
  function startStructureJob(generation){
    if(generation!==structureToken||!state.showStructures||!state.objectLayer)return;
    const width=Math.round(state.width),height=Math.round(state.height);
    if(width<10||height<10)return;
    const dpi=Math.min(state.dpr||1,1.5),surface=document.createElement('canvas');
    surface.width=Math.ceil(width*dpi);surface.height=Math.ceil(height*dpi);
    const painter=surface.getContext('2d',{alpha:true});
    if(!painter){notify('Building canvas unavailable');return}
    painter.setTransform(dpi,0,0,dpi,0,0);
    const camera={...state.camera},
      job=M.createStructureJob(painter,state.objectLayer,{
        camera,width,height,projection:P,max:14000,
        opacity:state.overlayAlpha,pictureFor,requestPicture
      });
    structureJob=job;pictureRefreshDirty=false;
    const batch=()=>{
      if(generation!==structureToken||structureJob!==job)return;
      const result=job.step(STRUCTURE_BATCH);
      if(!result.done){setTimeout(batch,0);return}
      structureJob=null;
      structureFront={surface,camera,width,height,result};
      lastStructureCommit=Date.now();state.structureStats=result;schedule();
      if(pictureRefreshDirty){pictureRefreshDirty=false;invalidateStructures(320)}
    };
    setTimeout(batch,0)
  }
  function onPictureDecoded(){
    pictureRefreshDirty=true;
    if(structureJob||structureTimer||!state.objectLayer||!state.showStructures)return;
    invalidateStructures(Math.max(140,560-(Date.now()-lastStructureCommit)))
  }
  function drawStructureSurface(){
    if(!state.showStructures||!state.objectLayer||state.camera.zoom<3.8){
      state.structureStats={drawn:0,visible:0,pictures:0};return
    }
    const front=structureFront;
    if(!front){state.structureStats={drawn:0,visible:0,pictures:0};return}
    const oldScale=P.scale(front.camera,front.width,front.height),
      newScale=P.scale(state.camera,state.width,state.height),
      ratio=newScale/oldScale,
      center=P.toScreen(front.camera.x,front.camera.z,state.camera,state.width,state.height);
    if(!Number.isFinite(ratio)||ratio<=0)return;
    ctx.save();ctx.globalAlpha=1;ctx.imageSmoothingEnabled=true;
    ctx.drawImage(front.surface,center.x-front.width*ratio/2,center.y-front.height*ratio/2,
      front.width*ratio,front.height*ratio);
    ctx.restore();state.structureStats=front.result;
  }

  /* Draw roads once into a transparent back buffer; never expose an
   * incomplete frame on the visible canvas. At close zoom only viewport
   * segments are painted using the precomputed spatial index. */
  /* Advanced map layers are strictly local imports. Coordinates are game X/Z metres. */
  let overviewThumb=null,lastMetrics=0,metricFrames=0,metricTotal=0;
  const tileRuntime={pack:null,loaded:new Map(),pending:new Set(),queue:[],active:0,bytes:0,epoch:0};
  const TILE_BUDGET=144*1024*1024,MAX_TILE_IMAGES=110;
  function disposeTiles(){
    tileRuntime.epoch++;
    for(const entry of tileRuntime.loaded.values())entry.image.close?.();
    tileRuntime.loaded.clear();tileRuntime.pending.clear();tileRuntime.queue.length=0;
    tileRuntime.bytes=0;tileRuntime.pack=null;
  }
  function tileVisibleImage(tile){
    const stored=tileRuntime.loaded.get(tile.path);
    if(stored){tileRuntime.loaded.delete(tile.path);tileRuntime.loaded.set(tile.path,stored);return stored.image}
    if(!tileRuntime.pack||tileRuntime.pending.has(tile.path)||tileRuntime.queue.length>70)return null;
    tileRuntime.pending.add(tile.path);tileRuntime.queue.push(tile);
    drainTiles();
    return null;
  }
  function drainTiles(){
    while(tileRuntime.active<3&&tileRuntime.queue.length){
      const tile=tileRuntime.queue.shift(),pack=tileRuntime.pack,epoch=tileRuntime.epoch;
      if(!pack){tileRuntime.pending.delete(tile.path);continue}
      tileRuntime.active++;
      (async()=>{
        const blob=await pack.zip.file(tile.path).async('blob');
        if(blob.size>8*1024*1024)throw Error('Individual tile exceeds 8 MB');
        const image=await decodeImage(blob);
        const w=image.width||image.naturalWidth,h=image.height||image.naturalHeight;
        if(epoch!==tileRuntime.epoch){image.close?.();return}
        const bytes=w*h*4;
        if(!w||!h||bytes>TILE_BUDGET){image.close?.();return}
        while(tileRuntime.bytes+bytes>TILE_BUDGET||tileRuntime.loaded.size>=MAX_TILE_IMAGES){
          const k=tileRuntime.loaded.keys().next().value;if(k===undefined)break;
          const old=tileRuntime.loaded.get(k);old.image.close?.();
          tileRuntime.bytes-=old.bytes;tileRuntime.loaded.delete(k);
        }
        tileRuntime.loaded.set(tile.path,{image,bytes});tileRuntime.bytes+=bytes;schedule();
      })().catch(err=>{if(epoch===tileRuntime.epoch)notify('Tile '+tile.path+': '+err.message)})
      .finally(()=>{
        if(epoch===tileRuntime.epoch)tileRuntime.pending.delete(tile.path);
        tileRuntime.active--;drainTiles()
      })
    }
  }
  async function loadTilePack(file,{restored=false}={}){
    if(!window.JSZip)throw Error('ZIP decoder unavailable');
    if(!file||file.size>250*1024*1024)throw Error('Tile ZIP exceeds 250 MB');
    const zip=await window.JSZip.loadAsync(file);
    const manifest=zip.file('zedforge-tiles.json');
    if(!manifest)throw Error('ZIP must include zedforge-tiles.json at the root');
    const all=new Set(Object.keys(zip.files).filter(x=>!zip.files[x].dir));
    const tiles=A.parseTileManifest(await manifest.async('string'),all);
    disposeTiles();tileRuntime.pack={zip,tiles};
    $('tile-status').textContent=tiles.length.toLocaleString()+' calibrated high-resolution tiles loaded locally';
    $('empty-overlay').classList.add('hidden');
    if(!restored){interacted=true;void cacheLayer('tilepack',{blob:file,name:file.name},'satellite tiles')}
    schedule();notify('Loaded '+tiles.length+' calibrated satellite tiles');
  }
  function drawTiles(){
    const pack=tileRuntime.pack;if(!pack)return;
    const b=visibleExtent(),dx=state.calibration.dx,dz=state.calibration.dz;
    const view={x0:b.x0-dx,x1:b.x1-dx,z0:b.z0-dz,z1:b.z1-dz};
    const tiles=A.selectTiles(pack.tiles,view,state.camera.zoom,120);
    for(const tile of tiles){
      // Preserve the sharper 4096px base at overview instead of replacing it
      // with the pack's 1024px fallback. Tile-only packs still show an overview.
      if(state.image&&tile.level===0)continue;
      const image=tileVisibleImage(tile);if(!image)continue;
      const tl=toS(tile.x+dx,tile.z+tile.height+dz),
        br=toS(tile.x+tile.width+dx,tile.z+dz);
      ctx.drawImage(image,tl.x,tl.y,br.x-tl.x,br.y-tl.y);
    }
  }
  function drawTrees(){
    if(!state.showTrees||!state.treeIndex||state.camera.zoom<4)return;
    const trees=A.visiblePoints(state.treeIndex,visibleExtent(),2800);
    if(!trees.length)return;
    ctx.save();
    ctx.globalAlpha=Math.min(.9,.38+state.camera.zoom*.008);
    ctx.fillStyle='#266d3b';ctx.strokeStyle='#b0d578';
    const size=state.camera.zoom>18?2.8:1.8;
    for(const tree of trees){
      const point=toS(tree.x,tree.z);
      ctx.beginPath();ctx.arc(point.x,point.y,size,0,Math.PI*2);ctx.fill();
      if(state.camera.zoom>=20){ctx.lineWidth=.5;ctx.stroke()}
    }
    ctx.restore();
  }
  /*
   * Permanent places are indexed locally. The bundled positions are 100 m
   * grid-square centres, not exact entrance coordinates. User-imported POIs
   * can override positions by exact name without hiding other locations.
   */
  function mergePermanentPlaces(overrides=[]){
    const records=new Map((PL?.points||[]).map(p=>[p.name.toLocaleLowerCase(),p]));
    for(const p of overrides)records.set(p.name.toLocaleLowerCase(),p);
    state.poiIndex=A.groupPoints(Array.from(records.values()));
    const builtin=PL?.count||0;
    $('poi-status').textContent=overrides.length
      ?overrides.length+' named custom places • '+builtin+' built-in Nasdara grid locations • '+state.poiIndex.points.length+' total'
      :builtin+' permanent Nasdara places ready • 100 m grid-centre coordinates';
    refreshPOISearch();schedule();
  }
  function poiVisible(loc){
    if(!state.showPois)return false;
    if(loc.kind==='village'&&!state.showVillages)return false;
    if(loc.kind==='military'&&!state.showMilitary)return false;
    if(['industrial','airfield'].includes(loc.kind)&&!state.showIndustry)return false;
    const zoom=state.camera.zoom;
    if(loc.kind==='city')return true;
    if(loc.kind==='town')return zoom>=1.3;
    if(loc.kind==='military'||loc.kind==='airfield')return zoom>=1.8;
    if(loc.kind==='industrial')return zoom>=2.1;
    if(loc.kind==='village')return zoom>=2.7;
    return zoom>=2.1;
  }
  /* Cartographic typography instead of boxed UI pins.
   * Labels use the map's true projected metre coordinates and a small halo
   * so they remain readable on bright desert and dark forest satellite areas.
   * Grid-centre locations remain approximate (within the published 100m cell).
   */
  function drawLocations(){
    if(!state.showPois||!state.poiIndex)return;
    const visible=A.visiblePoints(state.poiIndex,visibleExtent(),900);
    if(!visible.length)return;
    const rank={city:0,town:1,airfield:2,military:3,industrial:4,village:5,fuel:6,medical:6,trader:6,water:6,landmark:7,forest:8,other:9};
    visible.sort((a,b)=>(rank[a.kind]??9)-(rank[b.kind]??9));
    ctx.save();
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.lineJoin='round';ctx.miterLimit=2;
    const occupied=[];let shown=0;
    for(const loc of visible){
      if(!poiVisible(loc))continue;
      const pos=toS(loc.x,loc.z);
      const kind=loc.kind,city=kind==='city',town=kind==='town',
        village=kind==='village',military=kind==='military';
      const size=city?17:town?14:village?12:(military||kind==='airfield')?12:11;
      const label=city?loc.name.toLocaleUpperCase():loc.name;
      ctx.font=city?'700 17px Georgia, "Times New Roman", serif':
        town?'bold 14px Georgia, "Times New Roman", serif':
        village?'italic 12px Georgia, "Times New Roman", serif':
        military?'600 12px system-ui, sans-serif':
        '600 '+size+'px Georgia, "Times New Roman", serif';
      // Canvas letterSpacing may not be available in every browser.
      if('letterSpacing' in ctx)ctx.letterSpacing=city?'1.4px':town?'.35px':'0px';
      const width=Math.min(340,ctx.measureText(label).width);
      // Anchor the name on the settlement, not offset to a marker at its edge.
      const box={x:pos.x-width/2-4,y:pos.y-size/2-4,w:width+8,h:size+8};
      if(box.x>state.width+15||box.x+box.w<-15||box.y>state.height+15||box.y+box.h<-15)continue;
      const padding=city?12:town?9:6;
      if(occupied.some(b=>box.x<b.x+b.w+padding&&box.x+box.w+padding>b.x&&
          box.y<b.y+b.h+padding&&box.y+box.h+padding>b.y))continue;
      occupied.push(box);
      // Ink-like map type with an ivory outline is readable without any
      // rectangles, pin icons, shaded badges or artificial roads/POIs.
      ctx.strokeStyle='rgba(245,239,218,.96)';
      ctx.lineWidth=city?4.5:town?3.7:3.2;
      ctx.strokeText(label,pos.x,pos.y);
      ctx.fillStyle=military?'#703624':
        kind==='industrial'?'#594534':
        kind==='airfield'?'#5b4326':
        '#1d2c29';
      ctx.fillText(label,pos.x,pos.y);
      if(++shown>=90)break;
    }
    if('letterSpacing' in ctx)ctx.letterSpacing='0px';
    ctx.restore();
  }

  function refreshPOISearch(){
    const target=$('poi-results');target.replaceChildren();
    const index=state.poiIndex;
    if(!index){$('poi-search-status').textContent='No places available.';return}
    const search=$('poi-search').value.trim();
    if(!search){$('poi-search-status').textContent=index.points.length.toLocaleString()+' searchable locations • enter a place name';return}
    const matches=A.searchPoints(index,search,35);
    for(const p of matches){
      const option=new Option(p.name+' • '+p.kind+' • '+(p.approximate?'≈ grid '+p.grid:'X '+Math.round(p.x)+' / Z '+Math.round(p.z)),String(index.points.indexOf(p)));
      target.add(option);
    }
    $('poi-search-status').textContent=matches.length+' matches';
  }
  function metrics(start){
    metricFrames++;metricTotal+=Date.now()-start;
    if(metricFrames>=24){
      const avg=metricTotal/metricFrames;
      $('frame-metrics').textContent='Draw '+avg.toFixed(1)+' ms • '+tileRuntime.loaded.size+' tiles • '+(state.structureStats?.pictures||0)+' roofs';
      metricFrames=0;metricTotal=0;
    }
  }

  let roadOverview=null;
  const ROAD_OVERVIEW_RES=3072,ROAD_DETAIL_ZOOM=5;
  function rebuildRoadOverview(){
    const layer=state.roadLayer;
    if(!layer){roadOverview=null;return}
    const off=document.createElement('canvas');
    off.width=ROAD_OVERVIEW_RES;off.height=ROAD_OVERVIEW_RES;
    const offctx=off.getContext('2d',{alpha:true});
    if(!offctx)throw Error('Unable to allocate road overlay canvas');
    const indices=Array.from({length:layer.drawCount||layer.count},(_,i)=>i),factor=ROAD_OVERVIEW_RES/EXTENT;
    M.paintRoadSegments(offctx,layer,indices,(x,z)=>({x:x*factor,y:(EXTENT-z)*factor}),{
      asphalt:state.showAsphalt,dirt:state.showDirt,overview:true,opacity:1
    });
    roadOverview=off; // Atomic swap only after complete drawing.
  }
  const cache=window.ZedForgeMapStorage;
  /* Deep-zoom building pictures remain user-supplied. Lazy decoding limits RAM usage. */
  const pictureSources=new Map(),pictureDecoded=new Map(),pictureQueue=[],pictureQueued=new Set();
  let pictureInFlight=0,pictureEpoch=0,pictureBytes=0;
  const PICTURE_BUDGET=192*1024*1024,PICTURE_CACHE_LIMIT=550;
  function pictureFor(model){
    const item=pictureDecoded.get(model);
    if(!item)return null;
    pictureDecoded.delete(model);pictureDecoded.set(model,item);
    return item.image;
  }
  function clearDecodedPictures(){
    for(const value of pictureDecoded.values())value.image.close?.();
    pictureDecoded.clear();pictureSources.clear();pictureQueue.length=0;pictureQueued.clear();
    pictureBytes=0;pictureEpoch++;pictureRefreshDirty=false;
  }
  function requestPicture(model){
    if(!pictureSources.has(model)||pictureDecoded.has(model)||pictureQueued.has(model)||pictureQueue.length>80)return;
    pictureQueued.add(model);pictureQueue.push(model);
    drainPictures();
  }
  function drainPictures(){
    while(pictureInFlight<2&&pictureQueue.length){
      const model=pictureQueue.shift(),source=pictureSources.get(model),epoch=pictureEpoch;
      if(!source){pictureQueued.delete(model);continue}
      pictureInFlight++;
      (async()=>{
        const blob=source.zipEntry?await source.zipEntry.async('blob'):source.blob;
        const image=await decodeImage(blob);
        if(epoch!==pictureEpoch){image.close?.();return}
        const bytes=(image.width||image.naturalWidth)*(image.height||image.naturalHeight)*4;
        if(bytes>PICTURE_BUDGET){image.close?.();return}
        while(pictureBytes+bytes>PICTURE_BUDGET||pictureDecoded.size>=PICTURE_CACHE_LIMIT){
          const first=pictureDecoded.keys().next().value;if(first===undefined)break;
          const old=pictureDecoded.get(first);old.image.close?.();pictureBytes-=old.bytes;pictureDecoded.delete(first)
        }
        pictureDecoded.set(model,{image,bytes});pictureBytes+=bytes;onPictureDecoded();
      })().catch(err=>{if(epoch===pictureEpoch)console.warn('Could not decode model picture',model,err)})
        .finally(()=>{pictureQueued.delete(model);pictureInFlight--;drainPictures()});
    }
  }
  async function loadPictureFiles(inputs,{restored=false}={}){
    const selected=Array.from(inputs).map(item=>item.blob?item:{blob:item,name:item.name||''});
    if(!selected.length)throw Error('Choose a ZIP or numbered PNGs to load');
    if(selected.length>2500||selected.reduce((sum,x)=>sum+x.blob.size,0)>90*1024*1024)throw Error('Picture bundle exceeds 90 MB or 2,500 files');
    const incoming=new Map();
    for(const input of selected){
      const name=input.name||'';
      if(/\.zip$/i.test(name)){
        if(!window.JSZip)throw Error('Local ZIP library is unavailable');
        const archive=await window.JSZip.loadAsync(input.blob);
        const entries=Object.values(archive.files).filter(f=>!f.dir&&/(?:^|\/)(\d{4})\.png$/i.test(f.name));
        if(entries.length>2500)throw Error('Picture ZIP contains too many PNGs');
        for(const entry of entries){
          const index=Number(entry.name.match(/(\d{4})\.png$/i)[1]);
          if(index<=8191&&!incoming.has(index))incoming.set(index,{zipEntry:entry});
        }
      }else if(/\.png$/i.test(name)){
        const m=name.match(/(?:^|\/)(\d{4})\.png$/i);
        if(m){const index=Number(m[1]);if(index<=8191&&!incoming.has(index))incoming.set(index,{blob:input.blob})}
      }
    }
    if(!incoming.size)throw Error('No numbered 0000.png, 0001.png etc. found; the pictures must match the structure model indices');
    clearDecodedPictures();
    for(const [key,value]of incoming)pictureSources.set(key,value);
    structureFront=null;invalidateStructures(0);
    $('pictures-status').textContent=incoming.size.toLocaleString()+' numbered model pictures ready • decoded only when zoomed in';
    if(!restored){interacted=true;void cacheLayer('pictures',{files:selected},'building pictures')}
    schedule();notify('Loaded '+incoming.size+' model pictures for detailed close-up rendering')
  }
  function setCacheStatus(label){$('local-storage-status').textContent=label}
  function queueCache(key,value){
    if(!cache)return Promise.reject(new Error('Local storage is unavailable'));
    cacheChain=cacheChain.catch(()=>{}).then(()=>cache.write(key,value));
    return cacheChain
  }
  function saveView(){
    clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{
      const session={
        camera:state.camera,markers:state.markers,selected:state.selected,
        flags:{roads:state.showRoads,spawns:state.showSpawns,grid:state.showGrid,markers:state.showMarkers,
          structures:state.showStructures,asphalt:state.showAsphalt,dirt:state.showDirt,overview:state.showOverview,pois:state.showPois,trees:state.showTrees,villages:state.showVillages,military:state.showMilitary,industry:state.showIndustry},
        satelliteTone:state.satelliteTone,overlayAlpha:state.overlayAlpha,roadVisibility:state.roadVisibility,roadWidthMeters:state.roadWidthMeters,vegetationDetail:state.vegetationDetail,calibration:state.calibration,
        filter:$('event-filter').value
      };
      try{await queueCache('session',session);setCacheStatus('✓ Map settings saved locally')}
      catch(err){setCacheStatus('Local save unavailable');notify('Local map save failed; export your markers: '+err.message)}
    },750)
  }
  function renderMarkerList(){
    const list=$('marker-list');list.replaceChildren();$('marker-count').textContent=state.markers.length+' marker'+(state.markers.length===1?'':'s')+' • saved locally when available';
    if(!state.markers.length){const e=document.createElement('div');e.className='data-state';e.textContent='No markers placed yet.';list.append(e);return}
    for(let i=0;i<state.markers.length;i++){
      const m=state.markers[i],line=document.createElement('div');line.className='marker-line';if(i===state.selectedMarkerIndex)line.classList.add('selected');
      const open=document.createElement('button');open.className='marker-open';open.type='button';const title=document.createElement('span');title.className='marker-label';title.textContent=(i+1)+'. '+(m.label||'Map marker');
      const coords=document.createElement('span');coords.className='marker-coords';coords.textContent='X '+m.x.toFixed(2)+' • Z '+m.z.toFixed(2);
      open.append(title,coords);open.onclick=()=>{state.selectedMarkerIndex=i;$('marker-label').value=m.label||'';$('update-marker').disabled=false;moveTo(m);renderMarkerList()};
      const remove=document.createElement('button');remove.className='marker-delete';remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Remove marker '+(i+1));remove.onclick=()=>{
        if(!confirm('Remove '+(m.label||'marker '+(i+1))+'?'))return;
        state.markers.splice(i,1);if(state.selectedMarkerIndex===i)state.selectedMarkerIndex=null;else if(state.selectedMarkerIndex>i)state.selectedMarkerIndex--; $('update-marker').disabled=state.selectedMarkerIndex===null;interacted=true;renderMarkerList();saveView();schedule()
      };
      line.append(open,remove);list.append(line)
    }
  }
  function sourceQuality(image){
    const meters=EXTENT/image.width;
    const label=meters.toFixed(2)+' metres/source pixel';
    $('source-quality').textContent=image.width+' × '+image.height+' source pixels • '+label+
      (meters>2?' • Native imagery limits close-zoom sharpness; higher resolution or vector structures needed for iZurvive-style detail.':' • Suitable source resolution for closer zoom.');
  }
  function setEventFilter(names,chosen='all'){
    const select=$('event-filter');select.replaceChildren(new Option('All events','all'));
    for(const name of names)select.add(new Option(name,name));
    if(names.includes(chosen))select.value=chosen;
  }
  async function cacheLayer(key,value,label){
    try{await queueCache(key,value);setCacheStatus('✓ '+label+' saved locally')}
    catch(e){setCacheStatus('⚠ Local save failed');notify('Could not persist '+label+': '+e.message)}
  }
  async function decodeImage(blob){
    if(typeof createImageBitmap==='function')return createImageBitmap(blob);
    const url=URL.createObjectURL(blob);
    try{return await new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);
      image.onerror=()=>reject(new Error('Unable to decode satellite image'));
      image.src=url;
    })}finally{setTimeout(()=>URL.revokeObjectURL(url),30000)}
  }
  async function showSatellite(file,{restored=false}={}){
    maxSize(file,100*1024*1024);
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Only PNG, JPG and WebP are supported');
    const image=await decodeImage(file);
    if(image.width*image.height>90000000){image.close?.();throw Error('Image exceeds 90 megapixels; choose a smaller source or tiled imagery')}
    if(!restored)interacted=true;
    if(state.image?.close)state.image.close();
    state.image=image;state.imageFile=file;overviewThumb=null;
    state.vegetationOverlay=null;
    try{
      const overlay=V.makeOverlay(image,()=>document.createElement('canvas'));
      state.vegetationOverlay=overlay.canvas;
    }catch(err){notify('Vegetation enhancement unavailable: '+err.message)}
    const filename=file.name||'Locally cached satellite image';
    $('image-status').textContent=filename+' • '+image.width+' × '+image.height+' pixels • '+(file.size/1024/1024).toFixed(1)+' MB';
    $('map-credit').textContent='Local satellite imagery • '+filename;
    $('empty-overlay').classList.add('hidden');
    sourceQuality(image);schedule();
    if(!restored){
      if($('remember-image').checked){setCacheStatus('Saving satellite locally…');await cacheLayer('image',{blob:file,name:filename},'image')}
      else setCacheStatus('Image loaded for this tab only');
      if(image.width!==image.height)notify('Image is not square; verify its world-coordinate calibration');
    }
  }
  async function restoreCached(){
    if(!cache){setCacheStatus('Storage unsupported; export before leaving');return}
    try{
      const [session,roads,events,image,buildings,pictures,pois,trees,tiles]=await Promise.all([
        cache.read('session'),cache.read('roads'),cache.read('events'),cache.read('image'),
        cache.read('buildings'),cache.read('pictures'),cache.read('pois'),cache.read('trees'),cache.read('tilepack')]);
      if(interacted)return;
      if(session){
        const v=session.camera;
        if(v&&Number.isFinite(v.x)&&Number.isFinite(v.z)&&Number.isFinite(v.zoom)&&v.zoom>0){
          state.camera=P.view(v.x,v.z,P.clamp(v.zoom,.75,64))
        }
        state.markers=Array.isArray(session.markers)?session.markers.filter(m=>m&&P.validateWorld(m.x,m.z)).slice(0,5000).map(m=>({x:m.x,z:m.z,label:typeof m.label==='string'?m.label.slice(0,60):''})):[];state.selectedMarkerIndex=null;$('update-marker').disabled=true;
        state.selected=session.selected&&P.validateWorld(session.selected.x,session.selected.z)?session.selected:null;
        for(const [id,key]of [['show-roads','roads'],['show-grid','grid'],['show-markers','markers'],['show-structures','structures'],['show-asphalt','asphalt'],['show-dirt','dirt'],['show-overview','overview'],['show-pois','pois'],['show-trees','trees'],['show-villages','villages'],['show-military','military'],['show-industry','industry']]){
          if(typeof session.flags?.[key]==='boolean'){$(id).checked=session.flags[key];state['show'+key[0].toUpperCase()+key.slice(1)]=session.flags[key]}
        }
      }
      if(session?.satelliteTone&&['natural','vivid','lowlight'].includes(session.satelliteTone)){$('satellite-tone').value=session.satelliteTone;state.satelliteTone=session.satelliteTone}
      if(typeof session?.overlayAlpha==='number'&&session.overlayAlpha>=.2&&session.overlayAlpha<=1){state.overlayAlpha=session.overlayAlpha;$('overlay-alpha').value=String(Math.round(session.overlayAlpha*100))}
      $('overlay-alpha-value').textContent=Math.round(state.overlayAlpha*100)+'%';
      if(Number.isFinite(session?.roadVisibility)){
        state.roadVisibility=Math.max(.4,Math.min(1.4,session.roadVisibility));
        $('road-visibility').value=String(Math.round(state.roadVisibility*100));
      }
      $('road-visibility-value').textContent=Math.round(state.roadVisibility*100)+'%';
      if(Number.isFinite(session?.roadWidthMeters))
        state.roadWidthMeters=P.clamp(session.roadWidthMeters,3,12);
      $('road-width').value=String(state.roadWidthMeters);
      $('road-width-value').textContent=state.roadWidthMeters.toFixed(1)+' m';
      if(Number.isFinite(session?.vegetationDetail))
        state.vegetationDetail=Math.max(0,Math.min(1,session.vegetationDetail));
      $('vegetation-detail').value=String(Math.round(state.vegetationDetail*100));
      $('vegetation-detail-value').textContent=Math.round(state.vegetationDetail*100)+'%';
      if(session?.calibration&&Number.isFinite(session.calibration.dx)&&Number.isFinite(session.calibration.dz)){
        state.calibration={dx:P.clamp(session.calibration.dx,-500,500),dz:P.clamp(session.calibration.dz,-500,500)};
        $('calibration-status').textContent='Saved image offset: X '+state.calibration.dx.toFixed(2)+' m, Z '+state.calibration.dz.toFixed(2)+' m';
      }
      if(pois?.text){try{
        const list=A.parsePoints(pois.text,pois.format,'other');mergePermanentPlaces(list);
      }catch(e){notify('Location layer restore failed: '+e.message)}}
      if(trees?.text){try{
        const list=A.parsePoints(trees.text,trees.format,'tree');state.treeIndex=A.groupPoints(list);
        $('trees-status').textContent=list.length.toLocaleString()+' vegetation positions restored';
      }catch(e){notify('Tree layer restore failed: '+e.message)}}
      if(roads?.blob instanceof Blob){
        try{await loadRoadLayer(roads.blob,{restored:true,name:roads.name});}catch(e){notify('Could not restore roads: '+e.message)}
      }else if(roads&&Array.isArray(roads.lines)){
        try{state.roadLayer=M.parseGeoJSON({type:'FeatureCollection',features:roads.lines.map(line=>({type:'Feature',geometry:{type:'LineString',coordinates:line}}))});
          $('roads-status').textContent=state.roadLayer.count.toLocaleString()+' segments restored from earlier GeoJSON';}
        catch(e){notify('Older road data could not be restored: '+e.message)}
      }
      if(buildings?.blob instanceof Blob){
        try{await loadStructureLayer(buildings.blob,{restored:true,name:buildings.name})}catch(e){notify('Could not restore structures: '+e.message)}
      }
      if(Array.isArray(pictures?.files)&&pictures.files.length){
        try{await loadPictureFiles(pictures.files,{restored:true})}catch(e){notify('Could not restore building pictures: '+e.message)}
      }
      if(events&&Array.isArray(events.entries)&&Array.isArray(events.names)){
        state.eventSpawns=events.entries;state.eventNames=events.names;
        setEventFilter(events.names,session?.filter);
        $('events-status').textContent=events.entries.length+' event positions restored'
      }
      if(state.selected){coordsInSidebar(state.selected);$('selected-readout').textContent='Selected X '+fmt(state.selected.x)+' • Z '+fmt(state.selected.z)}
      renderMarkerList();updateZoom();schedule();
      if(image?.blob instanceof Blob&&!interacted){
        const blob=image.blob;
        try{await showSatellite(blob,{restored:true});setCacheStatus('✓ Satellite and settings restored locally')}
        catch(err){setCacheStatus('Satellite cache unreadable');notify('Saved image could not be restored: '+err.message)}
      }else setCacheStatus('✓ Workspace loaded locally');
      if(tiles?.blob instanceof Blob)try{await loadTilePack(tiles.blob,{restored:true})}catch(e){notify('Tile pack restore failed: '+e.message)}
    }catch(err){setCacheStatus('Local browser storage unavailable');notify('Map Lab storage unavailable: '+err.message)}
  }
  function notify(text){const node=$('toast');node.textContent=text;node.style.display='block';clearTimeout(toastId);toastId=setTimeout(()=>node.style.display='none',4200)}
  function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;draw()})}
  function resize(){const rect=region.getBoundingClientRect();state.width=rect.width;state.height=rect.height;state.dpr=Math.min(2,window.devicePixelRatio||1);
    const width=Math.max(1,Math.round(state.width*state.dpr)),height=Math.max(1,Math.round(state.height*state.dpr));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}
    schedule();invalidateStructures(0)}
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
    const a=toS(state.calibration.dx,EXTENT+state.calibration.dz),b=toS(EXTENT+state.calibration.dx,state.calibration.dz),w=b.x-a.x,h=b.y-a.y;
    if(w<1||h<1)return;
    ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.filter=state.satelliteTone==='vivid'?'contrast(1.25) saturate(1.27) brightness(1.07)':state.satelliteTone==='lowlight'?'contrast(1.14) saturate(.8) brightness(.66)':'none';
    ctx.drawImage(state.image,a.x,a.y,w,h);
    if(state.vegetationDetail>0&&state.vegetationOverlay){
      ctx.filter='none';ctx.globalAlpha=state.vegetationDetail;
      ctx.drawImage(state.vegetationOverlay,a.x,a.y,w,h);
    }
    ctx.restore()
  }
  function drawRoads(){
    const layer=state.roadLayer;
    if(!state.showRoads||!layer||state.camera.zoom<1.25)return;
    const r=visibleExtent(),zoom=state.camera.zoom;
    if(zoom<ROAD_DETAIL_ZOOM&&roadOverview){
      const tl=toS(0,EXTENT),br=toS(EXTENT,0);
      ctx.save();
      ctx.globalAlpha=Math.min(1,state.overlayAlpha*state.roadVisibility*(zoom<2.3 ? 0.86 : zoom<3.6 ? 0.93 : 1));
      ctx.imageSmoothingEnabled=true;
      ctx.drawImage(roadOverview,tl.x,tl.y,br.x-tl.x,br.y-tl.y);
      ctx.restore();
      return;
    }
    const visible=M.collectRoadSegments(layer,r,100000);
    M.paintRoadSegments(ctx,layer,visible,(x,z)=>toS(x,z),{
      asphalt:state.showAsphalt,dirt:state.showDirt,overview:false,
      worldScale:P.scale(state.camera,state.width,state.height),
      pavedWidthMeters:state.roadWidthMeters,
      opacity:Math.min(1,state.overlayAlpha*state.roadVisibility)
    });
  }
  function drawStructures(){drawStructureSurface()}
  function updateScale(){
    const wanted=135/P.scale(state.camera,state.width,state.height);
    const candidate=[10,20,50,100,200,500,1000,2000,5000,10000];
    let length=candidate[0];
    for(const value of candidate)if(value<=wanted)length=value;
    $('scale-label').textContent=length>=1000?(length/1000)+' km':length+' m';
    $('scale-line').style.width=Math.round(length*P.scale(state.camera,state.width,state.height))+'px';
  }
  function drawOverview(){
    const panel=$('overview-panel');
    panel.classList.toggle('hidden',!state.showOverview);
    if(!state.showOverview)return;
    const mini=$('overview-canvas'),c=mini.getContext('2d'),w=mini.width,h=mini.height;
    c.clearRect(0,0,w,h);c.fillStyle='#193137';c.fillRect(0,0,w,h);
    if(state.image){
      if(!overviewThumb){
        const off=document.createElement('canvas');off.width=w;off.height=h;
        const painter=off.getContext('2d');
        if(painter){painter.drawImage(state.image,0,0,w,h);overviewThumb=off}
      }
      if(overviewThumb){
        c.filter=state.satelliteTone==='lowlight'?'brightness(.75)':'none';
        c.drawImage(overviewThumb,0,0,w,h);c.filter='none';
      }
    }
    c.strokeStyle='#75eab3';c.lineWidth=1.5;c.strokeRect(.5,.5,w-1,h-1);
    const r=visibleExtent();
    const x=Math.max(0,Math.min(w,r.x0/EXTENT*w)),y=Math.max(0,Math.min(h,(1-r.z1/EXTENT)*h)),
      endX=Math.max(0,Math.min(w,r.x1/EXTENT*w)),endY=Math.max(0,Math.min(h,(1-r.z0/EXTENT)*h));
    c.fillStyle='#7ceec522';c.fillRect(x,y,endX-x,endY-y);c.strokeStyle='#d4fff0';c.lineWidth=2;c.strokeRect(x,y,endX-x,endY-y);
    if(state.selected){c.fillStyle='#ffde91';c.beginPath();c.arc(state.selected.x/EXTENT*w,(1-state.selected.z/EXTENT)*h,2.5,0,Math.PI*2);c.fill()}
  }
  function updateLayerInfo(){
    const r=state.roadLayer,o=state.objectLayer,parts=[];
    if(r)parts.push(r.count.toLocaleString()+' road segments');
    if(o){parts.push(o.count.toLocaleString()+' building placements');
      const st=state.structureStats;
      if(state.showStructures&&st?.drawn)parts.push(st.drawn.toLocaleString()+' visible • '+(st.pictures||0).toLocaleString()+' textured roofs');
    }
    // Event positions stay omitted until category-specific icons are implemented.
    if(state.poiIndex)parts.push(state.poiIndex.points.length.toLocaleString()+' named places');
    if(state.treeIndex)parts.push(state.treeIndex.points.length.toLocaleString()+' trees');
    if(tileRuntime.pack)parts.push(tileRuntime.pack.tiles.length.toLocaleString()+' HD tiles');
    const text=parts.length?parts.join(' • '):'Load roads and building geometry for sharper detail';if($('map-layer-count').textContent!==text)$('map-layer-count').textContent=text;
  }
  function drawMeasurement(){
    const m=state.measurement;if(!m?.start)return;
    const a=toS(m.start.x,m.start.z),b=m.end?toS(m.end.x,m.end.z):state.measuring&&state.cursor?toS(state.cursor.x,state.cursor.z):null;
    ctx.save();ctx.lineWidth=2;ctx.strokeStyle='#89fff1';ctx.setLineDash([9,5]);ctx.beginPath();
    if(b){ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}
    ctx.setLineDash([]);ctx.fillStyle='#e9fff4';ctx.beginPath();ctx.arc(a.x,a.y,4,0,Math.PI*2);ctx.fill();
    if(b){ctx.beginPath();ctx.arc(b.x,b.y,4,0,Math.PI*2);ctx.fill();
      const dist=Math.hypot((m.end||state.cursor).x-m.start.x,(m.end||state.cursor).z-m.start.z);
      const label=(dist>=1000?(dist/1000).toFixed(2)+' km':dist.toFixed(1)+' m');
      ctx.font='bold 12px system-ui';ctx.fillStyle='#ffffff';ctx.strokeStyle='#0b171b';ctx.lineWidth=4;ctx.strokeText(label,(a.x+b.x)/2+7,(a.y+b.y)/2-6);ctx.fillText(label,(a.x+b.x)/2+7,(a.y+b.y)/2-6)
    }
    ctx.restore();
  }

  function pin(x,z,fill,r,stroke='#09141a'){
    const p=toS(x,z);if(p.x<-15||p.x>state.width+15||p.y<-15||p.y>state.height+15)return;
    ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1.2;ctx.stroke()
  }
  function drawEvents(){
    // Event data may exist in legacy browser storage; never plot generic event dots until icons are available.
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
    state.markers.forEach((m,i)=>{pin(m.x,m.z,'#8ef3c7',5);const p=toS(m.x,m.z);if(state.camera.zoom>1.5) {ctx.fillStyle='#ffffff';ctx.fillText(state.camera.zoom>4&&m.label?m.label:String(i+1),p.x+10,p.y)}});
    ctx.restore()
  }
  function drawSelection(){
    if(!state.selected||!worldValid(state.selected))return;
    const p=toS(state.selected.x,state.selected.z);ctx.save();ctx.lineWidth=1.2;ctx.strokeStyle='#ffffffa8';
    ctx.beginPath();ctx.arc(p.x,p.y,10,0,Math.PI*2);ctx.moveTo(p.x-16,p.y);ctx.lineTo(p.x+16,p.y);ctx.moveTo(p.x,p.y-16);ctx.lineTo(p.x,p.y+16);ctx.stroke();ctx.restore()
  }
  function draw(){
    const start=Date.now();
    ctx.setTransform(state.dpr,0,0,state.dpr,0,0);
    ctx.fillStyle='#0d1e26';ctx.fillRect(0,0,state.width,state.height);
    drawImage();drawTiles();if(state.showGrid)drawWorldGrid();drawWorldBounds();drawRoads();drawStructures();drawTrees();drawEvents();drawLocations();drawMarkers();drawSelection();drawMeasurement();updateScale();drawOverview();updateLayerInfo();metrics(start)
  }
  function setCamera(next){state.camera=next;updateZoom();schedule();invalidateStructures();saveView()}
  function moveTo(p){if(!worldValid(p))return notify('Coordinates must be inside Nasdara: X and Z between 0 and 16384');
    state.selected={x:p.x,z:p.z};coordsInSidebar(p);setCamera(P.view(p.x,p.z,Math.max(2.5,state.camera.zoom)));
    $('selected-readout').textContent='Selected X '+fmt(p.x)+' • Z '+fmt(p.z)
  }
  function mouseEvent(e){
    if(e.button!==0)return;
    state.pointerDown={point:pointerOffset(e),clientX:e.clientX,clientY:e.clientY,camera:{...state.camera},shift:e.shiftKey};
    state.drag={x:e.clientX,y:e.clientY,moved:false};
    canvas.setPointerCapture(e.pointerId);
    region.classList.add('dragging')
  }
  canvas.addEventListener('pointerdown',mouseEvent);
  canvas.addEventListener('pointermove',e=>{
    const current=worldFromPointer(e);state.cursor=current;updateReadout(current);if(state.measuring&&state.measurement?.start)schedule();
    if(!state.drag)return;
    const dx=e.clientX-state.drag.x,dy=e.clientY-state.drag.y;
    if(Math.hypot(e.clientX-state.pointerDown.clientX,e.clientY-state.pointerDown.clientY)>4)state.drag.moved=true;
    const scale=P.scale(state.pointerDown.camera,state.width,state.height);
    if(state.drag.moved)setCamera(P.view(state.pointerDown.camera.x-dx/scale,state.pointerDown.camera.z+dy/scale,state.pointerDown.camera.zoom))
  });
  function addMarker(p){
    if(!worldValid(p))return notify('Cannot add a marker outside the map');
    state.markers.push({x:Number(p.x.toFixed(3)),z:Number(p.z.toFixed(3)),label:$('marker-label').value.trim().slice(0,60)});state.selectedMarkerIndex=state.markers.length-1;$('update-marker').disabled=false;interacted=true;renderMarkerList();saveView();schedule();notify('Marker added at X '+fmt(p.x)+' / Z '+fmt(p.z))
  }
  canvas.addEventListener('pointerup',e=>{
    if(!state.drag)return;
    const wasDrag=state.drag.moved;
    state.drag=null;region.classList.remove('dragging');
    if(!wasDrag){const p=worldFromPointer(e);if(worldValid(p)){
      if(state.measuring){
        if(!state.measurement?.start||state.measurement.end)state.measurement={start:{x:p.x,z:p.z},end:null};
        else{state.measurement.end={x:p.x,z:p.z};state.measuring=false;region.classList.remove('measuring');$('measure-toggle').classList.remove('active');$('measure-toggle').textContent='Measure distance';
          const km=Math.hypot(state.measurement.end.x-state.measurement.start.x,state.measurement.end.z-state.measurement.start.z);
          $('measure-status').textContent=km>=1000?(km/1000).toFixed(3)+' km':km.toFixed(1)+' m';
        }
      }else{
        state.selected=p;coordsInSidebar(p);$('selected-readout').textContent='Selected X '+fmt(p.x)+' • Z '+fmt(p.z);if(e.shiftKey)addMarker(p);saveView()
      }
    }}
    schedule()
  });
  canvas.addEventListener('pointercancel',()=>{state.drag=null;region.classList.remove('dragging')});
  canvas.addEventListener('wheel',e=>{e.preventDefault();const p=pointerOffset(e);const multiplier=e.deltaY<0?1.17:1/1.17;setCamera(P.anchoredZoom(state.camera,p.x,p.y,state.camera.zoom*multiplier,state.width,state.height))},{passive:false});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('dblclick',e=>{
    e.preventDefault();const p=pointerOffset(e);setCamera(P.anchoredZoom(state.camera,p.x,p.y,state.camera.zoom*(e.shiftKey?.7:1.7),state.width,state.height))
  });
  $('zoom-in').onclick=()=>setCamera(P.anchoredZoom(state.camera,state.width/2,state.height/2,state.camera.zoom*1.6,state.width,state.height));
  $('zoom-out').onclick=()=>setCamera(P.anchoredZoom(state.camera,state.width/2,state.height/2,state.camera.zoom/1.6,state.width,state.height));
  $('fit-map').onclick=()=>setCamera(P.view());
  for(const [checkbox,key] of [['show-grid','showGrid'],['show-roads','showRoads'],['show-spawns','showSpawns'],['show-markers','showMarkers'],['show-structures','showStructures'],['show-asphalt','showAsphalt'],['show-dirt','showDirt'],['show-overview','showOverview'],['show-pois','showPois'],['show-trees','showTrees'],['show-villages','showVillages'],['show-military','showMilitary'],['show-industry','showIndustry']]){
    $(checkbox).onchange=e=>{state[key]=e.target.checked;if(key==='showAsphalt'||key==='showDirt')rebuildRoadOverview();if(key==='showStructures')invalidateStructures(0);schedule();saveView()}
  }
  $('satellite-tone').onchange=e=>{state.satelliteTone=e.target.value;schedule();saveView()};
  $('overlay-alpha').oninput=e=>{state.overlayAlpha=Number(e.target.value)/100;$('overlay-alpha-value').textContent=e.target.value+'%';schedule();invalidateStructures();saveView()};
  $('road-visibility').oninput=e=>{state.roadVisibility=Number(e.target.value)/100;$('road-visibility-value').textContent=e.target.value+'%';schedule();saveView()};
  $('road-width').oninput=e=>{
    state.roadWidthMeters=P.clamp(Number(e.target.value)||8,3,12);
    $('road-width-value').textContent=state.roadWidthMeters.toFixed(1)+' m';
    schedule();saveView();
  };
  $('vegetation-detail').oninput=e=>{state.vegetationDetail=Number(e.target.value)/100;$('vegetation-detail-value').textContent=e.target.value+'%';schedule();saveView()};
  $('toggle-sidebar').onclick=()=>{document.body.classList.toggle('focus-mode');setTimeout(resize,60)};
  $('focus-map').onclick=()=>{document.body.classList.toggle('focus-mode');setTimeout(resize,60)};
  const overview=$('overview-canvas');
  overview.addEventListener('click',e=>{const rect=overview.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*EXTENT,z=(1-(e.clientY-rect.top)/rect.height)*EXTENT;
    if(P.validateWorld(x,z))setCamera(P.view(x,z,Math.max(2,state.camera.zoom)))});
  $('measure-toggle').onclick=()=>{
    state.measuring=!state.measuring;
    if(state.measuring){state.measurement=null;$('measure-status').textContent='Click the start and end positions on the map';}
    else $('measure-status').textContent='Measurement tool disabled';
    $('measure-toggle').classList.toggle('active',state.measuring);
    $('measure-toggle').textContent=state.measuring?'Cancel measurement':'Measure distance';
    region.classList.toggle('measuring',state.measuring);schedule();
  };
  $('measure-reset').onclick=()=>{state.measurement=null;state.measuring=false;region.classList.remove('measuring');$('measure-toggle').classList.remove('active');$('measure-toggle').textContent='Measure distance';$('measure-status').textContent='Measurement cleared';schedule()};
  function inputCoords(){
    const x=Number($('coord-x').value),z=Number($('coord-z').value);
    return $('coord-x').value.trim()&&$('coord-z').value.trim()&&P.validateWorld(x,z)?{x,z}:null
  }
  $('go-coords').onclick=()=>{const p=inputCoords();if(!p)return notify('Enter valid X/Z coordinates within 0–16384');moveTo(p)};
  $('add-marker').onclick=()=>{const p=inputCoords();if(!p)return notify('Enter valid X/Z coordinates');addMarker(p)};
  $('update-marker').onclick=()=>{
    const p=inputCoords(),i=state.selectedMarkerIndex;
    if(i===null||i<0||i>=state.markers.length)return notify('Select a saved marker from the list first');
    if(!p)return notify('Enter valid X/Z coordinates');
    state.markers[i]={x:Number(p.x.toFixed(3)),z:Number(p.z.toFixed(3)),label:$('marker-label').value.trim().slice(0,60)};
    state.selected={x:p.x,z:p.z};interacted=true;
    renderMarkerList();saveView();schedule();notify('Marker '+(i+1)+' updated')
  };
  $('copy-coords').onclick=async()=>{const p=inputCoords();if(!p)return notify('Enter valid X/Z coordinates');try{await navigator.clipboard.writeText(fmt(p.x)+' '+fmt(p.z));notify('Coordinates copied')}catch{notify('Clipboard unavailable; select X/Z from the coordinate fields')}};
  $('clear-markers').onclick=()=>{if(!state.markers.length)return;if(!confirm('Clear '+state.markers.length+' local markers?'))return;state.markers=[];state.selectedMarkerIndex=null;$('update-marker').disabled=true;interacted=true;renderMarkerList();saveView();schedule()};
  $('export-markers').onclick=()=>{
    if(!state.markers.length)return notify('Add markers before exporting');
    const csv=s=>'"'+String(s??'').replaceAll('"','""')+'"';const output='index,label,x,z\n'+state.markers.map((m,i)=>[i+1,csv(m.label),m.x,m.z].join(',')).join('\n')+'\n';
    download(new Blob([output],{type:'text/csv;charset=utf-8'}),'ZedForge_Nasdara_Markers.csv')
  };
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
  function maxSize(file,limit){if(file.size>limit)throw Error('File too large (max '+(limit/1024/1024)+' MB)')}
  $('image-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    try{await showSatellite(file);notify('Satellite image loaded locally')}
    catch(err){notify('Image loading failed: '+err.message)}
  });
  $('remember-image').onchange=async e=>{
    if(!cache)return setCacheStatus('Browser storage unavailable');
    if(e.target.checked){
      if(state.imageFile)await cacheLayer('image',{blob:state.imageFile,name:state.imageFile.name||'Local satellite image'},'image');
      else setCacheStatus('Next loaded image will be saved locally');
    }else{
      try{await cache.remove('image');setCacheStatus('Image will not be remembered')}
      catch(err){notify('Could not remove cached image: '+err.message)}
    }
  };
  $('forget-image').onclick=async()=>{
    if(!cache)return notify('Local storage unavailable');
    try{await cache.remove('image');$('remember-image').checked=false;setCacheStatus('Saved imagery forgotten • current image still visible');notify('Cached satellite image cleared from this browser')}
    catch(err){notify('Could not forget cached image: '+err.message)}
  };
  let droppedDepth=0;
  region.addEventListener('dragenter',e=>{if(!e.dataTransfer?.types?.includes('Files'))return;e.preventDefault();droppedDepth++;region.classList.add('drop-active')});
  region.addEventListener('dragover',e=>{if(!e.dataTransfer?.types?.includes('Files'))return;e.preventDefault();e.dataTransfer.dropEffect='copy'});
  region.addEventListener('dragleave',()=>{droppedDepth--;if(droppedDepth<=0){droppedDepth=0;region.classList.remove('drop-active')}});
  region.addEventListener('drop',async e=>{
    e.preventDefault();droppedDepth=0;region.classList.remove('drop-active');
    const file=[...(e.dataTransfer?.files||[])].find(f=>['image/png','image/jpeg','image/webp'].includes(f.type));
    if(!file)return notify('Drop a PNG, JPG or WebP satellite image');
    try{await showSatellite(file);notify('Satellite image loaded by drop')}
    catch(err){notify('Image loading failed: '+err.message)}
  });
  function maxDataSize(file,limit){if(file.size>limit)throw Error('File too large (maximum '+Math.round(limit/1024/1024)+' MB)')}
  async function loadRoadLayer(file,{restored=false,name=null}={}){
    maxDataSize(file,16*1024*1024);
    const filename=name||file.name||'Imported roads';
    const roads=/\.roads$/i.test(filename)?M.parseRoads(await file.arrayBuffer()):M.parseGeoJSON(JSON.parse(await file.text()));
    state.roadLayer=roads;
    rebuildRoadOverview();
    $('roads-status').textContent=roads.count.toLocaleString()+' segments • '+(roads.repairedJoins||0).toLocaleString()+' short gaps smoothed • '+filename;
    if(!restored){interacted=true;void cacheLayer('roads',{blob:file,name:filename},'roads')}
    schedule();notify('Loaded '+roads.count.toLocaleString()+' accurate road segments');return roads;
  }
  async function loadStructureLayer(file,{restored=false,name=null}={}){
    maxDataSize(file,20*1024*1024);
    const filename=name||file.name||'Imported buildings';
    $('objects-status').textContent='Reading and indexing structure geometry…';
    await new Promise(done=>setTimeout(done,0));
    const structures=M.parseObjects(await file.arrayBuffer());
    state.objectLayer=structures;structureFront=null;invalidateStructures(0);
    $('objects-status').textContent=structures.count.toLocaleString()+' accurate building placements • '+structures.modelCount+' models • '+filename;
    if(!restored){interacted=true;void cacheLayer('buildings',{blob:file,name:filename},'buildings')}
    schedule();notify('Loaded '+structures.count.toLocaleString()+' calibrated structure placements');return structures;
  }
  $('roads-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    try{await loadRoadLayer(file)}catch(err){notify('Road layer rejected: '+err.message)}
  });
  $('objects-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    try{await loadStructureLayer(file)}catch(err){$('objects-status').textContent='Unable to read structure file';notify('Building layer rejected: '+err.message)}
  });
  $('pictures-file').addEventListener('change',async e=>{
    const files=[...(e.target.files||[])];e.target.value='';if(!files.length)return;
    $('pictures-status').textContent='Indexing numbered model pictures…';
    try{await loadPictureFiles(files)}catch(err){$('pictures-status').textContent='Could not load pictures';notify('Building pictures rejected: '+err.message)}
  });

  /* Optional imported data layers. Import paths are file-only; no network fetch. */
  function fileFormat(file){
    return /\.csv$/i.test(file.name)?'csv':/\.(?:geojson|json)$/i.test(file.name)?'geojson':null;
  }
  async function loadPointFile(file,type,{restored=false}={}){
    if(!file||file.size>12*1024*1024)throw Error('Location files must be smaller than 12 MB');
    const format=fileFormat(file);
    if(!format)throw Error('Please provide CSV or GeoJSON');
    const text=await file.text();
    const list=A.parsePoints(text,format,type==='trees'?'tree':'other');
    const index=A.groupPoints(list);
    if(type==='trees'){
      state.treeIndex=index;
      $('trees-status').textContent=list.length.toLocaleString()+' verified tree / vegetation positions • '+file.name;
      state.showTrees=true;$('show-trees').checked=true;
    }else{
      mergePermanentPlaces(list);
      state.showPois=true;$('show-pois').checked=true;
      refreshPOISearch();
    }
    if(!restored){interacted=true;void cacheLayer(type==='trees'?'trees':'pois',{text,format,name:file.name},type)}
    schedule();saveView();notify('Loaded '+list.length.toLocaleString()+' '+(type==='trees'?'vegetation':'place')+' coordinates');
  }
  $('poi-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    try{await loadPointFile(file,'pois')}catch(err){notify('Place labels: '+err.message)}
  });
  $('trees-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    try{await loadPointFile(file,'trees')}catch(err){notify('Vegetation positions: '+err.message)}
  });
  $('poi-search').oninput=refreshPOISearch;
  $('poi-results').onchange=e=>{
    const index=Number(e.target.value),loc=state.poiIndex?.points[index];
    if(loc){
      state.selected={x:loc.x,z:loc.z};coordsInSidebar(loc);
      setCamera(P.view(loc.x,loc.z,Math.max(4,state.camera.zoom)));
      $('selected-readout').textContent=loc.name+' • '+(loc.approximate?'approx. 100 m grid '+loc.grid:'X '+fmt(loc.x)+' / Z '+fmt(loc.z));
    }
  };
  $('tile-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    $('tile-status').textContent='Reading tile ZIP manifest…';
    try{await loadTilePack(file)}catch(err){$('tile-status').textContent='Tile archive could not be loaded';notify('High-resolution imagery: '+err.message)}
  });
  $('clear-tiles').onclick=async()=>{
    if(!tileRuntime.pack)return;
    disposeTiles();$('tile-status').textContent='High-resolution tile pack cleared';
    if(!state.image)$('empty-overlay').classList.remove('hidden');
    if(cache)try{await cache.remove('tilepack')}catch(err){notify('Could not clear saved tile pack: '+err.message)}
    schedule();notify('Returned to the existing satellite image')
  };
  $('calibration-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    try{
      if(file.size>200*1024)throw Error('Calibration CSV must be smaller than 200 KB');
      if(!state.image)throw Error('Load the base satellite image before checking pixel alignment');
      const result=A.parseCalibration(await file.text(),state.image.width,state.image.height);
      state.candidateCalibration=result;
      const safe=result.rms<=20&&Math.abs(result.dx)<=500&&Math.abs(result.dz)<=500;
      $('apply-calibration').disabled=!safe;
      $('calibration-status').textContent=result.count+' verified landmarks • suggested image shift X '+
        result.dx.toFixed(2)+' m, Z '+result.dz.toFixed(2)+' m • residual RMS '+result.rms.toFixed(2)+' m'+
        (safe?' • ready to apply':' • inconsistent or excessive offset; cannot apply automatically');
    }catch(err){state.candidateCalibration=null;$('apply-calibration').disabled=true;notify('Landmark alignment: '+err.message)}
  });
  $('apply-calibration').onclick=()=>{
    const result=state.candidateCalibration;
    if(!result||result.rms>20||Math.abs(result.dx)>500||Math.abs(result.dz)>500)return;
    state.calibration={dx:result.dx,dz:result.dz};interacted=true;
    $('calibration-status').textContent='Applied measured image offset X '+result.dx.toFixed(2)+' m, Z '+result.dz.toFixed(2)+' m • residual RMS '+result.rms.toFixed(2)+' m';
    saveView();schedule();notify('Satellite alignment offset applied • roads and buildings remain in native world coordinates');
  };
  $('reset-calibration').onclick=()=>{
    state.calibration={dx:0,dz:0};state.candidateCalibration=null;
    $('apply-calibration').disabled=true;
    $('calibration-status').textContent='Original north-up, 16,384 m image calibration restored';
    saveView();schedule()
  };

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
      state.eventSpawns=parsed.entries;state.eventNames=parsed.names;interacted=true;
      setEventFilter(parsed.names);
      void cacheLayer('events',{entries:parsed.entries,names:parsed.names,name:file.name},'event layer');
      $('events-status').textContent=parsed.entries.length+' positions from '+parsed.names.length+' events';
      schedule();notify('Imported '+parsed.entries.length+' event positions')
    }catch(err){notify('Event-spawn layer rejected: '+err.message)}
  });
  $('event-filter').onchange=()=>{schedule();saveView()};
  window.addEventListener('resize',resize);
  if('ResizeObserver'in window)new ResizeObserver(resize).observe(region);
  $('show-grid').checked=state.showGrid;
  state.showSpawns=false;$('show-spawns').checked=false;
  $('show-trees').checked=state.showTrees;
  mergePermanentPlaces();
  resize();updateZoom();renderMarkerList();void restoreCached();
})();
