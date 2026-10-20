import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=ts.transpileModule(readFileSync(new URL('../src/scripts/circular-autoplay.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function clock(){
 let now=0,id=0,frames=0;const timers=new Map(),exports={};
 vm.runInNewContext(source,{exports,setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id},clearTimeout:id=>timers.delete(id)});
 const playback=exports.galleryAutoplay(()=>frames++);
 return {playback,get frames(){return frames},tick(ms){const end=now+ms;for(;;){const next=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;now=next[1].at;timers.delete(next[0]);next[1].fn()}now=end}};
}
test('advances exactly once every five seconds',()=>{const c=clock();c.tick(4999);assert.equal(c.frames,0);c.tick(1);assert.equal(c.frames,1);c.tick(10000);assert.equal(c.frames,3)});
test('drag, viewer and offscreen pauses combine; resume starts a full dwell',()=>{const c=clock();c.tick(4000);c.playback.pause('gesture',true);c.playback.pause('viewer',true);c.tick(10000);c.playback.pause('gesture',false);c.tick(6000);assert.equal(c.frames,0);c.playback.pause('viewer',false);c.tick(4999);assert.equal(c.frames,0);c.tick(1);assert.equal(c.frames,1);c.playback.pause('offscreen',true);c.tick(10000);assert.equal(c.frames,1)});
test('manual changes reset the interval and disposal stops playback',()=>{const c=clock();c.tick(4500);c.playback.reset();c.tick(4999);assert.equal(c.frames,0);c.tick(1);assert.equal(c.frames,1);c.playback.destroy();c.tick(20000);assert.equal(c.frames,1)});
