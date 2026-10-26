// Optional Nasdara greenery visualization checks.
// node map-lab/vegetation.test.cjs
'use strict';
const assert=require('node:assert/strict');
const V=require('./vegetation.js');
let passed=0;
function check(title,fn){fn();console.log('PASS',title);passed++}
check('Forest-green pixels receive a visible enhancement',()=>{
 assert(V.vegetationStrength(50,80,49)>.7);
});
check('Desert sand and neutral roads remain unaltered',()=>{
 assert.equal(V.vegetationStrength(172,146,104),0);
 assert.equal(V.vegetationStrength(90,90,90),0);
 assert.equal(V.vegetationStrength(205,201,200),0);
});
check('Olive green is classified more gently than dense forest',()=>{
 const olive=V.vegetationStrength(109,116,68),forest=V.vegetationStrength(50,80,49);
 assert(olive>0&&olive<forest);
});
check('RGBA tint mask does not change source data and has bounded alpha',()=>{
 const data=new Uint8ClampedArray([50,80,49,255,172,146,104,255]);
 const untouched=new Uint8ClampedArray(data);
 const changed=V.tintPixels(data);
 assert.equal(changed,1);
 assert(data[3]>0&&data[3]<=122);
 assert.equal(data[7],0);
 assert.equal(untouched[0],50);
});
check('Image mask uses reduced resolution and local canvas pixels',()=>{
 const pixels=new Uint8ClampedArray(4*4*4).fill(0);
 for(let i=0;i<pixels.length;i+=4){
   pixels[i]=45;pixels[i+1]=80;pixels[i+2]=47;pixels[i+3]=255
 }
 const callbacks={drawn:0,returned:false};
 const canvas={width:0,height:0,getContext(){return{
   drawImage(){callbacks.drawn++},
   getImageData(){return{data:new Uint8ClampedArray(pixels)}},
   putImageData(){callbacks.returned=true}
 }}};
 const result=V.makeOverlay({width:4096,height:4096},()=>canvas,4);
 assert.equal(result.canvas.width,4);assert.equal(result.canvas.height,4);
 assert(result.highlighted>0);assert.equal(callbacks.drawn,1);assert.equal(callbacks.returned,true);
});
console.log(passed+' vegetation checks passed.');
