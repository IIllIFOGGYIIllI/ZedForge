'use strict';
/* ZedForge v0.2.0 alpha. Browser-only editing; never uploads user files to a server. */
const $ = id => document.getElementById(id);
const state = { files:new Map(), selectedFile:null, selectedItems:new Set(), pending:null, view:'dashboard', editorIndex:null };
const MAX_ARCHIVE = 40 * 1024 * 1024;
const MAX_FILE = 8 * 1024 * 1024;
const MAX_ENTRIES = 500;
const TYPE_RE = /<type\b[^>]*\bname\s*=\s*(["'])([^"']+)\1[^>]*>[\s\S]*?<\/type\s*>/gi;
const labels={dashboard:'Overview',files:'File Manager',booster:'Loot Booster',editor:'Item Editor',changes:'Change Review',validation:'Validation'};
const enc=new TextEncoder();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastTimer;

/* Private local-first workspace: structured-clone records stored in IndexedDB. */
const DB_NAME='zedforge-workspaces', DB_VERSION=1, HISTORY_LIMIT=8;
let db=null,saveTimer=null,saveChain=Promise.resolve(),hasImported=false;
function storageLabel(value){$('persist-indicator').textContent=value}
function openLocalDb(){return new Promise((resolve,reject)=>{if(!('indexedDB'in window))return reject(new Error('IndexedDB unavailable'));
 const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('workspace'))req.result.createObjectStore('workspace')};
 req.onerror=()=>reject(req.error||new Error('Local storage unavailable'));req.onsuccess=()=>resolve(req.result)})}
