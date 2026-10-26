/* Nasdara map coordinate provenance: no claimed accuracy beyond source data. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ZedForgeAccuracy=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
  'use strict';
  const EXTENT=16384,GRID_METRES=100;
  function gridBounds(point){
    if(!point||point.approximate!==true||typeof point.grid!=='string')return null;
    const match=/^(\d{3})\s+(\d{3})$/.exec(point.grid);
    if(!match)return null;
    const east=Number(match[1]),south=Number(match[2]);
    const x0=east*GRID_METRES,x1=x0+GRID_METRES;
    const z1=EXTENT-south*GRID_METRES,z0=z1-GRID_METRES;
    if(x0<0||z0<0||x1>EXTENT||z1>EXTENT)return null;
    if(Math.abs(point.x-(x0+50))>.001||Math.abs(point.z-(z0+50))>.001)return null;
    return Object.freeze({x0,x1,z0,z1,metres:GRID_METRES});
  }
  function provenance(point){
    if(point?.approximate===true)return Object.freeze({
      key:'grid-approximate',label:'Approximate 100 m grid square',
      detail:'Position is the centre of a published 100 m map square (±50 m on X and Z), not an exact entrance.'
    });
    if(point?.permanent===true)return Object.freeze({
      key:'official-structure',label:'Official mission building coordinate',
      detail:'Exact structure position in the source mission; this does not guarantee an operational facility.'
    });
    return Object.freeze({
      key:'user-supplied',label:'User-supplied X/Z (not independently verified)',
      detail:'Imported world coordinates have not been checked against a surveyed landmark.'
    });
  }
  function coverage(places=[],facilities=[]){
    const all=[...places,...facilities],counts={total:all.length,grid:0,official:0,user:0};
    for(const p of all){
      const key=provenance(p).key;
      if(key==='grid-approximate')counts.grid++;
      else if(key==='official-structure')counts.official++;
      else counts.user++;
    }
    return Object.freeze(counts);
  }
  function csvAudit(places=[],facilities=[]){
    // Excel/Sheets formula injection is disallowed even for imported labels.
    const csv=value=>{
      let s=String(value??'');
      if(/^\s*[=+@-]/.test(s))s="'"+s;
      return '"'+s.replaceAll('"','""')+'"';
    };
    const cols=['name','x','z','position_type','source','grid_square','structure_model','accuracy_note'];
    const rows=[cols.map(csv).join(',')];
    for(const p of [...places,...facilities]){
      const prov=provenance(p);
      rows.push([p.name,p.x,p.z,prov.key,p.source||'user-import',p.grid||'',p.model||'',prov.detail].map(csv).join(','));
    }
    return rows.join('\r\n')+'\r\n';
  }
  return Object.freeze({EXTENT,GRID_METRES,gridBounds,provenance,coverage,csvAudit});
});
