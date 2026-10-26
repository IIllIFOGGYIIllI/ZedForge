/* Optional colour-based vegetation enhancement for locally loaded imagery.
 * This highlights existing green/olive pixels, not mapped tree locations. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ZedForgeVegetation=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
  'use strict';
  function clamp(n,low=0,high=1){return Math.max(low,Math.min(high,n))}
  function vegetationStrength(r,g,b){
    if(!Number.isFinite(r)||!Number.isFinite(g)||!Number.isFinite(b)||g<25||g>245)return 0;
    if(g<r*.82||g<b*1.10)return 0;
    const green=((g-b)*.56+(g-r)*1.18-11)/36;
    const contrast=(g-b-3)/22;
    return clamp(green)*clamp(contrast)*clamp((g-25)/58);
  }
  function tintPixels(data){
    if(!data||data.length%4!==0)throw Error('Expected RGBA pixels');
    let coloured=0;
    for(let i=0;i<data.length;i+=4){
      const alpha=data[i+3];
      const confidence=vegetationStrength(data[i],data[i+1],data[i+2]);
      data[i]=41;data[i+1]=153;data[i+2]=65;
      data[i+3]=Math.round(confidence*122*(alpha/255));
      if(confidence>.15)coloured++;
    }
    return coloured;
  }
  function makeOverlay(image,makeCanvas,maxDimension=2048){
    if(!image||typeof makeCanvas!=='function')throw Error('Image and canvas factory required');
    const iw=image.width||image.naturalWidth,ih=image.height||image.naturalHeight;
    if(!Number.isFinite(iw)||!Number.isFinite(ih)||iw<=0||ih<=0)throw Error('Invalid source image dimensions');
    const scale=Math.min(1,maxDimension/Math.max(iw,ih));
    const w=Math.max(1,Math.round(iw*scale)),h=Math.max(1,Math.round(ih*scale));
    const canvas=makeCanvas();canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw Error('2D canvas unavailable');
    ctx.drawImage(image,0,0,w,h);
    const pixels=ctx.getImageData(0,0,w,h);
    const highlighted=tintPixels(pixels.data);
    ctx.putImageData(pixels,0,0);
    return{canvas,highlighted,pixels:w*h};
  }
  return{clamp,vegetationStrength,tintPixels,makeOverlay};
});