function dbRead(){return new Promise((resolve,reject)=>{const tx=db.transaction('workspace','readonly');const req=tx.objectStore('workspace').get('active');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function dbWrite(data){return new Promise((resolve,reject)=>{const tx=db.transaction('workspace','readwrite');tx.objectStore('workspace').put(data,'active');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
function scheduleSave(){if(!db)return;storageLabel('Saving locally…');clearTimeout(saveTimer);saveTimer=setTimeout(()=>{
 const snapshot={files:[...state.files.values()].map(f=>({path:f.path,original:f.original,current:f.current,history:f.history||[],future:f.future||[]})),selectedFile:state.selectedFile};
 saveChain=saveChain.catch(()=>{}).then(()=>dbWrite(snapshot)).then(()=>storageLabel('✓ Saved locally • offline')).catch(err=>{storageLabel('⚠ Local storage unavailable — export files');notify('Local save failed: '+err.message)});
 },400)}
async function initialiseStorage(){try{db=await openLocalDb();const stored=await dbRead();if(stored?.files?.length&&!hasImported&&!state.files.size){state.files=new Map(stored.files.filter(f=>f&&typeof f.path==='string'&&typeof f.original==='string'&&typeof f.current==='string').map(f=>[f.path,{path:f.path,original:f.original,current:f.current,history:Array.isArray(f.history)?f.history.slice(-HISTORY_LIMIT):[],future:Array.isArray(f.future)?f.future.slice(-HISTORY_LIMIT):[]}]));
 state.selectedFile=stored.selectedFile||null;update();notify('Previous workspace restored from this browser')}
 storageLabel('✓ Saved locally • offline');
 }catch(err){storageLabel('⚠ Browser-only session; export your work');notify('Local workspace storage unavailable — export before leaving')}}
function setFileCurrent(file,value){if(file.current===value)return false;if(!Array.isArray(file.history))file.history=[];
 file.history.push(file.current);if(file.history.length>HISTORY_LIMIT)file.history.shift();file.future=[];file.current=value;state.selectedItems.clear();update();scheduleSave();return true}
function undoFile(file){if(!file?.history?.length)return notify('Nothing to undo');file.future=file.future||[];file.future.push(file.current);file.current=file.history.pop();update();scheduleSave();notify('Undo complete')}
function redoFile(file){if(!file?.future?.length)return notify('Nothing to redo');file.history=file.history||[];file.history.push(file.current);if(file.history.length>HISTORY_LIMIT)file.history.shift();file.current=file.future.pop();update();scheduleSave();notify('Redo complete')}
function restoreOriginal(file){if(!file||file.current===file.original)return notify('File already matches imported original');if(!confirm('Restore original '+file.path+'? You can undo this action.'))return;setFileCurrent(file,file.original);notify('Original restored')}

function notify(message){const node=$('toast');node.textContent=message;node.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.style.display='none',4500)}
function show(view){state.view=view;Object.keys(labels).forEach(key=>{$('view-'+key).classList.toggle('hidden',key!==view);document.querySelector('[data-view="'+key+'"]').classList.toggle('active',key===view)});$('page-crumb').textContent=labels[view];$('sidebar').classList.remove('open');if(view==='validation')renderValidation();if(view==='changes')renderChanges();if(view==='editor')renderEditor()}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));
$('mobile-menu').onclick=()=>$('sidebar').classList.toggle('open');
const themes=['obsidian','tactical','midnight','arctic'];
const rememberedTheme=localStorage.getItem('zedforge-theme');
if(themes.includes(rememberedTheme)){$('theme').value=rememberedTheme;document.body.dataset.theme=rememberedTheme}
$('theme').onchange=e=>{const theme=e.target.value;if(!themes.includes(theme))return;document.body.dataset.theme=theme;localStorage.setItem('zedforge-theme',theme)};
function parseXml(text){if(/<!DOCTYPE/i.test(text)||/<!ENTITY/i.test(text))throw new Error('DOCTYPE/ENTITY declarations are not supported for safety');const doc=new DOMParser().parseFromString(text,'application/xml');const error=doc.getElementsByTagName('parsererror')[0];if(error)throw new Error('Malformed XML: '+error.textContent.trim().slice(0,180));return doc}
function basename(path){return path.split('/').pop()||path}
function supported(path){return /\.(xml|json)$/i.test(path)}
function safePath(path){path=path.replace(/\\/g,'/').replace(/^\/+/,'');if(!path||path.split('/').some(s=>s==='..'||!s)||/^[a-z]:/i.test(path))throw new Error('Unsafe archive path: '+path);return path}
function ingest(path,content){path=safePath(path);if(!supported(path))return false;if(enc.encode(content).length>MAX_FILE)throw new Error('File exceeds 8 MB: '+path);
 if(state.files.has(path)){const prior=state.files.get(path);if(prior.current!==prior.original&&!confirm('Replace modified file '+path+' and lose its unsaved edits?'))return false;}
 state.files.set(path,{path,original:content,current:content,history:[],future:[]});hasImported=true;return true}
async function importFiles(fileList){const files=Array.from(fileList||[]);let count=0,issues=[];
 for(const file of files){try{
 if(/\.zip$/i.test(file.name)){if(file.size>MAX_ARCHIVE)throw new Error('ZIP exceeds 40 MB');if(!window.JSZip)throw new Error('Local ZIP module unavailable. Reload the application.');
 const zip=await JSZip.loadAsync(file);const entries=Object.values(zip.files).filter(e=>!e.dir&&supported(e.name));if(entries.length>MAX_ENTRIES)throw new Error('ZIP contains too many configuration files');let totalSize=0;for(const entry of entries){try{const size=entry._data?.uncompressedSize??0;if(size>MAX_FILE)throw new Error('Uncompressed file exceeds 8 MB');totalSize+=size;if(totalSize>60*1024*1024)throw new Error('Uncompressed archive exceeds 60 MB');const content=await entry.async('string');if(ingest(entry.name,content))count++}catch(e){issues.push(entry.name+': '+e.message)}}}
 else if(supported(file.name)){if(file.size>MAX_FILE)throw new Error('File exceeds 8 MB');if(ingest(file.name,await file.text()))count++}
 else issues.push(file.name+': unsupported extension');
 }catch(e){issues.push(file.name+': '+e.message)}}
 state.selectedItems.clear();state.editorIndex=null;update();if(count)scheduleSave();if(count){notify('Imported '+count+' configuration file'+(count===1?'':'s'));show('files')}
 if(issues.length)notify(issues.slice(0,3).join(' • ')+(issues.length>3?' • and more':''));
}
$('file-input').addEventListener('change',e=>{importFiles(e.target.files);e.target.value=''});
function openImporter(){$('file-input').click()}
$('choose-files').onclick=e=>{e.stopPropagation();openImporter()};
$('add-files').onclick=openImporter;
const drop=$('dropzone');
drop.onclick=e=>{if(e.target.id!=='choose-files')openImporter()};
drop.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target===drop){e.preventDefault();openImporter()}};
['dragenter','dragover'].forEach(event=>drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('dragover')}));
['dragleave','drop'].forEach(event=>drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('dragover')}));
drop.addEventListener('drop',e=>importFiles(e.dataTransfer.files));
function isTypes(path){return basename(path).toLowerCase()==='types.xml'}
const scanCache=new WeakMap();
function scanTypes(file){if(!file||!isTypes(file.path))return [];const cached=scanCache.get(file);if(cached&&cached.source===file.current)return cached.items;const doc=parseXml(file.current);if(doc.documentElement.localName!=='types')throw new Error('Expected <types> root element');
 const xmlItems=Array.from(doc.documentElement.children).filter(node=>node.localName==='type');
 const matches=Array.from(file.current.matchAll(new RegExp(TYPE_RE.source,'gi')));
 if(matches.length!==xmlItems.length)throw new Error('Unable to safely map XML entries without changing formatting');
 const mapped=xmlItems.map((element,index)=>{const name=element.getAttribute('name')||'';
 if(name!==matches[index][2])throw new Error('XML item ordering mismatch; boost safely aborted');
 const numeric=tag=>{const child=Array.from(element.children).find(e=>e.localName===tag);if(!child)return null;const n=child.textContent.trim();return /^-?\d+$/.test(n)?Number(n):null};
 const tags=type=>Array.from(element.children).filter(e=>e.localName===type).map(e=>e.getAttribute('name')).filter(Boolean);
 return {index,name,nominal:numeric('nominal'),min:numeric('min'),lifetime:numeric('lifetime'),restock:numeric('restock'),quantmin:numeric('quantmin'),quantmax:numeric('quantmax'),cost:numeric('cost'),category:categorise(element,name),categories:tags('category'),usages:tags('usage'),tiers:tags('value'),block:matches[index][0]};});
 scanCache.set(file,{source:file.current,items:mapped});return mapped;
}
function categorise(node,name){const types=Array.from(node.children).filter(e=>e.localName==='category').map(e=>(e.getAttribute('name')||'').toLowerCase());
 const n=name.toLowerCase();
 if(/^(ammo_|ammobox_|mag_|magazine_)/.test(n)||/[\w]magazine|_mag\b|cartridge|bullet/.test(n))return'ammo';
 if(/^(nailbox|nails|woodenplank|metalwire|sheetmetal|woodenlog|fencekit|watchtowerkit|barbedwire|combinationlock|wiremesh|codelock)/.test(n))return'building';
 if(/^(sparkplug|radiator|carbattery|truckbattery|headlight|carradiator|carradiator|carwheel|truckwheel|vehiclewheel)/.test(n)||types.includes('vehiclesparts'))return'vehicles';
 if(types.includes('food')||types.includes('drinks'))return'food';
 if(types.includes('medical')||/^(bandage|tetracycline|vitamin|saline|morphine|epinephrine|bloodbag|antibiotic)/.test(n))return'medical';
 if(types.includes('clothes')||/^(jacket|pants|boots|helmet|vest|shirt|gloves)/.test(n))return'clothing';
 if(types.includes('weapons'))return'weapons';
 return'other';
}
function getEconomy(){const path=$('economy-file').value;return state.files.get(path)||null}
function update(){const list=[...state.files.values()];$('stat-files').textContent=list.length;
 $('stat-changed').textContent=list.filter(f=>f.original!==f.current).length;
 $('file-count-label').textContent=list.length+' file'+(list.length===1?'':'s');
 const previous=$('economy-file').value;$('economy-file').replaceChildren();const candidates=list.filter(f=>isTypes(f.path));
 if(!candidates.length)$('economy-file').add(new Option('Import types.xml first',''));
 for(const f of candidates)$('economy-file').add(new Option(f.path,f.path));
 if(candidates.some(f=>f.path===previous))$('economy-file').value=previous;
 else if(candidates.length)$('economy-file').value=candidates[0].path;
 for(const id of ['editor-file']){const select=$(id),selected=select.value;select.replaceChildren();if(!candidates.length)select.add(new Option('Import types.xml first',''));for(const f of candidates)select.add(new Option(f.path,f.path));if(candidates.some(f=>f.path===selected))select.value=selected;else if(candidates.length)select.value=candidates[0].path}
 let total=0;for(const f of candidates)try{total+=scanTypes(f).length}catch(e){}
 $('stat-items').textContent=total.toLocaleString();
 if(!state.selectedFile||!state.files.has(state.selectedFile))state.selectedFile=list[0]?.path||null;
 renderFiles();renderItems();renderValidation();if(state.view==='editor')renderEditor();if(state.view==='changes')renderChanges();
}
function renderFiles(){const rows=[...state.files.values()];const body=$('files-body');body.replaceChildren();if(!rows.length){body.innerHTML='<tr><td colspan="4" class="empty">No files imported yet.</td></tr>';renderFilePreview();return}
 for(const file of rows){const tr=document.createElement('tr');const name=document.createElement('td');name.className='filename';name.textContent=file.path;
 const type=document.createElement('td');type.textContent=basename(file.path).split('.').pop().toUpperCase();
 const status=document.createElement('td');const changed=file.original!==file.current;status.innerHTML='<span class="status '+(changed?'modified':'')+'">'+(changed?'● Modified':'✓ Original')+'</span>';
 const actions=document.createElement('td');actions.className='inline-actions';for(const [label,action] of [['Preview',()=>{state.selectedFile=file.path;renderFilePreview()}],['Download',()=>downloadText(file.path,file.current)],['Revert',()=>restoreOriginal(file)]]){const button=document.createElement('button');button.textContent=label;button.disabled=label==='Revert'&&!changed;button.onclick=action;actions.append(button)}tr.append(name,type,status,actions);body.append(tr)}
 renderFilePreview()}
