/* ZedForge event-spawn engine: targeted updates to existing DayZ XML positions. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ZedForgeSpawnEngine=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const EVENT=/<event\b[^>]*\bname\s*=\s*(["'])([^"']+)\1[^>]*>[\s\S]*?<\/event\s*>/gi;
  const POS=/<pos\b[^>]*\/>/gi;
  const COORD_LIMIT=16384;
  function attr(tag,key){
    const match=new RegExp('\\b'+key+'\\s*=\\s*(["\\\'])([^"\\\']*)\\1','i').exec(tag);
    return match?match[2]:null;
  }
  function number(value,label){
    if(value===null||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))
      throw Error('Invalid or missing '+label+' on event position');
    const n=Number(value);
    if(!Number.isFinite(n))throw Error('Invalid '+label+' coordinate');
    return n;
  }
  function parse(source,validateXml){
    if(typeof source!=='string'||typeof validateXml!=='function')throw Error('A valid XML document is required');
    const doc=validateXml(source);
    if(doc.documentElement?.localName!=='eventposdef')
      throw Error('Expected <eventposdef> in cfgeventspawns.xml');
    const xmlEvents=Array.from(doc.documentElement.children).filter(e=>e.localName==='event');
    const blocks=[...source.matchAll(new RegExp(EVENT.source,'gi'))];
    if(blocks.length!==xmlEvents.length)throw Error('Unsupported event XML layout; positions were not changed');
    const events=[],entries=[];
    for(let ei=0;ei<blocks.length;ei++){
      const block=blocks[ei],node=xmlEvents[ei],name=block[2];
      if(!name||node.getAttribute('name')!==name)throw Error('Event order or name mismatch; no changes made');
      const tags=[...block[0].matchAll(new RegExp(POS.source,'gi'))];
      const nodes=Array.from(node.children).filter(e=>e.localName==='pos');
      if(tags.length!==nodes.length)throw Error(name+': unsupported position tag format');
      events.push({name,index:ei,count:tags.length});
      for(let pi=0;pi<tags.length;pi++){
        const tag=tags[pi][0],pos=nodes[pi],xRaw=attr(tag,'x'),zRaw=attr(tag,'z'),aRaw=attr(tag,'a');
        if(xRaw!==pos.getAttribute('x')||zRaw!==pos.getAttribute('z')||aRaw!==pos.getAttribute('a'))
          throw Error(name+': position attribute mismatch');
        const x=number(xRaw,name+' X'),z=number(zRaw,name+' Z');
        const a=aRaw===null?null:number(aRaw,name+' orientation');
        entries.push({eventIndex:ei,positionIndex:pi,name,x,z,a});
      }
    }
    return {events,entries};
  }
  function validNumber(value,label,min,max){
    const raw=String(value).trim();
    if(!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw))throw Error(label+' must be a number');
    const n=Number(raw);
    if(!Number.isFinite(n)||n<min||n>max)throw Error(label+' must be between '+min+' and '+max);
    return String(Number(n.toFixed(3)));
  }
  function replaceAttribute(tag,name,value){
    const pattern=new RegExp('(\\b'+name+'\\s*=\\s*)(["\\\'])([^"\\\']*)\\2','i');
    if(!pattern.test(tag))throw Error('Missing '+name+' attribute; no changes made');
    return tag.replace(pattern,(_match,prefix,quote)=>prefix+quote+value+quote);
  }
  function update(source,eventIndex,positionIndex,values,validateXml,maxWorld=COORD_LIMIT){
    const before=parse(source,validateXml);
    const match=before.entries.find(p=>p.eventIndex===eventIndex&&p.positionIndex===positionIndex);
    if(!match)throw Error('Selected spawn position was not found');
    if(!Number.isFinite(maxWorld)||maxWorld<=0||maxWorld>COORD_LIMIT)throw Error('Invalid map world size');
    const target={
      x:validNumber(values.x,'X',0,maxWorld),
      z:validNumber(values.z,'Z',0,maxWorld),
      a:match.a===null?null:validNumber(values.a,'Orientation',-1,360)
    };
    let ei=0,found=false;
    const next=source.replace(new RegExp(EVENT.source,'gi'),block=>{
      if(ei++!==eventIndex)return block;
      let pi=0;
      return block.replace(new RegExp(POS.source,'gi'),tag=>{
        if(pi++!==positionIndex)return tag;
        found=true;
        let out=replaceAttribute(tag,'x',target.x);
        out=replaceAttribute(out,'z',target.z);
        if(target.a!==null)out=replaceAttribute(out,'a',target.a);
        return out;
      });
    });
    if(!found)throw Error('Position could not be safely updated');
    const after=parse(next,validateXml);
    if(after.entries.length!==before.entries.length||after.events.some((e,i)=>e.name!==before.events[i].name||e.count!==before.events[i].count))
      throw Error('Spawn structure changed unexpectedly; edit cancelled');
    return next;
  }
  function inspect(source,validateXml,maxWorld=COORD_LIMIT){
    const {events,entries}=parse(source,validateXml),report=[];
    if(!events.length)report.push({level:'warn',message:'No named events found'});
    const seen=new Set();
    for(const e of entries){
      const label=e.name+' position '+(e.positionIndex+1);
      if(e.x<0||e.z<0||e.x>maxWorld||e.z>maxWorld)
        report.push({level:'error',message:label+': outside 0–'+maxWorld+' world X/Z'});
      if(e.a!==null&&(e.a< -1||e.a>360))
        report.push({level:'error',message:label+': orientation must be -1–360'});
      const key=e.eventIndex+'|'+e.x+'|'+e.z;
      if(seen.has(key))report.push({level:'warn',message:label+': duplicate position in this event'});
      seen.add(key);
    }
    report.push({level:'ok',message:events.length+' events and '+entries.length+' native spawn positions inspected'});
    return report;
  }
  return Object.freeze({parse,update,inspect,validNumber,replaceAttribute});
});
