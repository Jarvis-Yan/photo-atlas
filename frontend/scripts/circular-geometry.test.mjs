import test from 'node:test';
import assert from 'node:assert/strict';
import {fitPhoto} from '../src/scripts/circular-geometry.js';

test('portrait, landscape and panorama remain uncropped within desktop and phone slots',()=>{
 for(const ratio of [2/3,3/2,1,16/9,4,0.25]){
  for(const [width,height] of [[400,270],[250,168],[120,80]]){
   const box=fitPhoto(ratio,width,height);
   assert.ok(box.w<=width && box.h<=height+1e-9);
   assert.ok(Math.abs(box.w/box.h-ratio)<1e-9);
   assert.ok(Math.abs(box.w-width)<1e-9 || Math.abs(box.h-height)<1e-9);
  }
 }
});
test('missing or invalid proportions use a finite square fallback',()=>{
 for(const ratio of [NaN,Infinity,0,-1]){
  assert.deepEqual(fitPhoto(ratio,250,168),{w:168,h:168});
 }
});

test('a browser without WebGL2 can fall back without installing gallery handlers',async()=>{
 const {mountCircularGallery}=await import('../src/scripts/circular-engine.js');
 assert.equal(mountCircularGallery({container:{},canvas:{getContext:()=>null},labelLayer:{},caption:{},buttons:[],settings:{},onActive:()=>{}}),undefined);
});