function renderFilePreview(){const file=state.files.get(state.selectedFile);$('preview-name').textContent=file?.path||'No file selected';$('file-preview').textContent=file?file.current.slice(0,35000)+(file.current.length>35000?'\n… Preview truncated':''):'Import a file to view its contents.'}
function filteredItems(items){const q=$('item-search').value.trim().toLowerCase(),c=$('category').value;return items.filter(item=>(c==='all'||item.category===c)&&item.name.toLowerCase().includes(q))}
function renderItems(){const body=$('items-body');body.replaceChildren();const file=getEconomy();if(!file){$('item-count-label').textContent='0 items';body.innerHTML='<tr><td colspan="5" class="empty">Import types.xml to browse loot entries.</td></tr>';return}
 let items;try{items=scanTypes(file)}catch(e){$('item-count-label').textContent='Error';body.innerHTML='<tr><td colspan="5" class="empty">'+esc(e.message)+'</td></tr>';return}
 const visible=filteredItems(items);$('item-count-label').textContent=visible.length+' visible / '+items.length+' items';const frag=document.createDocumentFragment();
 for(const item of visible.slice(0,500)){const tr=document.createElement('tr');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=state.selectedItems.has(item.index);checkbox.setAttribute('aria-label','Select '+item.name);checkbox.onchange=()=>checkbox.checked?state.selectedItems.add(item.index):state.selectedItems.delete(item.index);
 const cells=[document.createElement('td'),document.createElement('td'),document.createElement('td'),document.createElement('td'),document.createElement('td')];cells[0].append(checkbox);cells[1].className='filename';cells[1].textContent=item.name;cells[2].textContent=item.category;cells[3].textContent=item.nominal??'—';cells[4].textContent=item.min??'—';tr.append(...cells);frag.append(tr)}
 body.append(frag);if(!visible.length)body.innerHTML='<tr><td colspan="5" class="empty">No matching entries.</td></tr>';if(visible.length>500){const tr=document.createElement('tr');tr.innerHTML='<td colspan="5" class="empty">Showing the first 500 matches. Refine search to find more.</td>';body.append(tr)}}
