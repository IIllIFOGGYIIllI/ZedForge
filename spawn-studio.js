'use strict';
/* ZedForge v0.4.0: local cfgeventspawns.xml editor and Nasdara map handoff. */
(() => {
  const E=window.ZedForgeSpawnEngine;
  if(!E)throw Error('Event Spawn Studio engine missing');
  let chosenEvent=null,chosenPosition=null,picker=null;
  const worlds={nasdara:16384,chernarus:15360,livonia:12800};
  const world=()=>worlds[$('spawns-world').value]||16384;
  const spawnFile=()=>state.files.get($('spawns-file').value)||null;
  const matching=()=>[...state.files.values()].filter(f=>basename(f.path).toLowerCase()==='cfgeventspawns.xml');
  const parsed=()=>{const f=spawnFile();return f?E.parse(f.current,parseXml):{events:[],entries:[]}};
  function listFiles(){
    const select=$('spawns-file'),old=select.value,candidates=matching();
    select.replaceChildren();
    if(!candidates.length)select.add(new Option('Import cfgeventspawns.xml',''));
    for(const f of candidates)select.add(new Option(f.path,f.path));
    select.value=candidates.some(f=>f.path===old)?old:candidates[0]?.path||'';
  }
  function blank(message){
    $('spawns-event').replaceChildren();$('spawns-position').replaceChildren();
    $('spawns-heading').textContent='Select a spawn location';
    $('spawns-meta').textContent=message;
    $('spawns-total').textContent='No position selected';
    for(const id of ['spawns-x','spawns-z','spawns-a']){$(id).value='';$(id).disabled=true}
    for(const id of ['spawns-save','spawns-map','spawns-undo','spawns-redo','spawns-download'])$(id).disabled=true;
  }
  function renderSpawns(){
    listFiles();const f=spawnFile();
    if(!f){chosenEvent=null;chosenPosition=null;blank('Import an existing cfgeventspawns.xml file to begin.');return}
    try{
      const data=parsed(),query=$('spawns-search').value.trim().toLowerCase();
      const filtered=data.events.filter(e=>e.name.toLowerCase().includes(query));
      $('spawns-event').replaceChildren();
      for(const e of filtered)$('spawns-event').add(new Option(e.name+' ('+e.count+')',String(e.index)));
      if(!filtered.some(e=>e.index===chosenEvent)){chosenEvent=filtered[0]?.index??null;chosenPosition=null}
      if(chosenEvent!==null)$('spawns-event').value=String(chosenEvent);
      const positions=data.entries.filter(e=>e.eventIndex===chosenEvent);
      $('spawns-position').replaceChildren();
      for(const p of positions)$('spawns-position').add(new Option('#'+(p.positionIndex+1)+' · X '+p.x+' / Z '+p.z,String(p.positionIndex)));
      if(!positions.some(p=>p.positionIndex===chosenPosition))chosenPosition=positions[0]?.positionIndex??null;
      if(chosenPosition!==null)$('spawns-position').value=String(chosenPosition);
      const p=positions.find(e=>e.positionIndex===chosenPosition);
      $('spawns-total').textContent=data.entries.length+' positions across '+data.events.length+' events · '+positions.length+' in selected event';
      $('spawns-heading').textContent=p?p.name+' · #'+(p.positionIndex+1):'No matching spawn location';
      $('spawns-meta').textContent=p?'Edit the existing game-world X/Z metres. Orientation -1 is the DayZ random-direction sentinel.':'Change the search filter or select another event.';
      for(const [id,key] of [['spawns-x','x'],['spawns-z','z'],['spawns-a','a']]){
        $(id).disabled=!p||(key==='a'&&p.a===null);$(id).value=p?.[key]??'';
      }
      $('spawns-undo').disabled=!f.history?.length;$('spawns-redo').disabled=!f.future?.length;
      $('spawns-save').disabled=!p;$('spawns-download').disabled=false;
      $('spawns-map').disabled=!p||$('spawns-world').value!=='nasdara';
      if(p){$('spawns-world-message').textContent=$('spawns-world').value==='nasdara'?'Nasdara Map Lab can choose X/Z; it will not modify the file until you save.':'Map picking is available for Nasdara; other maps support manual numeric editing.'}
    }catch(err){chosenEvent=null;chosenPosition=null;blank('Cannot safely parse cfgeventspawns.xml: '+err.message);$('spawns-feedback').textContent=err.message}
  }
  function selected(){
    const f=spawnFile(),p=parsed().entries.find(e=>e.eventIndex===chosenEvent&&e.positionIndex===chosenPosition);
    if(!f||!p)throw Error('Select a valid event position first');
    return {f,p};
  }
  function save(){
    try{
      const {f,p}=selected(),next=E.update(f.current,p.eventIndex,p.positionIndex,{
        x:$('spawns-x').value,z:$('spawns-z').value,a:$('spawns-a').value
      },parseXml,world());
      if(setFileCurrent(f,next)){
        $('spawns-feedback').textContent='Saved '+p.name+' position '+(p.positionIndex+1)+'. Undo and changed ZIP export are available.';
        notify('Spawn coordinates saved locally');
      }else{$('spawns-feedback').textContent='No changes detected.'}
    }catch(err){$('spawns-feedback').textContent=err.message;notify(err.message)}
  }
  function mapPicker(){
    try{
      const {p}=selected();
      if($('spawns-world').value!=='nasdara')throw Error('Map-assisted picking currently supports Nasdara only');
      if(picker&&!picker.closed)picker.close();
      const url='./map-lab/?spawn-picker=1&x='+encodeURIComponent(p.x)+'&z='+encodeURIComponent(p.z);
      picker=window.open(url,'_blank');
      if(!picker)throw Error('Map window blocked. Allow pop-ups for ZedForge.');
      $('spawns-feedback').textContent='Click a location in the Nasdara Map Lab to copy X/Z back here, then Save position.';
    }catch(err){notify(err.message)}
  }
  window.addEventListener('message',event=>{
    if(event.origin!==window.location.origin||!picker||event.source!==picker)return;
    const d=event.data;
    if(d?.type!=='zedforge:event-spawn-coordinate'||$('spawns-world').value!=='nasdara')return;
    if(!Number.isFinite(d.x)||!Number.isFinite(d.z)||d.x<0||d.z<0||d.x>16384||d.z>16384)return;
    if(!spawnFile()||chosenEvent===null||chosenPosition===null)return;
    $('spawns-x').value=Number(d.x.toFixed(3));
    $('spawns-z').value=Number(d.z.toFixed(3));
    $('spawns-feedback').textContent='Map coordinates copied. Review the X/Z values and select Save position to apply them.';
    notify('Map coordinates copied into the editor');
  });
  const previousShow=show;
  show=function(view){previousShow(view);if(view==='spawns')renderSpawns()};
  const previousUpdate=update;
  update=function(){previousUpdate();if(state.view==='spawns')renderSpawns()};
  const previousValidate=validateFiles;
  validateFiles=function(list){
    const report=previousValidate(list);
    for(const f of list)if(basename(f.path).toLowerCase()==='cfgeventspawns.xml'){
      try{
        const findings=E.inspect(f.current,parseXml,world());
        for(const item of findings)report.push({...item,message:f.path+': '+item.message});
      }catch(err){report.push({level:'error',message:f.path+': '+err.message})}
    }
    return report;
  };
  labels.spawns='Event Spawn Studio';
  $('spawns-file').onchange=()=>{chosenEvent=null;chosenPosition=null;renderSpawns()};
  $('spawns-world').onchange=renderSpawns;
  $('spawns-search').oninput=()=>{chosenEvent=null;chosenPosition=null;renderSpawns()};
  $('spawns-event').onchange=()=>{chosenEvent=Number($('spawns-event').value);chosenPosition=null;renderSpawns()};
  $('spawns-position').onchange=()=>{chosenPosition=Number($('spawns-position').value);renderSpawns()};
  $('spawns-save').onclick=save;
  $('spawns-undo').onclick=()=>undoFile(spawnFile());
  $('spawns-redo').onclick=()=>redoFile(spawnFile());
  $('spawns-download').onclick=()=>{const f=spawnFile();if(f)downloadText(f.path,f.current)};
  $('spawns-map').onclick=mapPicker;
})();
