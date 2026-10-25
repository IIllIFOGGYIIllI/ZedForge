/* ZedForge Nasdara calibration and transforms. Deliberately independent of game artwork. */
(function(root,factory){
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.ZedForgeProjection=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const EXTENT=16384;
 const clamp=(n,a,b)=>Math.min(Math.max(n,a),b);
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 function validateWorld(x,z,extent=EXTENT){return finite(x)&&finite(z)&&x>=0&&z>=0&&x<=extent&&z<=extent}
 function fitScale(w,h,extent=EXTENT){if(!(finite(w)&&finite(h)&&w>0&&h>0&&extent>0))throw Error('Invalid viewport');return Math.min(w,h)*.93/extent}
 function view(x=8192,z=8192,zoom=1){if(!finite(x)||!finite(z)||!finite(zoom)||zoom<=0)throw Error('Invalid camera');return{x,z,zoom}}
 function scale(v,w,h,extent=EXTENT){return fitScale(w,h,extent)*v.zoom}
 function toScreen(x,z,v,w,h,extent=EXTENT){const s=scale(v,w,h,extent);return{x:w/2+(x-v.x)*s,y:h/2-(z-v.z)*s}}
 function fromScreen(sx,sy,v,w,h,extent=EXTENT){const s=scale(v,w,h,extent);return{x:v.x+(sx-w/2)/s,z:v.z-(sy-h/2)/s}}
 function anchoredZoom(v,sx,sy,newZoom,w,h,extent=EXTENT){const target=clamp(newZoom,.75,64),world=fromScreen(sx,sy,v,w,h,extent),s=fitScale(w,h,extent)*target;
 return view(world.x-(sx-w/2)/s,world.z+(sy-h/2)/s,target)}
 function pixelFromWorld(x,z,imageWidth,imageHeight,extent=EXTENT){return{x:x/extent*imageWidth,y:(1-z/extent)*imageHeight}}
 function worldFromPixel(px,py,imageWidth,imageHeight,extent=EXTENT){return{x:px/imageWidth*extent,z:(1-py/imageHeight)*extent}}
 function niceStep(metersPer100Px){const raw=Math.max(1,metersPer100Px),pow=Math.pow(10,Math.floor(Math.log10(raw)));return[1,2,5,10].map(n=>n*pow).find(n=>n>=raw)||pow*10}
 return{EXTENT,clamp,finite,validateWorld,fitScale,view,scale,toScreen,fromScreen,anchoredZoom,pixelFromWorld,worldFromPixel,niceStep}
});