$('economy-file').onchange=()=>{state.selectedItems.clear();renderItems()};
$('category').onchange=renderItems;$('item-search').oninput=renderItems;
$('select-visible').onclick=()=>{try{filteredItems(scanTypes(getEconomy())).forEach(i=>state.selectedItems.add(i.index));renderItems()}catch(e){notify(e.message)}};
$('deselect-all').onclick=()=>{state.selectedItems.clear();renderItems()};
function calculateBoost(value,input,operation,includeZero){if(value===null)return null;
 if(operation==='exact'){if(value===0&&!includeZero)return 0;return input}
 if(value===0)return 0;return Math.round(value*input)}
function makeBoost(){const file=getEconomy();if(!file)throw new Error('Import types.xml first');
 const items=scanTypes(file),visible=filteredItems(items),input=Number($('boost-value').value),op=$('boost-mode').value,mode=$('field-mode').value,includeZero=$('include-zero').checked,selectedOnly=$('selected-only').checked;
 if(!Number.isFinite(input)||input<0||input>1000000||(op==='multiply'&&input>1000)||(op==='exact'&&!Number.isInteger(input)))throw new Error('Enter a valid '+(op==='exact'?'whole number (0–1,000,000)':'multiplier (0–1000)'));
 if(selectedOnly&&!state.selectedItems.size)throw new Error('Select one or more items first');
 const candidates=selectedOnly?items.filter(i=>state.selectedItems.has(i.index)):visible,changes=[];
 let skipped=0;
 for(const item of candidates){if(item.nominal===null||item.min===null){skipped++;continue}
 const newN=mode==='min'?item.nominal:calculateBoost(item.nominal,input,op,includeZero);
 const newM=mode==='nominal'?item.min:calculateBoost(item.min,input,op,includeZero);
 if(newM>newN||newN>1000000||newM>1000000||newN<0||newM<0){skipped++;continue}
 if(newN!==item.nominal||newM!==item.min)changes.push({...item,newN,newM})}
 return {file,changes,considered:candidates.length,skipped,op,input}}
