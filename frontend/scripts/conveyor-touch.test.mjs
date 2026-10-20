import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';

const code=ts.transpileModule(readFileSync(new URL('../src/scripts/conveyor-touch.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function fixture(reverse=false){
 const pending=new Map();let id=0,now=0,writes=0,time=15000,enabled=true;
 const exports={};
 vm.runInNewContext(code,{exports,Date:{now:()=>now},setTimeout:(fn)=>{pending.set(++id,fn);return id},clearTimeout:(key)=>pending.delete(key)});
 class Column {
  dataset={cycleHeight:'1000',duration:'100000',reverse:String(reverse),manual:'false'};scrollTop=1000;listeners=new Map();
  addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn)}
  removeEventListener(name,fn){this.listeners.get(name)?.delete(fn)}
  emit(name,extra={}){const event={touches:[],prevented:false,stopped:false,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},...extra};for(const fn of this.listeners.get(name)||[])fn(event);return event}
 }
 const column=new Column();
 const animation={get currentTime(){return time},set currentTime(value){writes++;time=value}};
 const dispose=exports.bindTouchScroll(column,{getAnimations:()=>[animation]},()=>enabled);
 return {column,dispose,animation,pending,get writes(){return writes},disable(){enabled=false},advance(ms=180){now+=ms;const callbacks=[...pending.values()];pending.clear();callbacks.forEach(fn=>fn())}};
}
test('touch scroll stays native, pauses only its column, and retains browser momentum',()=>{
 const left=fixture(),right=fixture();
 assert.equal(left.column.emit('touchstart',{touches:[{}]}).prevented,false);
 left.column.scrollTop=1200;left.column.emit('scroll');
 assert.equal(left.column.dataset.manual,'true');assert.equal(right.column.dataset.manual,'false');
 assert.equal(left.writes,0);assert.equal(left.pending.size,0);
 left.column.emit('touchend');
 left.column.scrollTop=1300;left.column.emit('scroll');
 assert.equal(left.writes,0);
 left.advance();
 assert.equal(left.animation.currentTime,45000);assert.equal(left.column.scrollTop,1000);
 assert.equal(left.column.dataset.manual,'false');assert.equal(right.animation.currentTime,15000);
 left.column.emit('scroll');assert.equal(left.pending.size,0);
});
test('normal and reverse columns preserve the same visible frame when re-centering',()=>{
 for(const reverse of [false,true]){
  const f=fixture(reverse);
  f.column.emit('touchstart',{touches:[{}]});f.column.scrollTop=2100;f.column.emit('scroll');
  const before=(reverse?-1000+f.animation.currentTime/100: -f.animation.currentTime/100)-f.column.scrollTop;
  f.column.emit('touchend');f.column.emit('scrollend');
  const after=(reverse?-1000+f.animation.currentTime/100: -f.animation.currentTime/100)-f.column.scrollTop;
  assert.ok(Math.abs((after-before)%1000)<0.001);
  assert.equal(f.column.dataset.manual,'false');
 }
});
test('swipe suppresses accidental photo clicks but a normal tap still opens',()=>{
 const f=fixture();
 f.column.emit('touchstart',{touches:[{}]});f.column.scrollTop=1250;f.column.emit('scroll');f.column.emit('touchend');
 assert.equal(f.column.emit('click').prevented,true);f.advance(600);
 assert.equal(f.column.emit('click').prevented,false);
 f.column.emit('touchstart',{touches:[{}]});f.column.emit('touchend');f.advance();
 assert.equal(f.column.emit('click').prevented,false);
});
test('scrollend while finger is held does not resume; cancellation and cleanup stop timers',()=>{
 const f=fixture();f.column.emit('touchstart',{touches:[{}]});f.column.emit('scrollend');
 assert.equal(f.column.dataset.manual,'true');assert.equal(f.writes,0);
 f.column.emit('touchcancel');f.advance();assert.equal(f.column.dataset.manual,'false');
 f.column.emit('touchstart',{touches:[{}]});f.column.emit('touchend');f.dispose();
 assert.equal(f.pending.size,0);assert.ok([...f.column.listeners.values()].every(s=>s.size===0));
});
test('free browsing never pauses or seeks a conveyor animation',()=>{
 const f=fixture();f.disable();f.column.emit('touchstart',{touches:[{}]});f.column.scrollTop=1250;
 f.column.emit('scroll');f.column.emit('touchend');f.column.emit('scrollend');f.advance();
 assert.equal(f.writes,0);assert.equal(f.column.dataset.manual,'false');assert.equal(f.column.emit('click').prevented,false);
});
