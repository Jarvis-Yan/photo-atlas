import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
function setup(withBridge=false){
 const exports={},frames=new Map(),timers=new Map(),events={},options={};let serial=0,near=4000,eligible=true,resolve,calls=0,now=1000;
 const values={};const bridge={getBoundingClientRect:()=>({top:near,bottom:near+180}),dataset:{},style:{setProperty:(key,value)=>values[key]=value}};
 const sentinel={closest:()=>withBridge?bridge:null,hidden:false,dataset:{},style:{setProperty(){}},textContent:'继续下滑',getBoundingClientRect:()=>({top:near,bottom:near+64})};
 const runway={hidden:true,style:{},getBoundingClientRect:()=>({height:180}),setAttribute(){}};
 const document={onscrollend:null,body:{append(){}},createElement:()=>runway,hidden:false,querySelector:()=>null,scrollingElement:{scrollHeight:5000,scrollTop:0,clientHeight:800},addEventListener:(key,fn)=>events[key]=fn};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/scripts/collection-scroll.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports,document,innerHeight:800,matchMedia:()=>({matches:false}),setTimeout:(fn,delay)=>{const id=++serial;timers.set(id,{fn,at:now+delay});return id},clearTimeout:id=>timers.delete(id),performance:{now:()=>now},window:{addEventListener:(key,fn,opts)=>{events[key]=fn;options[key]=opts}},
  requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial},cancelAnimationFrame:id=>frames.delete(id),
  IntersectionObserver:class{constructor(fn){events.intersect=fn}observe(){}},
 });
 const loader=exports.collectionAutoLoad(sentinel,()=>eligible,()=>{calls++;return new Promise(done=>resolve=done)});
 function advance(ms){now+=ms;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn()}}
 return {runway,advance,loader,events,options,sentinel,document,values,get frames(){return frames.size},step(){advance(16);const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now))},idle:()=>{advance(170);events.scroll();events.scrollend();},get calls(){return calls},set near(value){near=value},set eligible(value){eligible=value},wheel(gap=20,deltaY=120){advance(gap);events.wheel({deltaY,deltaX:0})},flush(){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now))},async done(){resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve()}};
}
test('first arrival pauses; wheel inertia is not another gesture',async()=>{
 const f=setup();f.wheel();f.near=780;f.events.scroll();f.flush();assert.equal(f.calls,0);assert.equal(f.sentinel.dataset.waiting,'true');
 for(let i=0;i<25;i++){f.wheel();f.events.scroll();f.flush()}
 assert.equal(f.calls,0);
 f.wheel(300);assert.equal(f.calls,0);f.idle();assert.equal(f.calls,1);
 f.wheel(300);f.events.intersect();f.flush();assert.equal(f.calls,1);
 f.near=4000;await f.done();f.flush();assert.equal(f.calls,1);
});
test('intersection, resize, restore and short content never chain loads',async()=>{
 const f=setup();f.near=400;f.loader.check();f.events.intersect();f.events.resize();f.flush();assert.equal(f.calls,0);
 f.wheel();assert.equal(f.calls,0);f.wheel(300);f.idle();assert.equal(f.calls,1);
 await f.done();f.flush();assert.equal(f.calls,1);
 f.wheel(20);assert.equal(f.calls,1);f.wheel(300);f.idle();assert.equal(f.calls,2);
});
test('touch release separates deliberate swipes from momentum',()=>{
 const f=setup();f.events.touchstart({touches:[{clientY:600}]});f.events.touchmove({touches:[{clientY:300}]});f.near=750;f.events.scroll();f.flush();
 f.events.touchmove({touches:[{clientY:100}]});f.events.touchend();for(let i=0;i<5;i++)f.events.scroll();f.flush();assert.equal(f.calls,0);
 f.events.touchstart({touches:[{clientY:600}]});f.events.touchmove({touches:[{clientY:300}]});assert.equal(f.calls,0);f.events.touchend();assert.equal(f.calls,1);
});
test('keyboard requires a fresh press; blocked controls do not request',()=>{
 const f=setup();f.near=700;f.events.keydown({key:'PageDown'});f.events.keyup({key:'PageDown'});assert.equal(f.calls,0);
 f.events.keydown({key:'PageDown',repeat:true});assert.equal(f.calls,0);
 f.events.keydown({key:'PageDown',target:{closest:()=>({})}});assert.equal(f.calls,0);
 f.events.keydown({key:'PageDown'});assert.equal(f.calls,0);f.events.keyup({key:'PageDown'});assert.equal(f.calls,1);
});
test('hidden views, failures, pagehide and leaving the boundary reset the gate',()=>{
 const f=setup();f.near=700;f.wheel();f.near=3000;f.events.scroll();f.flush();f.near=700;f.wheel(300);assert.equal(f.calls,0);
 f.eligible=false;f.loader.check();f.flush();f.wheel(300);assert.equal(f.calls,0);
 f.eligible=true;f.sentinel.hidden=true;f.wheel(300);assert.equal(f.calls,0);
 f.sentinel.hidden=false;f.document.hidden=true;f.wheel(300);assert.equal(f.calls,0);
 f.document.hidden=false;f.events.pagehide();f.wheel(300);assert.equal(f.calls,0);
 f.events.pageshow();f.flush();f.wheel(300);assert.equal(f.calls,0);f.wheel(300);f.idle();assert.equal(f.calls,1);
});