$('boost-mode').onchange=()=>{$('boost-value').value=$('boost-mode').value==='multiply'?'2':'50';$('boost-value').step=$('boost-mode').value==='multiply'?'0.1':'1';$('include-zero').disabled=$('boost-mode').value==='multiply';if($('include-zero').disabled)$('include-zero').checked=false};
$('boost-mode').onchange();
function fmtDiff(a,b){return a===b?String(a):a+' → '+b}
$('preview-boost').onclick=()=>{try{const plan=makeBoost();if(!plan.changes.length)throw new Error('No eligible changes. Check filters, values, and selection.');state.pending=plan;$('dialog-summary').textContent=plan.changes.length+' of '+plan.considered+' filtered entries will change. '+plan.skipped+' skipped due to invalid resulting values. '+(plan.file.current!==plan.file.original?'Warning: this file already has edits; a further boost compounds existing values.':'All changes are calculated from this file’s current values.');
 const body=$('diff-body');body.replaceChildren();for(const item of plan.changes.slice(0,100)){const tr=document.createElement('tr');for(const value of [item.name,fmtDiff(item.nominal,item.newN),fmtDiff(item.min,item.newM)]){const td=document.createElement('td');td.textContent=value;tr.append(td)}body.append(tr)}if(plan.changes.length>100){const tr=document.createElement('tr');tr.innerHTML='<td colspan="3">Additional changes omitted from this preview table.</td>';body.append(tr)}$('boost-dialog').showModal()}catch(e){$('boost-feedback').textContent=e.message;notify(e.message)}};
