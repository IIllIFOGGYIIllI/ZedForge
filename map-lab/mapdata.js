/* ZedForge Map Lab: local, offline parsers for documented DVMROAD1 / DVMOBJ1 formats.
 * Formats authored in the independently published DayZ Vehicle Map project.
 * No map assets or remotely sourced data are bundled. */
(function(root,factory){
  const exports=factory();
  if(typeof module==='object'&&module.exports)module.exports=exports;
  if(root)root.ZedForgeMapData=exports;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
  'use strict';
  const EXTENT=16384,GRID=64,CELL=EXTENT/GRID;
  const sig=(dv,bytes)=>bytes.every((n,i)=>dv.getUint8(i)===n);
  const ROADS=[68,86,77,82,79,65,68,49]; // DVMROAD1
  const OBJECTS=[68,86,77,79,66,74,49,0]; // DVMOBJ1\0
  function inWorld(v,margin=0){return Number.isFinite(v)&&v>=-margin&&v<=EXTENT+margin}
  function viewBuffer(input){if(input instanceof ArrayBuffer)return new DataView(input);
    if(ArrayBuffer.isView(input))return new DataView(input.buffer,input.byteOffset,input.byteLength);
    throw new TypeError('Expected an ArrayBuffer')}
  function parseRoads(buffer){
    const dv=viewBuffer(buffer);
    if(dv.byteLength<16||!sig(dv,ROADS))throw Error('Invalid DVMROAD1 road file header');
    const count=dv.getUint32(8,true),size=dv.getFloat32(12,true);
    if(!count||count>1000000||dv.byteLength!==16+count*20||!Number.isFinite(size)||Math.abs(size-EXTENT)>1)
      throw Error('Unsupported road file size, world extent or segment count');
    const values=new Float32Array(count*4),kinds=new Uint8Array(count);
    let asphalt=0,dirt=0;
    for(let i=0;i<count;i++){
      const pos=16+i*20;
      for(let n=0;n<4;n++){const v=dv.getFloat32(pos+n*4,true);if(!inWorld(v,2))throw Error('Road segment '+(i+1)+' outside Nasdara world');values[i*4+n]=v}
      const kind=dv.getUint8(pos+16);
      if(kind>1)throw Error('Unknown road segment type '+kind);
      kinds[i]=kind;if(kind===0)asphalt++;else dirt++;
    }
    return buildRoadIndex({format:'dvmroad1',count,values,kinds,asphalt,dirt});
  }
  function parseGeoJSON(data){
    const shapes=[],featureList=data?.type==='FeatureCollection'?data.features:[data];
    if(!Array.isArray(featureList)||featureList.length>100000)throw Error('Invalid or oversized GeoJSON feature collection');
    let points=0;
    for(const feature of featureList){
      const geometry=feature?.geometry||feature;if(!geometry?.coordinates)continue;
      const lines=geometry.type==='LineString'?[geometry.coordinates]:geometry.type==='MultiLineString'?geometry.coordinates:[];
      if(!Array.isArray(lines))continue;
      for(const line of lines){
        if(!Array.isArray(line)||line.length<2)continue;
        const converted=[];
        for(const point of line){
          if(!Array.isArray(point)||point.length<2||!inWorld(Number(point[0]))||!inWorld(Number(point[1])))throw Error('Road coordinates must use game X/Z metres, not latitude/longitude');
          converted.push([Number(point[0]),Number(point[1])]);
          if(++points>250000)throw Error('Road GeoJSON exceeds 250,000 points');
        }
        shapes.push(converted);
      }
    }
    if(!shapes.length)throw Error('No road LineStrings found in the uploaded GeoJSON');
    const count=shapes.reduce((s,a)=>s+a.length-1,0),values=new Float32Array(count*4),kinds=new Uint8Array(count);
    let i=0;for(const shape of shapes)for(let p=1;p<shape.length;p++){values.set([shape[p-1][0],shape[p-1][1],shape[p][0],shape[p][1]],i*4);i++}
    return buildRoadIndex({format:'geojson',count,values,kinds,asphalt:count,dirt:0});
  }
  /* Spatially index road segments at import time. This prevents scanning ~47K
   * segments on every pan and zoom, which previously caused redraw flicker. */
  function buildRoadIndex(layer){
    const grid=Array.from({length:GRID*GRID},()=>[]),d=layer.values;
    let links=0;
    for(let i=0;i<layer.count;i++){
      const k=i*4,x0=Math.min(d[k],d[k+2]),x1=Math.max(d[k],d[k+2]),
        z0=Math.min(d[k+1],d[k+3]),z1=Math.max(d[k+1],d[k+3]);
      if(x1<0||z1<0||x0>EXTENT||z0>EXTENT)continue;
      const a=Math.max(0,Math.min(GRID-1,Math.floor(x0/CELL))),
        b=Math.max(0,Math.min(GRID-1,Math.floor(x1/CELL))),
        c=Math.max(0,Math.min(GRID-1,Math.floor(z0/CELL))),
        e=Math.max(0,Math.min(GRID-1,Math.floor(z1/CELL)));
      for(let y=c;y<=e;y++)for(let x=a;x<=b;x++){
        grid[y*GRID+x].push(i);
        if(++links>3000000)throw Error('Road file has unexpectedly complex spatial coverage');
      }
    }
    layer.grid=grid;layer.gridLinks=links;
    layer.baseCount=layer.count;
    const joins=repairRoadJunctions(layer);
    if(joins.length){
      const coordinates=new Float32Array(layer.values.length+joins.length*4),
        kinds=new Uint8Array(layer.kinds.length+joins.length);
      coordinates.set(layer.values);kinds.set(layer.kinds);
      for(let j=0;j<joins.length;j++){
        const p=joins[j],index=layer.count+j;
        coordinates.set(p.slice(0,4),index*4);kinds[index]=p[4];
        const a=Math.max(0,Math.min(63,Math.floor(Math.min(p[0],p[2])/CELL))),
          b=Math.max(0,Math.min(63,Math.floor(Math.max(p[0],p[2])/CELL))),
          c=Math.max(0,Math.min(63,Math.floor(Math.min(p[1],p[3])/CELL))),
          d=Math.max(0,Math.min(63,Math.floor(Math.max(p[1],p[3])/CELL)));
        for(let y=c;y<=d;y++)for(let x=a;x<=b;x++)grid[y*GRID+x].push(index);
      }
      layer.values=coordinates;layer.kinds=kinds;
    }
    layer.drawCount=layer.count+joins.length;
    layer.repairedJoins=joins.length;
    return layer;
  }
  /* Only bridge unambiguous same-class endpoints which face each other.
   * Original road geometry is untouched; links live in the render layer. */
  function repairRoadJunctions(layer,{maxGap=6.5,minGap=.25,alignment=.6}={}){
    if(!layer?.count)return[];
    const data=layer.values,types=layer.kinds,cell=8,ends=[],bins=new Map();
    const bin=(x,z,type)=>type+':'+x+':'+z;
    for(let i=0;i<layer.count;i++){
      const p=i*4,x=data[p],z=data[p+1],ex=data[p+2],ez=data[p+3],
        dx=ex-x,dz=ez-z,len=Math.hypot(dx,dz);
      if(len<1)continue;
      for(let n=0;n<2;n++){
        const px=n?ex:x,pz=n?ez:z;
        const end={x:px,z:pz,ux:(n?dx:-dx)/len,uz:(n?dz:-dz)/len,kind:types[i],segment:i};
        const index=ends.length;ends.push(end);
        const key=bin(Math.floor(px/cell),Math.floor(pz/cell),end.kind);
        if(!bins.has(key))bins.set(key,[]);
        bins.get(key).push(index);
      }
    }
    const preferred=new Int32Array(ends.length).fill(-1);
    for(let i=0;i<ends.length;i++){
      const a=ends[i],ix=Math.floor(a.x/cell),iz=Math.floor(a.z/cell);
      let best=-1,score=Infinity,runnerUp=Infinity;
      for(let ox=-1;ox<=1;ox++)for(let oz=-1;oz<=1;oz++){
        const near=bins.get(bin(ix+ox,iz+oz,a.kind));
        if(!near)continue;
        for(const j of near){
          const b=ends[j];if(i===j||a.segment===b.segment)continue;
          const x=b.x-a.x,z=b.z-a.z,d=Math.hypot(x,z);
          if(d<=minGap||d>maxGap)continue;
          const forward=(a.ux*x+a.uz*z)/d;
          const backward=-(b.ux*x+b.uz*z)/d;
          if(forward<alignment||backward<alignment)continue;
          const candidate=d+(2-forward-backward)*2;
          if(candidate<score){runnerUp=score;score=candidate;best=j}
          else if(candidate<runnerUp)runnerUp=candidate;
        }
      }
      if(best>=0&&runnerUp-score>0.75)preferred[i]=best;
    }
    const joins=[];
    for(let i=0;i<ends.length;i++){
      const j=preferred[i];if(j<=i||preferred[j]!==i)continue;
      const a=ends[i],b=ends[j];
      joins.push([a.x,a.z,b.x,b.z,a.kind]);
    }
    return joins;
  }

  function collectRoadSegments(layer,bounds,limit=1000000){
    if(!layer||!bounds||bounds.x0>EXTENT||bounds.z0>EXTENT||
      bounds.x1<0||bounds.z1<0||bounds.x0>bounds.x1||bounds.z0>bounds.z1)return[];
    const startX=Math.max(0,Math.min(63,Math.floor(bounds.x0/CELL))),
      endX=Math.max(0,Math.min(63,Math.floor(bounds.x1/CELL))),
      startZ=Math.max(0,Math.min(63,Math.floor(bounds.z0/CELL))),
      endZ=Math.max(0,Math.min(63,Math.floor(bounds.z1/CELL)));
    const visited=new Set(),found=[],v=layer.values;
    for(let z=startZ;z<=endZ;z++)for(let x=startX;x<=endX;x++){
      for(const i of layer.grid[z*GRID+x]){
        if(visited.has(i))continue;visited.add(i);
        const k=i*4;
        if(Math.max(v[k],v[k+2])<bounds.x0||Math.min(v[k],v[k+2])>bounds.x1||
           Math.max(v[k+1],v[k+3])<bounds.z0||Math.min(v[k+1],v[k+3])>bounds.z1)continue;
        found.push(i);if(found.length>=limit)return found;
      }
    }
    return found;
  }
  /* Same road strokes for cached overview and live close-up vectors.
   * The renderer never clears the destination canvas, allowing offscreen
   * layers to be composed as finished frames instead of displayed mid-draw. */
  /* Paint outlines for all road classes, then centres for all classes.
   * Rounded ends and repaired short gaps remove seams at junctions. */
  function paintRoadSegments(ctx,layer,indices,project,{
    asphalt=true,dirt=true,overview=false,opacity=1
  }={}){
    if(!layer||!indices?.length)return 0;
    const v=layer.values,kinds=layer.kinds;
    const styles=[
      {kind:1,enabled:dirt,outer:'#494238',inner:'#e4d4b4',
        outerWidth:overview?1.30:2.30,innerWidth:overview?0.70:1.30},
      {kind:0,enabled:asphalt,outer:'#3c3b33',inner:'#fff0d1',
        outerWidth:overview?1.75:3.25,innerWidth:overview?1.00:2.00}
    ];
    ctx.save();ctx.globalAlpha=opacity;ctx.lineJoin='round';ctx.lineCap='round';
    for(const phase of ['outer','inner']){
      for(const style of styles){
        if(!style.enabled)continue;
        ctx.beginPath();let amount=0;
        for(const i of indices){
          if(kinds[i]!==style.kind)continue;
          const k=i*4,a=project(v[k],v[k+1]),b=project(v[k+2],v[k+3]);
          ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);amount++;
        }
        if(!amount)continue;
        ctx.strokeStyle=style[phase];ctx.lineWidth=phase==='outer'?style.outerWidth:style.innerWidth;
        ctx.stroke();
      }
    }
    ctx.restore();
    return indices.reduce((n,i)=>n+((kinds[i]===0&&asphalt)||(kinds[i]===1&&dirt)?1:0),0);
  }

  function parseObjects(input){
    const dv=viewBuffer(input);
    if(dv.byteLength<28||!sig(dv,OBJECTS))throw Error('Invalid DVMOBJ1 structure file header');
    const size=dv.getFloat32(8,true),classCount=dv.getUint32(12,true),count=dv.getUint32(16,true),
      ringCount=dv.getUint32(20,true),pointCount=dv.getUint32(24,true);
    if(!Number.isFinite(size)||Math.abs(size-EXTENT)>.01||!classCount||classCount>8192||
       !count||count>2000000||!ringCount||ringCount>200000||!pointCount||pointCount>4000000)
      throw Error('Unsupported Nasdara structure counts or world calibration');
    const modelOffset=28,ringsOffset=modelOffset+classCount*60,pointsOffset=ringsOffset+ringCount*8,
      placementsOffset=pointsOffset+pointCount*8,expected=placementsOffset+count*20;
    if(expected!==dv.byteLength)throw Error('Incomplete DVMOBJ1 data; unexpected file length');
    const rings=new Uint32Array(ringCount*2),points=new Float32Array(pointCount*2),models=new Array(classCount);
    for(let i=0;i<ringCount;i++){rings[i*2]=dv.getUint32(ringsOffset+i*8,true);rings[i*2+1]=dv.getUint32(ringsOffset+i*8+4,true);
      if(rings[i*2+1]<3||rings[i*2]>pointCount||rings[i*2+1]>pointCount-rings[i*2])throw Error('Invalid structure ring '+i)}
    for(let i=0;i<pointCount*2;i++){const v=dv.getFloat32(pointsOffset+i*4,true);if(!Number.isFinite(v)||Math.abs(v)>10000)throw Error('Invalid structure outline point');points[i]=v}
    for(let i=0;i<classCount;i++){
      const b=modelOffset+i*60,first=dv.getUint32(b,true),length=dv.getUint32(b+4,true),
        flags=dv.getUint32(b+8,true),width=dv.getUint32(b+12,true),height=dv.getUint32(b+16,true);
      if(!length||first>ringCount||length>ringCount-first||flags>7||width>4096||height>4096)throw Error('Invalid building model '+i);
      const matrix=new Float32Array(6),bounds=new Float32Array(4);
      for(let t=0;t<6;t++){matrix[t]=dv.getFloat32(b+20+t*4,true);if(!Number.isFinite(matrix[t])||Math.abs(matrix[t])>10000)throw Error('Invalid model affine transform')}
      for(let t=0;t<4;t++){bounds[t]=dv.getFloat32(b+44+t*4,true);if(!Number.isFinite(bounds[t])||Math.abs(bounds[t])>10000)throw Error('Invalid model bounds')}
      if(bounds[0]>bounds[2]||bounds[1]>bounds[3])throw Error('Inverted structure footprint');
      models[i]={first,length,flags,width,height,matrix,bounds,path:null};
    }
    const placements=new Array(count),grid=Array.from({length:GRID*GRID},()=>[]),coordinates=new Float32Array(count*4);
    let gridLinks=0;
    for(let i=0;i<count;i++){
      const b=placementsOffset+i*20,model=dv.getUint32(b,true),x=dv.getFloat32(b+4,true),
      z=dv.getFloat32(b+8,true),degrees=dv.getFloat32(b+12,true),scale=dv.getFloat32(b+16,true);
      if(model>=classCount||!inWorld(x,512)||!inWorld(z,512)||!Number.isFinite(degrees)||Math.abs(degrees)>36000||
        !Number.isFinite(scale)||scale<=0||scale>100)throw Error('Invalid structure placement '+i);
      const radians=degrees*Math.PI/180,cos=Math.cos(radians)*scale,sin=Math.sin(radians)*scale,
        m=models[model].bounds;
      let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
      for(const px of [m[0],m[2]])for(const pz of [m[1],m[3]]){
        const xx=x+cos*px-sin*pz,zz=z+sin*px+cos*pz;
        x0=Math.min(x0,xx);x1=Math.max(x1,xx);z0=Math.min(z0,zz);z1=Math.max(z1,zz)
      }
      coordinates.set([x,z,cos,sin],i*4);
      placements[i]={model,x0,x1,z0,z1};
      const gx0=Math.max(0,Math.min(63,Math.floor(x0/CELL))),gx1=Math.max(0,Math.min(63,Math.floor(x1/CELL))),
        gz0=Math.max(0,Math.min(63,Math.floor(z0/CELL))),gz1=Math.max(0,Math.min(63,Math.floor(z1/CELL)));
      if(x1<0||x0>EXTENT||z1<0||z0>EXTENT)continue;
      for(let gz=gz0;gz<=gz1;gz++)for(let gx=gx0;gx<=gx1;gx++){grid[gz*GRID+gx].push(i);if(++gridLinks>5000000)throw Error('Structure file contains too many oversized footprints')}
    }
    return{format:'dvmobj1',count,modelCount:classCount,models,rings,points,placements,coordinates,grid,gridLinks,worldSize:EXTENT};
  }
  function collectVisible(layer,bounds,max=8000){
    if(!layer||!bounds)return[];
    const gx0=Math.max(0,Math.min(63,Math.floor(bounds.x0/CELL))),gx1=Math.max(0,Math.min(63,Math.floor(bounds.x1/CELL))),
      gz0=Math.max(0,Math.min(63,Math.floor(bounds.z0/CELL))),gz1=Math.max(0,Math.min(63,Math.floor(bounds.z1/CELL))),
      seen=new Set(),results=[];
    if(bounds.x0>EXTENT||bounds.z0>EXTENT||bounds.x1<0||bounds.z1<0)return results;
    for(let z=gz0;z<=gz1;z++)for(let x=gx0;x<=gx1;x++)for(const index of layer.grid[z*GRID+x]){
      if(seen.has(index))continue;seen.add(index);
      const v=layer.placements[index];
      if(v.x1<bounds.x0||v.x0>bounds.x1||v.z1<bounds.z0||v.z0>bounds.z1)continue;
      results.push(index);
      if(results.length>=max)return results;
    }
    return results;
  }
  function footprintPath(layer,model){
    if(model.path)return model.path;
    if(typeof Path2D==='undefined')return null;
    const path=new Path2D(),rings=layer.rings,points=layer.points;
    for(let r=model.first;r<model.first+model.length;r++){
      const first=rings[r*2],count=rings[r*2+1];
      for(let j=0;j<count;j++){const u=points[(first+j)*2],v=points[(first+j)*2+1];if(j===0)path.moveTo(u,v);else path.lineTo(u,v)}
      path.closePath()
    }
    model.path=path;return path;
  }
  /*
   * Stable structure rendering can be divided across animation frames.
   * Paints only to the caller's private back buffer; callers swap buffers
   * after the entire job completes. Sorting indices guarantees the same
   * object stacking order even when spatial-cell traversal changes.
   */
  function createStructureJob(ctx,layer,{
    camera,width,height,projection,max=14000,opacity=.95,
    showWrecks=true,pictureFor=null,requestPicture=null
  }={}){
    if(!layer||camera.zoom<3.8)return{
      total:0,step:()=>({done:true,drawn:0,visible:0,pictures:0}),cancel(){}
    };
    const p=projection,
      b0=p.fromScreen(0,height,camera,width,height),
      b1=p.fromScreen(width,0,camera,width,height),
      visible=collectVisible(layer,{x0:b0.x,z0:b0.z,x1:b1.x,z1:b1.z},max).sort((a,b)=>a-b),
      metersPerPixel=1/p.scale(camera,width,height);
    let cursor=0,drawn=0,pictures=0,closed=false;
    ctx.save();ctx.globalAlpha=opacity;ctx.lineJoin='round';
    function finish(){
      if(!closed){closed=true;ctx.restore()}
      return{done:true,drawn,visible:visible.length,pictures};
    }
    function step(batch=180){
      if(closed)return{done:true,drawn,visible:visible.length,pictures};
      const maxCount=Math.max(1,Math.min(2000,Number.isFinite(batch)?batch:2000));
      const to=Math.min(visible.length,cursor+maxCount);
      while(cursor<to){
        const index=visible[cursor++],item=layer.placements[index],model=layer.models[item.model],
          spread=Math.max(item.x1-item.x0,item.z1-item.z0);
        if(model.flags&2 && camera.zoom<6)continue;
        if(spread/metersPerPixel<1.5)continue;
        if(!showWrecks&&model.flags&1)continue;
        const shape=footprintPath(layer,model);if(!shape)continue;
        const a=layer.coordinates[index*4],b=layer.coordinates[index*4+1],
          co=layer.coordinates[index*4+2],si=layer.coordinates[index*4+3],
          loc=p.toScreen(a,b,camera,width,height),s=p.scale(camera,width,height);
        ctx.save();
        ctx.transform(co*s,-si*s,-si*s,-co*s,loc.x,loc.y);
        ctx.fillStyle=model.flags&1?'#8d614d':'#525e5c';
        ctx.strokeStyle='#1b2728';
        ctx.lineWidth=Math.max(.5,1/(s*Math.hypot(co,si)));
        const hasPicture=(model.flags&4)!==0&&model.width>0&&model.height>0&&camera.zoom>=5.5;
        const photo=hasPicture&&pictureFor?pictureFor(item.model):null;
        if(photo){
          const t=model.matrix;
          ctx.save();ctx.transform(t[0],t[1],t[2],t[3],t[4],t[5]);
          ctx.drawImage(photo,0,0,model.width,model.height);
          ctx.restore();ctx.stroke(shape);pictures++;
        }else{
          ctx.fill(shape);ctx.stroke(shape);
          if(hasPicture&&requestPicture)requestPicture(item.model);
        }
        ctx.restore();drawn++;
      }
      if(cursor>=visible.length)return finish();
      return{done:false,drawn,visible:visible.length,pictures};
    }
    return{total:visible.length,step,cancel:()=>finish()};
  }
  function renderStructures(ctx,layer,options){
    const job=createStructureJob(ctx,layer,options);
    let status;
    do{status=job.step(2000)}while(!status.done);
    return status;
  }
  return{EXTENT,parseRoads,parseGeoJSON,parseObjects,collectVisible,renderStructures,createStructureJob,buildRoadIndex,collectRoadSegments,repairRoadJunctions,paintRoadSegments};
});