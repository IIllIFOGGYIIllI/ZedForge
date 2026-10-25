// Run with node map-lab/projection.test.cjs
'use strict';
const assert=require('node:assert/strict');
const P=require('./projection.js');
let count=0;
const check=(name,run)=>{run();count++;console.log('PASS',name)};
const eq=(a,b)=>assert(Math.abs(a-b)<0.000001,'expected '+b+' got '+a);
check('Nasdara world dimensions are 16384 metres',()=>assert.equal(P.EXTENT,16384));
check('Northwest edge maps to first image pixel',()=>{const p=P.pixelFromWorld(0,16384,4096,4096);eq(p.x,0);eq(p.y,0)});
check('Southeast edge maps to last image boundary',()=>{const p=P.pixelFromWorld(16384,0,4096,4096);eq(p.x,4096);eq(p.y,4096)});
check('World center maps to image center',()=>{const p=P.pixelFromWorld(8192,8192,4096,4096);eq(p.x,2048);eq(p.y,2048)});
check('Image and world coordinate conversions roundtrip',()=>{const p=P.worldFromPixel(1257.5,2400,4096,4096),i=P.pixelFromWorld(p.x,p.z,4096,4096);eq(i.x,1257.5);eq(i.y,2400)});
check('World-to-screen roundtrip preserves values',()=>{const v=P.view(8200,6100,4),s=P.toScreen(4154.35,7390.71,v,1300,800),w=P.fromScreen(s.x,s.y,v,1300,800);eq(w.x,4154.35);eq(w.z,7390.71)});
check('Zoom anchors the world position under pointer',()=>{const v=P.view(7000,6000,2),before=P.fromScreen(200,140,v,900,650),next=P.anchoredZoom(v,200,140,7,900,650),after=P.fromScreen(200,140,next,900,650);eq(after.x,before.x);eq(after.z,before.z)});
check('Zoom clamps to safe bounds',()=>{assert.equal(P.anchoredZoom(P.view(),0,0,1000,1000,1000).zoom,64);assert.equal(P.anchoredZoom(P.view(),0,0,.2,1000,1000).zoom,.75)});
check('Invalid X/Z positions are not accepted',()=>{assert(!P.validateWorld(-1,0));assert(!P.validateWorld(0,17000));assert(!P.validateWorld(NaN,200));assert(P.validateWorld(16384,16384))});
check('Grid steps increase monotonically',()=>{assert(P.niceStep(100)>=100);assert(P.niceStep(1250)>=1250);assert(P.niceStep(100)>P.niceStep(1))});
console.log(count+' map projection checks passed.');