$('cancel-boost').onclick=()=>{$('boost-dialog').close();state.pending=null};
$('boost-dialog').addEventListener('close',()=>state.pending=null);
function replaceField(block,tag,value){const pattern=new RegExp('(<'+tag+'\\b[^>]*>)(\\s*)(-?\\d+)(\\s*)(<\\/'+tag+'\\s*>)','i');
 if(!pattern.test(block))throw new Error('Could not safely edit <'+tag+'> without modifying unrelated XML');
 return block.replace(pattern,(_,open,ws,num,tail,close)=>open+ws+String(value)+tail+close)}
$('apply-boost').onclick=()=>{const plan=state.pending;if(!plan)return;try{const replacements=new Map(plan.changes.map(c=>[c.index,c]));let ix=0;const output=plan.file.current.replace(new RegExp(TYPE_RE.source,'gi'),block=>{const item=replacements.get(ix++);if(!item)return block;return replaceField(replaceField(block,'nominal',item.newN),'min',item.newM)});
 parseXml(output);setFileCurrent(plan.file,output);$('boost-dialog').close();state.pending=null;$('boost-feedback').textContent='Applied '+plan.changes.length+' changes. Review the files and export when ready.';notify('Updated '+plan.changes.length+' economy entries.')}catch(e){notify('Boost failed: '+e.message)}};
$('reset-economy').onclick=()=>{const file=getEconomy();if(!file)return;if(file.current===file.original)return notify('This file is already at its original version');restoreOriginal(file)};
function downloadText(name,content){const blob=new Blob([content],{type:/\.json$/i.test(name)?'application/json':'application/xml'});saveBlob(blob,basename(name))}
function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
$('download-economy').onclick=()=>{const f=getEconomy();if(!f)return notify('No types.xml file selected');try{parseXml(f.current);downloadText(f.path,f.current)}catch(e){notify(e.message)}};
async function exportZip(all){const files=[...state.files.values()].filter(f=>all||f.current!==f.original);if(!files.length)return notify(all?'Import files first':'No modified files to export');if(!window.JSZip)return notify('Offline ZIP module unavailable. Reload the application.');
 const report=validateFiles(files);if(report.some(x=>x.level==='error'))return notify('Export blocked: validation errors found. Open Validation for details.');
 try{const zip=new JSZip();for(const f of files)zip.file(f.path,f.current);const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});saveBlob(blob,all?'ZedForge_Full_Configuration.zip':'ZedForge_Modified_Files.zip');notify('ZIP exported: '+files.length+' files')}catch(e){notify('ZIP export failed: '+e.message)}}
$('export-zip').onclick=()=>exportZip(false);$('export-all-zip').onclick=()=>exportZip(true);
$('clear-files').onclick=()=>{if(!state.files.size)return;if(!confirm('Permanently clear the local workspace including imported files and edit history? Export any work first.'))return;state.files.clear();state.selectedFile=null;state.editorIndex=null;state.selectedItems.clear();update();scheduleSave();notify('Workspace cleared')};
function validateFiles(files){const report=[];for(const file of files){
 try{if(/\.xml$/i.test(file.path)){const doc=parseXml(file.current);report.push({level:'ok',message:file.path+': well-formed XML'});
 if(isTypes(file.path)){if(doc.documentElement.localName!=='types'){report.push({level:'error',message:file.path+': root must be <types>'});continue}
 const seen=new Set();let types=0;for(const el of Array.from(doc.documentElement.children).filter(n=>n.localName==='type')){types++;const name=el.getAttribute('name');if(!name)report.push({level:'error',message:file.path+': type has no name'});else if(seen.has(name))report.push({level:'warn',message:file.path+': repeated classname '+name});seen.add(name);
 const values={};for(const tag of ['nominal','min','lifetime','restock']){const node=Array.from(el.children).find(c=>c.localName===tag);if(node){const str=node.textContent.trim();if(!/^\d+$/.test(str))report.push({level:'warn',message:name+': '+tag+' is not a non-negative integer'});else values[tag]=Number(str)}}
 if(values.nominal!==undefined&&values.min!==undefined&&values.min>values.nominal)report.push({level:'warn',message:name+': min exceeds nominal'})}
 report.push({level:'ok',message:file.path+': '+types+' type entries checked'})}
 }else if(/\.json$/i.test(file.path)){JSON.parse(file.current);report.push({level:'ok',message:file.path+': valid JSON'})}
 }catch(e){report.push({level:'error',message:file.path+': '+e.message})}}
 return report}