test('short pulls and cancellation spring back without loading',()=>{
 const f=setup();f.near=700;f.wheel();f.wheel(300,24);assert.equal(f.sentinel.dataset.ready,'false');f.idle();assert.equal(f.calls,0);assert.equal(f.sentinel.dataset.pulling,undefined);
 f.events.touchstart({touches:[{clientY:500}]});f.events.touchmove({touches:[{clientY:380}]});assert.equal(f.sentinel.dataset.ready,'true');f.events.touchcancel();assert.equal(f.calls,0);
 f.events.touchstart({touches:[{clientY:500}]});f.events.touchmove({touches:[{clientY:350}]});f.events.touchmove({touches:[{clientY:490}]});f.events.touchend();assert.equal(f.calls,0);
});

test('boundary spring responds gradually and stops rendering after release',()=>{
 const f=setup(true);f.near=700;f.wheel();f.wheel(300,45);f.step();
 const first=Number(f.values['--bridge-pull']);assert.ok(first>0&&first<.5);
 f.idle();for(let i=0;i<160&&f.frames;i++)f.step();
 assert.equal(f.calls,0);assert.equal(f.frames,0);assert.equal(Number(f.values['--bridge-pull']),0);
 f.wheel(300,45);f.step();f.events.pagehide();assert.equal(f.frames,0);assert.equal(Number(f.values['--bridge-pull']),0);
});


test('whole-page gestures stay active at document bottom past the boundary',()=>{
 const f=setup();f.near=-400;f.document.scrollingElement.scrollTop=4200;
 for(const name of ['wheel','touchstart','touchmove','touchend','touchcancel'])assert.equal(f.options[name].capture,true);
 f.events.scroll();f.flush();assert.equal(f.calls,0);
 f.wheel(300);f.idle();assert.equal(f.calls,1);
});
test('open image viewer does not load more behind the dialog',()=>{
 const f=setup();f.near=700;f.wheel();f.document.querySelector=()=>({});
 f.wheel(300);f.idle();assert.equal(f.calls,0);
});
test('reversing a partial wheel pull cancels the entire gesture',()=>{
 const f=setup();f.near=700;f.wheel();f.wheel(300,65);f.wheel(20,-5);
 assert.equal(f.sentinel.dataset.pulling,undefined);assert.equal(f.sentinel.textContent,'');
 f.wheel(20,180);f.idle();assert.equal(f.calls,0);
 f.wheel(300,100);f.idle();assert.equal(f.calls,1);
});
test('reversing a partial touch pull cancels until a new swipe',()=>{
 const f=setup();f.near=700;f.events.scroll();f.flush();
 f.events.touchstart({touches:[{clientY:500}]});f.events.touchmove({touches:[{clientY:440}]});
 f.events.touchmove({touches:[{clientY:445}]});f.events.touchmove({touches:[{clientY:300}]});f.events.touchend();assert.equal(f.calls,0);
 f.events.touchstart({touches:[{clientY:500}]});f.events.touchmove({touches:[{clientY:400}]});f.events.touchend();assert.equal(f.calls,1);
});


test('full touch pull stays ready indefinitely until finger release',()=>{
 const f=setup();f.near=700;f.events.scroll();f.flush();
 f.events.touchstart({touches:[{clientY:500}]});f.events.touchmove({touches:[{clientY:250}]});
 f.advance(10000);f.flush();assert.equal(f.calls,0);assert.equal(f.sentinel.dataset.ready,'true');
 f.events.touchend();assert.equal(f.calls,1);
});
test('any upward reversal cancels even an overfilled touch pull',()=>{
 const f=setup();f.near=700;f.events.scroll();f.flush();
 f.events.touchstart({touches:[{clientY:500}]});f.events.touchmove({touches:[{clientY:200}]});
 f.events.touchmove({touches:[{clientY:205}]});assert.equal(f.sentinel.dataset.ready,undefined);
 f.events.touchmove({touches:[{clientY:100}]});f.events.touchend();f.advance(10000);assert.equal(f.calls,0);
});
test('any upward reversal cancels an overfilled wheel pull',()=>{
 const f=setup();f.near=700;f.wheel();f.wheel(300,250);f.wheel(20,-1);f.idle();assert.equal(f.calls,0);
});

test('full trackpad pull never submits on a timer, only native scroll completion',()=>{
 const f=setup();f.near=700;f.wheel();f.wheel(300,180);f.events.scroll();
 assert.equal(f.runway.hidden,false);f.advance(10000);f.flush();assert.equal(f.calls,0);
 assert.equal(f.sentinel.dataset.ready,'true');f.events.scrollend();assert.equal(f.calls,1);
});
test('scrollend without actual movement cannot commit a held pull',()=>{
 const f=setup();f.near=700;f.wheel();f.wheel(300,180);f.events.scrollend();assert.equal(f.calls,0);
});
test('reversal after holding a full trackpad pull cancels before release',()=>{
 const f=setup();f.near=700;f.wheel();f.wheel(300,250);f.events.scroll();f.advance(10000);
 assert.equal(f.calls,0);f.wheel(20,-1);f.wheel(300,150);f.events.scrollend();assert.equal(f.calls,0);
});

test('arrival inertia leaves native scroll room for the next gesture',()=>{
 const f=setup();f.near=700;f.document.scrollingElement.scrollTop=4200;f.wheel();f.events.scrollend();
 assert.equal(f.runway.style.height,'300px');assert.equal(f.calls,0);
});
test('native scrollend cannot submit while a touch finger is held',()=>{
 const f=setup();f.near=700;f.events.scroll();f.events.touchstart({touches:[{clientY:500}]});
 f.events.touchmove({touches:[{clientY:250}]});f.events.scroll();f.events.scrollend();f.advance(10000);assert.equal(f.calls,0);
 f.events.touchend();assert.equal(f.calls,1);
});
