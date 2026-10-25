'use strict';
/* ZedForge v0.3.0 Studios — loss-minimising editors for uploaded DayZ files. */
const SPAWN_RE=/<type\b[^>]*\bname\s*=\s*(["'])([^"']+)\1[^>]*>[\s\S]*?<\/type\s*>/gi;
const EVENT_RE=/<event\b[^>]*\bname\s*=\s*(["'])([^"']+)\1[^>]*>[\s\S]*?<\/event\s*>/gi;
const STUDIO_LIMIT=1000000;
const STUDIO_FIELDS=['nominal','min','max','lifetime','restock','saferadius','distanceradius','cleanupradius','active'];
const EVENT_HELP={
 nominal:'Target number of this event in the world.',
 min:'Lower population bound for the event.',
 max:'Upper population bound. A higher nominal also needs enough available positions.',
 lifetime:'Lifetime of the event in seconds.',
 restock:'Delay before the next event spawn, in seconds.',
 saferadius:'Minimum spawning distance from players, in metres.',
 distanceradius:'Separation between instances of the event, in metres.',
 cleanupradius:'Cleanup protection radius around players, in metres.',
 active:'1 = enabled; 0 = disabled.'
};
const studioPick={spawnables:null,events:null};
const studioCache=new WeakMap();
function studioFile(kind){return state.files.get($(kind==='spawnables'?'spawnable-file':'events-file').value)||null}
function studioEntries(file,kind){
 if(!file)return [];
 const cache=studioCache.get(file);if(cache&&cache.kind===kind&&cache.text===file.current)return cache.entries;
 const doc=parseXml(file.current);
 const expected=kind==='spawnables'?'spawnabletypes':'events';
 if(doc.documentElement.localName!==expected)throw new Error('Expected <'+expected+'> as the XML root');
 const nodeTag=kind==='spawnables'?'type':'event',pattern=kind==='spawnables'?SPAWN_RE:EVENT_RE;
 const elements=Array.from(doc.documentElement.children).filter(e=>e.localName===nodeTag);
 const matches=Array.from(file.current.matchAll(new RegExp(pattern.source,'gi')));
 if(elements.length!==matches.length)throw new Error('Unable to match every <'+nodeTag+'> without changing the original formatting');
 const seen=new Set();
 const entries=elements.map((node,index)=>{
  const name=node.getAttribute('name');if(!name||name!==matches[index][2])throw new Error('Classname/event name or order mismatch; editing disabled');
  if(seen.has(name))throw new Error('Duplicate '+nodeTag+' '+name+'; resolve duplicates before editing');seen.add(name);
  const n=tag=>Array.from(node.children).find(e=>e.localName===tag);
  const numeric=tag=>{const child=n(tag);if(!child)return null;const value=child.textContent.trim();return /^\d+$/.test(value)?Number(value):null};
  const spawnGroups=[];
  if(kind==='spawnables'){
   const counts={attachments:0,cargo:0};
   for(const element of Array.from(node.children)){const groupKind=element.localName;
    if(groupKind!=='attachments'&&groupKind!=='cargo')continue;
    spawnGroups.push({kind:groupKind,index:counts[groupKind]++,chance:element.hasAttribute('chance')?Number(element.getAttribute('chance')):null,preset:element.getAttribute('preset')||'',items:Array.from(element.children).filter(e=>e.localName==='item').map((c,i)=>({index:i,name:c.getAttribute('name')||'',chance:c.hasAttribute('chance')?Number(c.getAttribute('chance')):null}))})}
   const damage=n('damage');
   return {index,name,block:matches[index][0],damage:damage?{min:Number(damage.getAttribute('min')),max:Number(damage.getAttribute('max'))}:null,groups:spawnGroups,hoarder:!!n('hoarder')};
  }
  const childrenContainer=n('children');
  return {index,name,block:matches[index][0],kind:classifyEvent(name),values:Object.fromEntries(STUDIO_FIELDS.map(tag=>[tag,numeric(tag)])),position:n('position')?.textContent.trim()||'unspecified',limit:n('limit')?.textContent.trim()||'unspecified',children:childrenContainer?Array.from(childrenContainer.children).filter(e=>e.localName==='child').map((c,i)=>({index:i,name:c.getAttribute('type')||'',values:Object.fromEntries(['min','max','lootmin','lootmax'].map(k=>[k,c.hasAttribute(k)?Number(c.getAttribute(k)):null]))})):[]};
 });
 studioCache.set(file,{kind,text:file.current,entries});return entries;
}
function classifyEvent(name){const n=name.toLowerCase();if(n.startsWith('vehicle'))return'vehicle';if(n.startsWith('infected'))return'infected';if(n.startsWith('animal'))return'animal';if(n.startsWith('static')||/heli|crash|wreck/.test(n))return'crash';return'other'}
function studioOptionFiles(id,kind){const select=$(id),selected=select.value,files=[...state.files.values()].filter(f=>basename(f.path).toLowerCase()===(kind==='spawnables'?'cfgspawnabletypes.xml':'events.xml'));
 select.replaceChildren();if(!files.length)select.add(new Option('Import '+(kind==='spawnables'?'cfgspawnabletypes.xml':'events.xml'),''));
 for(const file of files)select.add(new Option(file.path,file.path));
 if(files.some(f=>f.path===selected))select.value=selected;else if(files.length)select.value=files[0].path}
function studioSelected(kind){const file=studioFile(kind);if(!file)return null;const entries=studioEntries(file,kind);return entries.find(e=>e.index===studioPick[kind])||null}
function renderStudio(kind){
 const isSpawn=kind==='spawnables',prefix=isSpawn?'spawnable':'events',file=studioFile(kind),picker=$(prefix+'-item'),fields=$(prefix+'-fields');
 const previous=studioPick[kind];picker.replaceChildren();
 if(!file){studioPick[kind]=null;$(prefix+'-name').textContent='Import a configuration';$(prefix+'-info').textContent='Choose a compatible XML or ZIP archive first';$(prefix+'-total').textContent='No file loaded';fields.innerHTML='<div class="empty">No configuration loaded.</div>';$(prefix+'-save').disabled=true;return}
 try{
  const all=studioEntries(file,kind),search=$(prefix+'-search').value.trim().toLowerCase(),cat=isSpawn?'all':$('events-filter').value;
  const visible=all.filter(e=>e.name.toLowerCase().includes(search)&&(cat==='all'||e.kind===cat));
  for(const item of visible)picker.add(new Option(item.name,String(item.index)));
  studioPick[kind]=visible.some(e=>e.index===previous)?previous:(visible[0]?.index??null);
  if(studioPick[kind]!==null)picker.value=String(studioPick[kind]);
  $(prefix+'-total').textContent=visible.length+' matching / '+all.length+' entries';
  const entry=all.find(e=>e.index===studioPick[kind]);
  $(prefix+'-name').textContent=entry?.name||'No matching entries';
  $(prefix+'-info').textContent=entry?(isSpawn?(entry.groups.length+' attachment/cargo groups • '+(entry.damage?'Damage values present':'No damage element')+(entry.hoarder?' • Hoarder tag present':'')):(entry.kind.toUpperCase()+' • Position: '+entry.position+' • Limit: '+entry.limit+' • '+entry.children.length+' child variants')):'Adjust your search or filter';
  fields.replaceChildren();if(entry){if(isSpawn)drawSpawnableFields(fields,entry);else drawEventFields(fields,entry)}else fields.innerHTML='<div class="empty">No entry selected.</div>';
  $(prefix+'-save').disabled=!entry;
  $(prefix+'-undo').disabled=!file.history?.length;$(prefix+'-redo').disabled=!file.future?.length;
 }catch(e){picker.replaceChildren();$(prefix+'-name').textContent='Cannot safely edit XML';$(prefix+'-info').textContent=e.message;fields.replaceChildren();$(prefix+'-save').disabled=true;$(prefix+'-total').textContent='Validation required'}
}
function numericInput({scope,field,value,min=0,max=1,step='.01',kind='',group=-1,item=-1,disabled=false}){
 const attrs=' data-studio-scope="'+scope+'" data-studio-attr="'+field+'" data-group-kind="'+kind+'" data-group-index="'+group+'" data-item-index="'+item+'"';
 return '<input type="number" '+attrs+' min="'+min+'" max="'+max+'" step="'+step+'" value="'+(Number.isFinite(value)?value:'')+'" '+(disabled?'disabled':'')+'>';
}
function drawSpawnableFields(root,entry){
 const details=document.createElement('section');details.className='studio-section';
 details.innerHTML='<h3>Condition on spawn</h3><p class="studio-help">Damage ranges from 0 (pristine) to 1 (ruined). Existing values are editable; when missing, a new pristine damage element can be added explicitly.</p>';
 if(entry.damage){
  const area=document.createElement('div');area.className='studio-form-grid';
  for(const name of ['min','max']){const label=document.createElement('label');label.textContent='Damage '+name;label.innerHTML+=numericInput({scope:'damage',field:name,value:entry.damage[name]});area.append(label)}
  details.append(area);
 }else{const btn=document.createElement('button');btn.type='button';btn.className='studio-btn';btn.textContent='+ Add pristine damage element';btn.onclick=()=>studioInsertDamage(entry);details.append(btn)}
 root.append(details);
 for(const group of entry.groups){
  const section=document.createElement('section');section.className='studio-section';
  const groupName=group.kind==='attachments'?'Attachments slot':'Cargo group';
  section.innerHTML='<h3>'+groupName+' '+(group.index+1)+'</h3><p class="studio-help">'+(group.preset?'Uses preset: '+esc(group.preset)+' • ':'')+'Group chance is independent from item chances. Existing presets are retained.</p>';
  const label=document.createElement('label');label.className='field-label';label.textContent='Group chance (0–1)';
  label.innerHTML+=numericInput({scope:'group',field:'chance',kind:group.kind,group:group.index,value:group.chance,disabled:group.chance===null});
  section.append(label);
  if(group.items.length){const title=document.createElement('h4');title.textContent='Candidate items';section.append(title);
   for(const item of group.items){const row=document.createElement('div');row.className='studio-itemline';const lbl=document.createElement('label');const name=document.createElement('span');name.className='item-name';name.textContent=item.name;lbl.append(name);
    const wrapper=document.createElement('div');wrapper.append(document.createTextNode('Chance '));wrapper.insertAdjacentHTML('beforeend',numericInput({scope:'item',field:'chance',kind:group.kind,group:group.index,item:item.index,value:item.chance,disabled:item.chance===null}));lbl.append(wrapper);row.append(lbl);section.append(row)}}
  else if(!group.preset){const p=document.createElement('p');p.className='studio-help';p.textContent='No inline items in this group.';section.append(p)}
  root.append(section);
 }
 if(!entry.groups.length){const p=document.createElement('p');p.className='studio-hint';p.textContent='This entry has no attachments or cargo groups. Existing hoarder and other metadata will be preserved.';root.append(p)}
}
function drawEventFields(root,entry){
 const section=document.createElement('section');section.className='studio-section';
 section.innerHTML='<h3>Event population and lifecycle</h3><p class="studio-help">Edit values already present in this event. Unsupported or absent fields are never automatically added.</p>';
 const grid=document.createElement('div');grid.className='studio-form-grid';
 for(const key of STUDIO_FIELDS){const label=document.createElement('label');label.textContent=key;
  label.title=EVENT_HELP[key];label.innerHTML+=numericInput({scope:'event-field',field:key,value:entry.values[key],min:0,max:key==='active'?1:STUDIO_LIMIT,step:1,disabled:entry.values[key]===null});grid.append(label)}
 section.append(grid);
 const hints=document.createElement('p');hints.className='studio-hint';hints.textContent='Nominal = target count • Min/Max = population bounds • Lifetime/Restock = seconds • Radius values = metres • Active: 0 off, 1 on.';section.append(hints);root.append(section);
 if(entry.children.length){const children=document.createElement('section');children.className='studio-section';children.innerHTML='<h3>Spawned child variants</h3><p class="studio-help">Child min/max control their own counts. Lootmin/lootmax control associated loot limits when supported.</p>';
  for(const child of entry.children){const title=document.createElement('h4');title.textContent=child.name||'Unknown child '+(child.index+1);children.append(title);
   const cgrid=document.createElement('div');cgrid.className='studio-form-grid';
   for(const name of ['min','max','lootmin','lootmax']){const label=document.createElement('label');label.textContent=name;
    label.innerHTML+=numericInput({scope:'child',field:name,value:child.values[name],min:0,max:STUDIO_LIMIT,step:1,item:child.index,disabled:child.values[name]===null});cgrid.append(label)}
   children.append(cgrid)}root.append(children)}
}
function replaceAttribute(tag,attr,value){
 const re=new RegExp('(\\b'+attr+'\\s*=\\s*)(["\\x27])([^"\\x27]*)\\2','i');if(!re.test(tag))throw new Error('Attribute '+attr+' not found in existing tag');
 return tag.replace(re,(_,prefix,quote,old)=>Number(old)===Number(value)?prefix+quote+old+quote:prefix+quote+String(value)+quote)
}
function replaceNthOpeningTag(block,tag,index,attr,value){
 let i=0,found=false;const re=new RegExp('<'+tag+'\\b[^>]*>','gi');
 const result=block.replace(re,match=>{if(i++!==index)return match;found=true;return replaceAttribute(match,attr,value)});
 if(!found)throw new Error('Expected <'+tag+'> not found');return result
}
function groupRange(block,kind,index){
 const re=/<(attachments|cargo)\b[^>]*>/gi;let m,counts={attachments:0,cargo:0};
 while((m=re.exec(block))){const k=m[1].toLowerCase(),current=counts[k]++;if(k!==kind||current!==index)continue;
  let end=m.index+m[0].length;
  if(!/\/\s*>$/.test(m[0])){const close=new RegExp('</'+kind+'\\s*>','gi');close.lastIndex=end;const c=close.exec(block);if(!c)throw new Error('Missing closing </'+kind+'>');end=c.index+c[0].length}
  return {start:m.index,end,text:block.slice(m.index,end)}}
 throw new Error(kind+' group '+index+' missing')
}
function modifyGroup(block,kind,index,modify){const r=groupRange(block,kind,index);return block.slice(0,r.start)+modify(r.text)+block.slice(r.end)}
function parseStudioNumber(input){
 if(input.disabled)return null;const value=input.value.trim(),n=Number(value);
 const min=Number(input.min),max=Number(input.max);
 if(!value||!Number.isFinite(n)||n<min||n>max)throw new Error('Invalid '+input.dataset.studioAttr+': '+value+' (expected '+min+'–'+max+')');
 if(input.step==='1'&&!Number.isInteger(n))throw new Error('Expected whole number for '+input.dataset.studioAttr);
 return n
}
function changedInputs(root){return Array.from(root.querySelectorAll('[data-studio-scope]')).filter(i=>!i.disabled).map(input=>({scope:input.dataset.studioScope,field:input.dataset.studioAttr,kind:input.dataset.groupKind,group:Number(input.dataset.groupIndex),item:Number(input.dataset.itemIndex),value:parseStudioNumber(input)}))}
function applyEntryPatch(file,kind,index,patch){
 const entries=studioEntries(file,kind),entry=entries.find(e=>e.index===index);if(!entry)throw new Error('Entry changed or missing; select it again');
 const re=new RegExp((kind==='spawnables'?SPAWN_RE:EVENT_RE).source,'gi');let i=0;
 const next=file.current.replace(re,match=>i++===index?patch(match,entry):match);
 if(next===file.current)return false;
 parseXml(next);if(!setFileCurrent(file,next))return false;return true
}
function saveSpawnable(){
 try{const file=studioFile('spawnables'),entry=studioSelected('spawnables');if(!entry)throw new Error('Select a valid classname first');
  const values=changedInputs($('spawnable-fields'));
  const damageVals={...entry.damage};
  for(const val of values)if(val.scope==='damage')damageVals[val.field]=val.value;
  if(entry.damage&&damageVals.min>damageVals.max)throw new Error('Damage minimum must not exceed damage maximum');
  const changed=applyEntryPatch(file,'spawnables',entry.index,block=>{
   for(const val of values){
    if(val.scope==='damage')block=replaceNthOpeningTag(block,'damage',0,val.field,val.value);
    if(val.scope==='group')block=modifyGroup(block,val.kind,val.group,g=>replaceNthOpeningTag(g,val.kind,0,val.field,val.value));
    if(val.scope==='item')block=modifyGroup(block,val.kind,val.group,g=>replaceNthOpeningTag(g,'item',val.item,val.field,val.value));
   }return block;
  });
  $('spawnable-feedback').textContent=changed?'Spawn package saved. Use Change Review to inspect.':'No values changed.';if(changed)notify('Saved '+entry.name);
 }catch(e){$('spawnable-feedback').textContent=e.message;notify(e.message)}
}
function studioInsertDamage(entry){
 const file=studioFile('spawnables');if(!file||entry.damage)return;
 try{if(!confirm('Add <damage min="0.0" max="0.0" /> to '+entry.name+'? This can be undone.'))return;
 const changed=applyEntryPatch(file,'spawnables',entry.index,block=>{
  const re=/(\r?\n)([ \t]*)<\/type\s*>/i;const match=re.exec(block);if(!match)throw new Error('Unsupported XML indentation; no changes made');
  const nl=match[1],indent=match[2],childIndent=block.match(/\r?\n([ \t]+)<(?:attachments|cargo|damage|hoarder)\b/i)?.[1]??(indent+'    ');
  return block.replace(re,nl+childIndent+'<damage min="0.0" max="0.0" />'+nl+indent+'</type>');
 });if(changed)notify('Pristine damage added to '+entry.name);
 }catch(e){notify(e.message)}
}
function saveEvent(){
 try{const file=studioFile('events'),entry=studioSelected('events');if(!entry)throw new Error('Select a valid event first');
 const values=changedInputs($('events-fields'));
 const scalar={...entry.values},children=entry.children.map(c=>({...c.values}));
 for(const v of values){if(v.scope==='event-field')scalar[v.field]=v.value;if(v.scope==='child')children[v.item][v.field]=v.value}
 if(scalar.min!==null&&scalar.max!==null&&scalar.min>scalar.max)throw new Error('Event minimum cannot exceed maximum');
 for(let i=0;i<children.length;i++){if(children[i].min!==null&&children[i].max!==null&&children[i].min>children[i].max)throw new Error('Child '+(i+1)+' minimum exceeds maximum');if(children[i].lootmin!==null&&children[i].lootmax!==null&&children[i].lootmin>children[i].lootmax)throw new Error('Child '+(i+1)+' loot minimum exceeds maximum')}
 const changed=applyEntryPatch(file,'events',entry.index,block=>{
  for(const v of values){if(v.scope==='event-field')block=replaceField(block,v.field,v.value);if(v.scope==='child')block=replaceNthOpeningTag(block,'child',v.item,v.field,v.value)}return block;
 });
 $('events-feedback').textContent=changed?'Event saved. Inspect the change review before export.':'No changes detected.';if(changed)notify('Saved '+entry.name);
 }catch(e){$('events-feedback').textContent=e.message;notify(e.message)}
}
function getStudioReport(file){
 const kind=basename(file.path).toLowerCase()==='cfgspawnabletypes.xml'?'spawnables':basename(file.path).toLowerCase()==='events.xml'?'events':null;
 if(!kind)return [];
 const report=[];
 try{
  for(const e of studioEntries(file,kind)){
   if(kind==='spawnables'){
    if(e.damage&&(!Number.isFinite(e.damage.min)||!Number.isFinite(e.damage.max)||e.damage.min<0||e.damage.max>1||e.damage.min>e.damage.max))report.push({level:'error',message:file.path+' / '+e.name+': invalid damage range'});
    for(const g of e.groups){
     if(g.chance!==null&&(!Number.isFinite(g.chance)||g.chance<0||g.chance>1))report.push({level:'error',message:e.name+': '+g.kind+' group '+(g.index+1)+' chance must be 0–1'});
     for(const item of g.items)if(item.chance!==null&&(!Number.isFinite(item.chance)||item.chance<0||item.chance>1))report.push({level:'error',message:e.name+': '+item.name+' chance must be 0–1'});
    }
   }else{
    const v=e.values;if(v.min!==null&&v.max!==null&&v.min>v.max)report.push({level:'error',message:e.name+': event min exceeds max'});
    if(v.active!==null&&![0,1].includes(v.active))report.push({level:'error',message:e.name+': active must be 0 or 1'});
    for(const child of e.children){const c=child.values;if(c.min!==null&&c.max!==null&&c.min>c.max)report.push({level:'error',message:e.name+' / '+child.name+': child min exceeds max'});if(c.lootmin!==null&&c.lootmax!==null&&c.lootmin>c.lootmax)report.push({level:'error',message:e.name+' / '+child.name+': child lootmin exceeds lootmax'})}
    if(v.nominal!==null&&v.max!==null&&v.nominal>v.max)report.push({level:'warn',message:e.name+': nominal exceeds event max; review desired bounds and spawn positions'});
   }
  }
  report.push({level:'ok',message:file.path+': '+kind+' entries parsed with structure preserved'});
 }catch(e){report.push({level:'error',message:file.path+': '+e.message})}
 return report
}
function bulkSpawnables(operation){
 const file=studioFile('spawnables');if(!file)return notify('Import cfgspawnabletypes.xml first');
 try{const entries=studioEntries(file,'spawnables'),affected=entries.filter(e=>operation==='pristine'||e.groups.some(g=>g.chance!==null));
 if(!affected.length)return notify('No editable entries found');
 const desc=operation==='pristine'?'Set damage min and max to 0.0 for '+affected.length+' entries, adding missing damage elements':'Set existing attachment/cargo group chances to 1 for '+affected.length+' entries';
 if(!confirm(desc+'?\n\nExisting custom settings in other fields will remain unchanged.'))return;
 let n=0,i=0;const next=file.current.replace(new RegExp(SPAWN_RE.source,'gi'),block=>{
  const entry=entries[i++];if(operation==='pristine'){
   if(entry.damage){block=replaceNthOpeningTag(block,'damage',0,'min',0);block=replaceNthOpeningTag(block,'damage',0,'max',0)}
   else{const re=/(\r?\n)([ \t]*)<\/type\s*>/i;const m=re.exec(block);if(!m)throw new Error('Cannot add damage element to '+entry.name+' without altering formatting');
    const nl=m[1],indent=m[2],childIndent=block.match(/\r?\n([ \t]+)<(?:attachments|cargo|damage|hoarder)\b/i)?.[1]??(indent+'    ');
    block=block.replace(re,nl+childIndent+'<damage min="0.0" max="0.0" />'+nl+indent+'</type>')}
   n++;return block}
  for(const group of entry.groups)if(group.chance!==null){block=modifyGroup(block,group.kind,group.index,g=>replaceNthOpeningTag(g,group.kind,0,'chance',1));n++}return block
 });
 parseXml(next);if(setFileCurrent(file,next))notify('Updated '+n+' spawn settings. Undo is available.');else notify('All targeted settings were already at the requested value');
 }catch(e){notify('No changes applied: '+e.message)}
}
function boostVehicleEvents(){
 const file=studioFile('events');if(!file)return notify('Import events.xml first');
 try{const factor=Number($('events-boost-factor').value);if(!Number.isFinite(factor)||factor<1||factor>20)throw new Error('Multiplier must be between 1 and 20');
 const entries=studioEntries(file,'events'),vehicles=entries.filter(e=>e.kind==='vehicle');
 if(!vehicles.length)return notify('No vehicle events found');
 const summary=vehicles.map(e=>({name:e.name,from:e.values.nominal,to:e.values.nominal===null?null:Math.round(e.values.nominal*factor)}));
 const examples=summary.slice(0,6).map(e=>e.name+': '+e.from+' → '+e.to).join('\n');
 if(!confirm('Boost '+vehicles.length+' vehicle events by ×'+factor+'?\n\n'+examples+(vehicles.length>6?'\n…and more.':'')+'\n\nThis modifies nominal, min, max and child min/max. It does NOT add spawn coordinates.'))return;
 let idx=0,updated=0;
 const next=file.current.replace(new RegExp(EVENT_RE.source,'gi'),block=>{
  const e=entries[idx++];if(e.kind!=='vehicle')return block;
  for(const key of ['nominal','min','max']){const val=e.values[key];if(val!==null){const nv=Math.round(val*factor);if(nv>STUDIO_LIMIT)throw new Error(e.name+' exceeds '+STUDIO_LIMIT+' for '+key);block=replaceField(block,key,nv)}}
  for(const child of e.children)for(const key of ['min','max']){const val=child.values[key];if(val!==null){const nv=Math.round(val*factor);if(nv>STUDIO_LIMIT)throw new Error(e.name+' child '+child.name+' exceeds '+STUDIO_LIMIT);block=replaceNthOpeningTag(block,'child',child.index,key,nv)}}
  updated++;return block
 });
 parseXml(next);if(setFileCurrent(file,next))notify('Boosted '+updated+' vehicle events. Check available spawn positions.');else notify('No vehicle event values changed');
 }catch(e){notify('Vehicle boost cancelled: '+e.message)}
}
/* Shared local history, validation, exports and imported file registry. */
labels.spawnables='Spawnable Studio';labels.events='Events Studio';
const previousShow=show;
show=function(view){previousShow(view);if(view==='spawnables'||view==='events')renderStudio(view)};
const previousUpdate=update;
update=function(){previousUpdate();if(state.view==='spawnables'||state.view==='events')renderStudio(state.view)};
const previousValidate=validateFiles;
validateFiles=function(files){const basic=previousValidate(files);for(const file of files)basic.push(...getStudioReport(file));return basic};
$('spawnable-file').onchange=()=>{studioPick.spawnables=null;renderStudio('spawnables')};
$('spawnable-search').oninput=()=>{studioPick.spawnables=null;renderStudio('spawnables')};
$('spawnable-item').onchange=()=>{studioPick.spawnables=Number($('spawnable-item').value);renderStudio('spawnables')};
$('spawnable-save').onclick=saveSpawnable;
$('spawnable-undo').onclick=()=>undoFile(studioFile('spawnables'));
$('spawnable-redo').onclick=()=>redoFile(studioFile('spawnables'));
$('spawnable-download').onclick=()=>{const f=studioFile('spawnables');if(f)downloadText(f.path,f.current)};
$('spawnable-pristine').onclick=()=>bulkSpawnables('pristine');
$('spawnable-group-full').onclick=()=>bulkSpawnables('chance');
$('events-file').onchange=()=>{studioPick.events=null;renderStudio('events')};
$('events-filter').onchange=()=>{studioPick.events=null;renderStudio('events')};
$('events-search').oninput=()=>{studioPick.events=null;renderStudio('events')};
$('events-item').onchange=()=>{studioPick.events=Number($('events-item').value);renderStudio('events')};
$('events-save').onclick=saveEvent;
$('events-undo').onclick=()=>undoFile(studioFile('events'));
$('events-redo').onclick=()=>redoFile(studioFile('events'));
$('events-download').onclick=()=>{const f=studioFile('events');if(f)downloadText(f.path,f.current)};
$('events-boost').onclick=boostVehicleEvents;
studioOptionFiles('spawnable-file','spawnables');studioOptionFiles('events-file','events');
/* Update wrapper also updates file selectors whenever the workspace changes. */
const studioUpdated=update;
update=function(){
 const prevSpawn=$('spawnable-file').value,prevEvents=$('events-file').value;
 studioUpdated();
 studioOptionFiles('spawnable-file','spawnables');
 studioOptionFiles('events-file','events');
 if((state.view==='spawnables'&&$('spawnable-file').value!==prevSpawn)||(state.view==='events'&&$('events-file').value!==prevEvents))studioPick[state.view]=null;
 if(state.view==='spawnables'||state.view==='events')renderStudio(state.view);
};
update();