function renderValidation(){const result=validateFiles([...state.files.values()]);$('validation-count').textContent=result.length+' checks';const root=$('validation-results');root.replaceChildren();if(!result.length){root.innerHTML='<div class="empty">Import files and run validation.</div>';return}
 for(const item of result){const div=document.createElement('div');div.className='validation-line '+item.level;const tag=document.createElement('strong');tag.textContent=item.level==='ok'?'PASS':item.level==='warn'?'WARN':'ERROR';const txt=document.createElement('span');txt.textContent=item.message;div.append(tag,txt);root.append(div)}}
$('run-validation').onclick=()=>{renderValidation();notify('Validation complete')};

/* Single-classname editing: edits exact existing numeric elements only. */
const EDIT_FIELDS=['nominal','min','lifetime','restock','quantmin','quantmax','cost'];
function editorFile(){return state.files.get($('editor-file').value)||null}
function getEditorEntry(){const f=editorFile();if(!f)return null;return scanTypes(f).find(e=>e.index===state.editorIndex)||null}
function renderEditor(){const f=editorFile(),list=$('editor-item');const prev=state.editorIndex;list.replaceChildren();
 if(!f){state.editorIndex=null;$('editor-item-name').textContent='Select an item';$('editor-item-meta').textContent='Import types.xml to begin';for(const tag of EDIT_FIELDS)$('edit-'+tag).value='';return}
 try{const items=scanTypes(f),q=$('editor-search').value.trim().toLowerCase();const visible=items.filter(e=>e.name.toLowerCase().includes(q));
 const fragment=document.createDocumentFragment();for(const item of visible){const opt=new Option(item.name,String(item.index));fragment.append(opt)}list.append(fragment);
 if(prev===null||!visible.some(i=>i.index===prev))state.editorIndex=visible[0]?.index??null;
 if(state.editorIndex!==null)list.value=String(state.editorIndex);
 const entry=items.find(e=>e.index===state.editorIndex);
 $('editor-item-name').textContent=entry?.name||'No matching classnames';
 $('editor-item-meta').textContent=entry?'Categories: '+(entry.categories.join(', ')||'None')+' • Usage: '+(entry.usages.join(', ')||'None')+' • Tiers: '+(entry.tiers.join(', ')||'None'):'No item selected';
 for(const tag of EDIT_FIELDS){const input=$('edit-'+tag);input.disabled=!entry||entry[tag]===null;input.value=entry?.[tag]??''}
 $('undo-item').disabled=!f.history?.length;$('redo-item').disabled=!f.future?.length;
 $('save-item').disabled=!entry;
 }catch(e){$('editor-item-name').textContent='Cannot safely edit file';$('editor-item-meta').textContent=e.message;$('save-item').disabled=true}}
$('editor-file').onchange=()=>{state.editorIndex=null;renderEditor()};
$('editor-search').oninput=()=>{state.editorIndex=null;renderEditor()};
$('editor-item').onchange=()=>{state.editorIndex=Number($('editor-item').value);renderEditor()};
$('save-item').onclick=()=>{try{const f=editorFile(),entry=getEditorEntry();if(!entry)throw new Error('Select an item first');
 const replacements={};
 for(const tag of EDIT_FIELDS){if(entry[tag]===null)continue;const input=$('edit-'+tag);if(!/^-?\d+$/.test(input.value))throw new Error(tag+' must be a whole number');
 const value=Number(input.value),min=tag.startsWith('quant')?-1:0,max=tag.startsWith('quant')?100:tag==='nominal'||tag==='min'?1000000:2147483647;
 if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(tag+' must be between '+min+' and '+max);
 replacements[tag]=value}
 if(replacements.min>replacements.nominal)throw new Error('Minimum cannot exceed nominal');
 if(replacements.quantmin>=0&&replacements.quantmax>=0&&replacements.quantmin>replacements.quantmax)throw new Error('Quantity minimum cannot exceed quantity maximum');
 let index=0,found=false;const next=f.current.replace(new RegExp(TYPE_RE.source,'gi'),block=>{const i=index++;if(i!==entry.index)return block;found=true;for(const [tag,value]of Object.entries(replacements)){if(value!==entry[tag])block=replaceField(block,tag,value)}return block});
 if(!found)throw new Error('Classname not found during edit');
 parseXml(next);if(!setFileCurrent(f,next))return notify('No values changed');
 $('editor-feedback').textContent=entry.name+' saved. Undo and export are available.';notify('Updated '+entry.name);
 }catch(e){$('editor-feedback').textContent=e.message;notify(e.message)}};
