/* ZedForge Map Lab — local map data import, tile manifest and calibration.
 * No world data or proprietary imagery bundled.
 */
(function(root,factory){
 const exports=factory();
 if(typeof module==='object'&&module.exports)module.exports=exports;
 if(root)root.ZedForgeAdvanced=exports;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 const EXTENT=16384,MAX_POINTS=100000;
 const allowedKinds=new Set(['town','city','village','military','airfield','fuel','trader','landmark','medical','water','forest','tree','other']);
 const sanitize=s=>String(s??'').replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,100);
 const valid=n=>Number.isFinite(n)&&n>=0&&n<=EXTENT;
 function parseCSV(text){
   if(typeof text!=='string'||text.length>12*1024*1024)throw Error('Invalid or oversized CSV');
   const rows=[],row=[];let cell='',quoted=false;
   for(let i=0;i<text.length;i++){
     const c=text[i],n=text[i+1];
     if(c==='"'){if(quoted&&n==='"'){cell+='"';i++}else quoted=!quoted}
     else if(c===','&&!quoted){row.push(cell);cell=''}
     else if((c==='\n'||c==='\r')&&!quoted){row.push(cell);cell='';if(row.some(s=>s.trim()))rows.push(row.splice(0));else row.length=0;if(c==='\r'&&n==='\n')i++}
     else cell+=c;
     if(rows.length>MAX_POINTS+1)throw Error('CSV exceeds 100,000 rows');
   }
   if(quoted)throw Error('Unterminated CSV quoted value');
   row.push(cell);if(row.some(s=>s.trim()))rows.push(row);
   if(!rows.length)throw Error('Empty CSV');
   return rows;
 }
 function parsePoints(text,format='csv',fallback='other'){
   const out=[];
   function append(x,z,label,kind){
     const X=Number(x),Z=Number(z);
     if(!valid(X)||!valid(Z)||String(x??'').trim()===''||String(z??'').trim()==='')return;
     const category=sanitize(kind).toLowerCase();
     out.push({x:X,z:Z,name:sanitize(label)||'Unnamed location',kind:allowedKinds.has(category)?category:fallback});
     if(out.length>MAX_POINTS)throw Error('Too many map positions');
   }
   if(format==='csv'){
     const rows=parseCSV(text),head=rows.shift().map(x=>x.trim().replace(/^\uFEFF/,'').toLowerCase().replace(/\s/g,''));
     const col=names=>names.map(name=>head.indexOf(name)).find(v=>v>=0)??-1;
     const ix=col(['x','worldx','easting']),iz=col(['z','worldz','northing']),name=col(['name','label','title']),type=col(['kind','category','type']);
     if(ix<0||iz<0)throw Error('CSV must contain x and z columns');
     for(const row of rows)append(row[ix],row[iz],name>=0?row[name]:'',type>=0?row[type]:fallback);
   }else if(format==='geojson'){
     const input=JSON.parse(text);
     const features=input.type==='FeatureCollection'?input.features:[input];
     if(!Array.isArray(features)||features.length>MAX_POINTS)throw Error('Invalid GeoJSON feature list');
     for(const f of features){
       const geom=f.geometry||f;
       if(geom?.type!=='Point'||!Array.isArray(geom.coordinates)||geom.coordinates.length<2)continue;
       const props=f.properties||{};
       append(geom.coordinates[0],geom.coordinates[1],props.name||props.label,props.kind||props.category||props.type||fallback);
     }
   }else throw Error('Unsupported map layer format');
   if(!out.length)throw Error('No valid X/Z coordinates found');
   return out;
 }
 function groupPoints(points,cell=512){
   const cells=new Map();
   for(let i=0;i<points.length;i++){
     const p=points[i],key=Math.floor(p.x/cell)+','+Math.floor(p.z/cell);
     if(!cells.has(key))cells.set(key,[]);
     cells.get(key).push(i);
   }
   return{points,cell,cells};
 }
 function visiblePoints(index,bounds,limit=1000){
   if(!index||!bounds||!Number.isFinite(bounds.x0)||!Number.isFinite(bounds.x1)||!Number.isFinite(bounds.z0)||!Number.isFinite(bounds.z1))return [];
   if(bounds.x1<bounds.x0||bounds.z1<bounds.z0)return [];
   const found=[],cell=index.cell;
   const a=Math.max(0,Math.floor(bounds.x0/cell)),b=Math.min(Math.floor(EXTENT/cell),Math.floor(bounds.x1/cell));
   const c=Math.max(0,Math.floor(bounds.z0/cell)),d=Math.min(Math.floor(EXTENT/cell),Math.floor(bounds.z1/cell));
   for(let y=c;y<=d;y++)for(let x=a;x<=b;x++){
     const list=index.cells.get(x+','+y)||[];
     for(const i of list){
       const p=index.points[i];
       if(p.x<bounds.x0||p.x>bounds.x1||p.z<bounds.z0||p.z>bounds.z1)continue;
       found.push(p);if(found.length>=limit)return found;
     }
   }
   return found;
 }
 function searchPoints(index,term,limit=40){
   const q=sanitize(term).toLowerCase();
   if(!q||!index)return [];
   return index.points.filter(p=>p.name.toLowerCase().includes(q)||p.kind.includes(q)).slice(0,limit);
 }
 function parseCalibration(text,imageWidth,imageHeight){
   if(!(imageWidth>0&&imageHeight>0))throw Error('Load a calibrated image first');
   const rows=parseCSV(text);
   const header=rows.shift().map(h=>h.trim().toLowerCase());
   const col=(name)=>header.indexOf(name);
   const fields=['x','z','pixelx','pixely'];
   if(fields.some(x=>col(x)<0))throw Error('Expected columns: name,x,z,pixelX,pixelY');
   const validChecks=[];
   for(const row of rows){
     const x=Number(row[col('x')]),z=Number(row[col('z')]),px=Number(row[col('pixelx')]),py=Number(row[col('pixely')]);
     if(![x,z,px,py].every(Number.isFinite)||!valid(x)||!valid(z)||px<0||px>imageWidth||py<0||py>imageHeight)continue;
     validChecks.push({name:sanitize(row[col('name')]),x,z,px,py,dx:x-px/imageWidth*EXTENT,dz:z-(1-py/imageHeight)*EXTENT});
     if(validChecks.length>1000)throw Error('Too many calibration points');
   }
   if(validChecks.length<2)throw Error('At least two valid landmark checks are required');
   const median=values=>{const sorted=values.slice().sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);
     return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2};
   const dx=median(validChecks.map(p=>p.dx)),dz=median(validChecks.map(p=>p.dz));
   const errors=validChecks.map(p=>Math.hypot(p.dx-dx,p.dz-dz));
   const rms=Math.sqrt(errors.reduce((n,v)=>n+v*v,0)/errors.length);
   return{dx,dz,rms,count:validChecks.length,maxError:Math.max(...errors),
     checks:validChecks.map((p,i)=>({name:p.name,error:errors[i]}))};
 }
 function parseTileManifest(text,files){
   const data=typeof text==='string'?JSON.parse(text):text;
   if(data?.format!=='zedforge-tiles-v1'||data.worldSize!==EXTENT||!Array.isArray(data.tiles)||!data.tiles.length||data.tiles.length>1800)
     throw Error('Tile manifest must be zedforge-tiles-v1 for a 16,384-metre world (1–1800 tiles)');
   const unique=new Set();
   const tiles=data.tiles.map((t,i)=>{
     if(!t||typeof t.path!=='string'||!/^[\w./-]+\.(?:png|jpg|jpeg|webp)$/i.test(t.path)||t.path.includes('..')||t.path.startsWith('/'))throw Error('Invalid tile path '+i);
     if(!files.has(t.path))throw Error('Missing tile image '+t.path);
     if(![t.x,t.z,t.width,t.height].every(Number.isFinite)||t.width<=0||t.height<=0||
       t.x<0||t.z<0||t.x+t.width>EXTENT+.001||t.z+t.height>EXTENT+.001)throw Error('Invalid tile extent '+i);
     const level=Number(t.level??0);
     if(!Number.isInteger(level)||level<0||level>12)throw Error('Tile levels must be 0–12');
     const key=level+':'+t.x+':'+t.z+':'+t.width+':'+t.height;
     if(unique.has(key))throw Error('Duplicate tile '+key);unique.add(key);
     return{path:t.path,x:t.x,z:t.z,width:t.width,height:t.height,level};
   });
   return tiles;
 }
 function selectTiles(tiles,bounds,zoom,limit=120){
   if(!tiles?.length)return[];
   const candidates=tiles.filter(t=>t.x<bounds.x1&&t.x+t.width>bounds.x0&&t.z<bounds.z1&&t.z+t.height>bounds.z0);
   const maxLevel=Math.max(...candidates.map(t=>t.level),0);
   const desired=Math.min(maxLevel,Math.max(0,Math.floor(Math.log2(Math.max(1,zoom)))));
   return candidates.filter(t=>t.level<=desired).sort((a,b)=>a.level-b.level).slice(0,limit);
 }
 return{EXTENT,parseCSV,parsePoints,groupPoints,visiblePoints,searchPoints,parseCalibration,parseTileManifest,selectTiles};
});