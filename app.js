'use strict';
/* ZedForge v0.1.0 alpha. Browser-only editing; never uploads user files to a server. */
const $ = id => document.getElementById(id);
const state = { files:new Map(), selectedFile:null, selectedItems:new Set(), pending:null, view:'dashboard' };
const MAX_ARCHIVE = 40 * 1024 * 1024;
const MAX_FILE = 8 * 1024 * 1024;
const MAX_ENTRIES = 500;
const TYPE_RE = /<type\b[^>]*\bname\s*=\s*(["'])([^"']+)\1[^>]*>[\s\S]*?<\/type\s*>/gi;
const labels={dashboard:'Overview',files:'File Manager',booster:'Loot Booster',validation:'Validation'};
const enc=new TextEncoder();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastTimer;
function notify(message){const node=$('toast');node.textContent=message;node.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.style.display='none',4500)}
function show(view){state.view=view;Object.keys(labels).forEach(key=>{$('view-'+key).classList.toggle('hidden',key!==view);document.querySelector('[data-view="'+key+'"]').classList.toggle('active',key===view)});$('page-crumb').textContent=labels[view];$('sidebar').classList.remove('open');if(view==='validation')renderValidation()}
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
 state.files.set(path,{path,original:content,current:content});return true}
async function importFiles(fileList){const files=Array.from(fileList||[]);let count=0,issues=[];
 for(const file of files){try{
 if(/\.zip$/i.test(file.name)){if(file.size>MAX_ARCHIVE)throw new Error('ZIP exceeds 40 MB');if(!window.JSZip)throw new Error('ZIP library unavailable. Check your connection and reload.');
 const zip=await JSZip.loadAsync(file);const entries=Object.values(zip.files).filter(e=>!e.dir&&supported(e.name));if(entries.length>MAX_ENTRIES)throw new Error('ZIP contains too many configuration files');for(const entry of entries){try{const content=await entry.async('string');if(ingest(entry.name,content))count++}catch(e){issues.push(entry.name+': '+e.message)}}}
 else if(supported(file.name)){if(file.size>MAX_FILE)throw new Error('File exceeds 8 MB');if(ingest(file.name,await file.text()))count++}
 else issues.push(file.name+': unsupported extension');
 }catch(e){issues.push(file.name+': '+e.message)}}
 state.selectedItems.clear();update();if(count){notify('Imported '+count+' configuration file'+(count===1?'':'s'));show('files')}
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
function scanTypes(file){if(!file||!isTypes(file.path))return [];const doc=parseXml(file.current);if(doc.documentElement.localName!=='types')throw new Error('Expected <types> root element');
 const xmlItems=Array.from(doc.documentElement.children).filter(node=>node.localName==='type');
 const matches=Array.from(file.current.matchAll(new RegExp(TYPE_RE.source,'gi')));
 if(matches.length!==xmlItems.length)throw new Error('Unable to safely map XML entries without changing formatting');
 return xmlItems.map((element,index)=>{const name=element.getAttribute('name')||'';
 if(name!==matches[index][2])throw new Error('XML item ordering mismatch; boost safely aborted');
 const numeric=tag=>{const child=Array.from(element.children).find(e=>e.localName===tag);if(!child)return null;const n=child.textContent.trim();return /^\d+$/.test(n)?Number(n):null};
 return {index,name,nominal:numeric('nominal'),min:numeric('min'),category:categorise(element,name),block:matches[index][0]};});
}
function categorise(node,name){const tags=Array.from(node.children).filter(e=>e.localName==='category').map(e=>(e.getAttribute('name')||'').toLowerCase()).join(' ');
 const n=name.toLowerCase();
 if(/ammo|magazine|_mag|bullet|round|cartridge/.test(n)||/ammo/.test(tags))return'ammo';
 if(/food|drinks|fruit|mushroom|meat|can|soda|waterbottle|rice|cereal/.test(tags+' '+n)&&!/candycane_light/.test(n))return'food';
 if(/medical|bandage|tetracycline|vitamin|saline|morphine|epi(n)ephrine|bloodbag|antibiotic/.test(tags+' '+n))return'medical';
 if(/tools|materials|woodenplank|metalwire|nailbox|nails|fencekit|watchtowerkit|sheetmetal|woodenlog/.test(tags+' '+n))return'building';
 if(/clothes|clothing|jacket|pants|boots|helmet|vest|shirt|gloves|backpack/.test(tags+' '+n))return'clothing';
 if(/vehiclesparts|sparkplug|radiator|carbattery|truckbattery|wheel|headlight/.test(tags+' '+n))return'vehicles';
 if(/weapons|rifle|pistol|shotgun|smg|ak[0-9]|m4a1|mosin|sks|svd/.test(tags+' '+n))return'weapons';
 return'other'}
function getEconomy(){const path=$('economy-file').value;return state.files.get(path)||null}
function update(){const list=[...state.files.values()];$('stat-files').textContent=list.length;
 $('stat-changed').textContent=list.filter(f=>f.original!==f.current).length;
 $('file-count-label').textContent=list.length+' file'+(list.length===1?'':'s');
 const previous=$('economy-file').value;$('economy-file').replaceChildren();const candidates=list.filter(f=>isTypes(f.path));
 if(!candidates.length)$('economy-file').add(new Option('Import types.xml first',''));
 for(const f of candidates)$('economy-file').add(new Option(f.path,f.path));
 if(candidates.some(f=>f.path===previous))$('economy-file').value=previous;
 else if(candidates.length)$('economy-file').value=candidates[0].path;
 let total=0;for(const f of candidates)try{total+=scanTypes(f).length}catch(e){}
 $('stat-items').textContent=total.toLocaleString();
 if(!state.selectedFile||!state.files.has(state.selectedFile))state.selectedFile=list[0]?.path||null;
 renderFiles();renderItems();renderValidation();
}
function renderFiles(){const rows=[...state.files.values()];const body=$('files-body');body.replaceChildren();if(!rows.length){body.innerHTML='<tr><td colspan="4" class="empty">No files imported yet.</td></tr>';renderFilePreview();return}
 for(const file of rows){const tr=document.createElement('tr');const name=document.createElement('td');name.className='filename';name.textContent=file.path;
 const type=document.createElement('td');type.textContent=basename(file.path).split('.').pop().toUpperCase();
 const status=document.createElement('td');const changed=file.original!==file.current;status.innerHTML='<span class="status '+(changed?'modified':'')+'">'+(changed?'● Modified':'✓ Original')+'</span>';
 const actions=document.createElement('td');actions.className='inline-actions';for(const [label,action] of [['Preview',()=>{state.selectedFile=file.path;renderFilePreview()}],['Download',()=>downloadText(file.path,file.current)],['Revert',()=>{if(!changed)return;if(confirm('Restore the original version of '+file.path+'?')){file.current=file.original;state.selectedItems.clear();update()}}]]){const button=document.createElement('button');button.textContent=label;button.disabled=label==='Revert'&&!changed;button.onclick=action;actions.append(button)}tr.append(name,type,status,actions);body.append(tr)}
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
function multiply(value,factor,includeZero){if(value===null)return null;if(value===0&&!includeZero)return 0;return Math.min(1000000,Math.max(value===0?0:1,Math.round(value*factor)))}
function makeBoost(){const file=getEconomy();if(!file)throw new Error('Import types.xml first');const items=scanTypes(file),visible=filteredItems(items),factor=Number($('multiplier').value),mode=$('field-mode').value,includeZero=$('include-zero').checked,selectedOnly=$('selected-only').checked;
 if(selectedOnly&&!state.selectedItems.size)throw new Error('Select one or more items first');
 const candidates=selectedOnly?items.filter(i=>state.selectedItems.has(i.index)):visible;const changes=[];
 for(const item of candidates){if(item.nominal===null||item.min===null)continue;
 const newN=mode==='min'?item.nominal:multiply(item.nominal,factor,includeZero);
 const newM=mode==='nominal'?item.min:multiply(item.min,factor,includeZero);
 if(newM>newN)continue; // Never silently rewrite another field or create an invalid nominal/minimum pair.
 if(newN!==item.nominal||newM!==item.min)changes.push({...item,newN,newM})}
 return {file,changes,considered:candidates.length}}
function fmtDiff(a,b){return a===b?String(a):a+' → '+b}
$('preview-boost').onclick=()=>{try{const plan=makeBoost();if(!plan.changes.length)throw new Error('No eligible changes. Check filters, values, and selection.');state.pending=plan;$('dialog-summary').textContent=plan.changes.length+' of '+plan.considered+' eligible/filtered entries will change. Entries with missing numeric fields or invalid resulting minimums are skipped.';
 const body=$('diff-body');body.replaceChildren();for(const item of plan.changes.slice(0,100)){const tr=document.createElement('tr');for(const value of [item.name,fmtDiff(item.nominal,item.newN),fmtDiff(item.min,item.newM)]){const td=document.createElement('td');td.textContent=value;tr.append(td)}body.append(tr)}if(plan.changes.length>100){const tr=document.createElement('tr');tr.innerHTML='<td colspan="3">Additional changes omitted from this preview table.</td>';body.append(tr)}$('boost-dialog').showModal()}catch(e){$('boost-feedback').textContent=e.message;notify(e.message)}};
$('cancel-boost').onclick=()=>{$('boost-dialog').close();state.pending=null};
$('boost-dialog').addEventListener('close',()=>state.pending=null);
function replaceField(block,tag,value){const pattern=new RegExp('(<'+tag+'\\b[^>]*>)(\\s*)(\\d+)(\\s*)(<\\/'+tag+'\\s*>)','i');return block.replace(pattern,(_,open,ws,num,tail,close)=>open+ws+String(value)+tail+close)}
$('apply-boost').onclick=()=>{const plan=state.pending;if(!plan)return;try{const replacements=new Map(plan.changes.map(c=>[c.index,c]));let ix=0;const output=plan.file.current.replace(new RegExp(TYPE_RE.source,'gi'),block=>{const item=replacements.get(ix++);if(!item)return block;return replaceField(replaceField(block,'nominal',item.newN),'min',item.newM)});
 parseXml(output);plan.file.current=output;$('boost-dialog').close();state.pending=null;update();$('boost-feedback').textContent='Applied '+plan.changes.length+' changes. Review the files and export when ready.';notify('Updated '+plan.changes.length+' economy entries.')}catch(e){notify('Boost failed: '+e.message)}};
$('reset-economy').onclick=()=>{const file=getEconomy();if(!file)return;if(file.current===file.original)return notify('This file is already at its original version');if(confirm('Revert all changes to '+file.path+'?')){file.current=file.original;state.selectedItems.clear();update();notify('Original restored')}};
function downloadText(name,content){const blob=new Blob([content],{type:/\.json$/i.test(name)?'application/json':'application/xml'});saveBlob(blob,basename(name))}
function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
$('download-economy').onclick=()=>{const f=getEconomy();if(!f)return notify('No types.xml file selected');try{parseXml(f.current);downloadText(f.path,f.current)}catch(e){notify(e.message)}};
async function exportZip(all){const files=[...state.files.values()].filter(f=>all||f.current!==f.original);if(!files.length)return notify(all?'Import files first':'No modified files to export');if(!window.JSZip)return notify('ZIP library unavailable; connect to the internet and reload');
 const report=validateFiles(files);if(report.some(x=>x.level==='error'))return notify('Export blocked: validation errors found. Open Validation for details.');
 try{const zip=new JSZip();for(const f of files)zip.file(f.path,f.current);const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});saveBlob(blob,all?'ZedForge_Full_Configuration.zip':'ZedForge_Modified_Files.zip');notify('ZIP exported: '+files.length+' files')}catch(e){notify('ZIP export failed: '+e.message)}}
$('export-zip').onclick=()=>exportZip(false);$('export-all-zip').onclick=()=>exportZip(true);
$('clear-files').onclick=()=>{if(!state.files.size)return;if(!confirm('Clear all imported files and edits from this browser session?'))return;state.files.clear();state.selectedFile=null;state.selectedItems.clear();update();notify('Workspace cleared')};
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
window.addEventListener('beforeunload',e=>{if([...state.files.values()].some(f=>f.current!==f.original)){e.preventDefault();e.returnValue=''}});
if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
update();