$('undo-item').onclick=()=>undoFile(editorFile());
$('redo-item').onclick=()=>redoFile(editorFile());
$('original-item').onclick=()=>restoreOriginal(editorFile());
/* Review original vs current values, and provide history controls per file. */
function getChangeFile(){return state.files.get($('changes-file').value)||null}
function renderChanges(){const list=[...state.files.values()],control=$('changes-file'),prev=control.value;
 control.replaceChildren();if(!list.length)control.add(new Option('No files imported',''));
 for(const f of list)control.add(new Option(f.path+(f.current!==f.original?' • modified':''),f.path));
 if(list.some(f=>f.path===prev))control.value=prev;else if(list.length)control.value=list.find(f=>f.current!==f.original)?.path||list[0].path;
 const f=getChangeFile(),root=$('change-list');root.replaceChildren();$('changes-undo').disabled=!f?.history?.length;$('changes-redo').disabled=!f?.future?.length;
 if(!f||f.current===f.original){$('changes-count').textContent='No changes';root.innerHTML='<div class="empty">This file matches its imported original.</div>';return}
 let rows=[];
 if(isTypes(f.path)){try{const before=scanTypes({path:f.path,current:f.original}),after=scanTypes(f);
 const fields=EDIT_FIELDS;
 for(let i=0;i<after.length;i++){const a=after[i],b=before[i];if(!b||a.name!==b.name)throw new Error('Entry ordering differs');
 const modified=fields.filter(tag=>a[tag]!==b[tag]).map(tag=>tag+': '+b[tag]+' → '+a[tag]);if(modified.length)rows.push({title:a.name,detail:modified.join(' • ')})}
 }catch(e){rows=[{title:'Exact item comparison unavailable',detail:e.message}]}}
 else {const a=f.original.split(/\r?\n/),b=f.current.split(/\r?\n/),len=Math.max(a.length,b.length);
 for(let i=0;i<len;i++)if(a[i]!==b[i]){rows.push({title:'Line '+(i+1),detail:(a[i]??'')+' → '+(b[i]??'')});if(rows.length>=300)break}}
 $('changes-count').textContent=rows.length+' changed '+(isTypes(f.path)?'entries':'lines');
 for(const row of rows.slice(0,300)){const div=document.createElement('div');div.className='change-row';const title=document.createElement('strong');title.textContent=row.title;const detail=document.createElement('code');detail.textContent=row.detail;div.append(title,detail);root.append(div)}
 if(rows.length===0)root.innerHTML='<div class="empty">File changed, but its numeric item fields match. Review the file preview.</div>';
 if(rows.length>300){const extra=document.createElement('div');extra.className='empty';extra.textContent='Showing the first 300 changes';root.append(extra)}}
$('changes-file').onchange=renderChanges;
$('changes-undo').onclick=()=>undoFile(getChangeFile());
$('changes-redo').onclick=()=>redoFile(getChangeFile());
$('changes-export').onclick=()=>exportZip(false);

window.addEventListener('beforeunload',e=>{if(!db&&[...state.files.values()].some(f=>f.current!==f.original)){e.preventDefault();e.returnValue=''}});
if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
update();
initialiseStorage();
