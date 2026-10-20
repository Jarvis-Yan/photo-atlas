import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import test from 'node:test';import assert from 'node:assert/strict';
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve()};
function fixture(count=1){
 let observe,clock=1000,id=0;const exports={},probes=[],requests=[],buttons=[],timers=new Map();
 class Probe{constructor(){probes.push(this)}_src='';set src(value){this._src=value;if(value.startsWith('/'))requests.push({source:value,probe:this})}get src(){return this._src}get currentSrc(){return this._src}removeAttribute(name){if(name==='srcset')this.srcset=''}decode(){return Promise.resolve()}ok(){this.onload?.()}fail(){this.onerror?.()}}
 const source=ts.transpileModule(readFileSync(new URL('../src/scripts/preview-loader.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,{exports,Image:Probe,innerHeight:800,Date:{now:()=>clock},setTimeout(fn,delay){timers.set(++id,{fn,at:clock+delay});return id},clearTimeout(key){timers.delete(key)},IntersectionObserver:class{constructor(fn){observe=fn}observe(){}disconnect(){}},document:{createElement(){const button={addEventListener(n,fn){this[n]=fn},remove(){this.removed=true}};buttons.push(button);return button}}});
 const images=Array.from({length:count},(_,i)=>({dataset:{previewSmall:'/tiny'+i,previewLite:'/lite'+i,previewFallback:'/old'+i,previewSrc:'/clear'+i,previewSrcset:'/clear'+i+' 1600w',previewClearFallback:'/clear-fallback'+i},src:'placeholder',sizes:'700px',isConnected:true,y:i*50,getBoundingClientRect(){return{top:this.y,bottom:this.y+40}},removeAttribute(){},after(){}}));
 const loader=new exports.PreviewLoader({querySelectorAll(){return images}},4);loader.watch();
 return{loader,images,probes,requests,buttons,visible(list=images){observe(list.map(target=>({target,isIntersecting:true})))},advance(ms){clock+=ms;for(const [key,job]of [...timers])if(job.at<=clock){timers.delete(key);job.fn()}}};
}
test('small image displays first; clear image replaces it only after successful decoding',async()=>{
 const f=fixture(),image=f.images[0];f.visible();assert.equal(f.requests[0].source,'/tiny0');assert.equal(image.src,'placeholder');f.probes[0].ok();await settle();assert.equal(image.src,'/tiny0');assert.equal(image.dataset.previewQuality,'preview');assert.equal(f.requests[1].source,'/clear0');let resolve;f.probes[1].decode=()=>new Promise(ok=>resolve=ok);f.probes[1].ok();await settle();assert.equal(image.src,'/tiny0');resolve();await settle();assert.equal(image.src,'/clear0');assert.equal(image.dataset.previewQuality,'clear');assert.equal(image.dataset.previewState,'loaded');
});
test('failed clear upgrades keep the small image visible, retry with a cap, then allow manual retry',async()=>{
 const f=fixture(),image=f.images[0];f.visible();f.probes[0].ok();await settle();f.probes[1].fail();assert.equal(image.src,'/tiny0');assert.equal(f.requests.length,2);f.advance(1500);assert.equal(f.requests.at(-1).source,'/clear-fallback0');f.probes.at(-1).fail();assert.equal(image.src,'/tiny0');f.advance(5000);assert.equal(f.requests.at(-1).source,'/clear0');f.probes.at(-1).fail();assert.equal(f.buttons.length,1);assert.equal(f.buttons[0].textContent,'重试清晰预览');f.advance(60000);assert.equal(f.requests.length,4);assert.equal(image.src,'/tiny0');f.buttons[0].click({preventDefault(){},stopPropagation(){}});assert.equal(f.requests.at(-1).source,'/clear0');assert.equal(image.src,'/tiny0');
});
test('clear download timeout preserves the visible preview',async()=>{const f=fixture();f.visible();f.probes[0].ok();await settle();f.advance(15000);assert.equal(f.images[0].src,'/tiny0');assert.equal(f.images[0].dataset.previewQuality,'preview');});
test('small requests get priority, total requests stay bounded and only two clear upgrades run',async()=>{
 const f=fixture(8);f.visible();assert.equal(f.requests.length,4);for(let i=0;i<8;i++){const request=f.requests.find(r=>r.source==='/tiny'+i);assert.ok(request);request.probe.ok();await settle()}assert.ok(f.requests.slice(0,8).every(r=>r.source.startsWith('/tiny')));assert.equal(f.requests.filter(r=>r.source.startsWith('/clear')).length,2);
});
test('dragging pauses upgrades; late decode cannot overwrite a paused or newly rendered photo',async()=>{
 const f=fixture();f.visible();f.probes[0].ok();await settle();let resolve;const upgrade=f.probes[1];upgrade.decode=()=>new Promise(ok=>resolve=ok);upgrade.ok();f.loader.pause();resolve();await settle();assert.equal(f.images[0].src,'/tiny0');assert.equal(f.images[0].dataset.previewQuality,'preview');f.loader.resume();assert.equal(f.requests.length,3);let finish;f.probes[2].decode=()=>new Promise(ok=>finish=ok);f.probes[2].ok();f.images[0].dataset.previewSrc='/new-photo';f.loader.watch();finish();await settle();assert.equal(f.images[0].src,'/tiny0');
});
test('scrolling keeps small previews flowing and far-away requests yield to the new viewport',async()=>{
 const f=fixture(8);f.loader.pause();f.visible();assert.equal(f.requests.length,4);
 f.images.slice(0,4).forEach(i=>i.y=-2000);f.visible();assert.equal(f.requests.length,8);
 f.requests[4].probe.ok();await settle();assert.equal(f.images[4].src,'/tiny4');
 assert.ok(f.requests.every(r=>r.source.startsWith('/tiny')));
 f.loader.resume();assert.ok(f.requests.some(r=>r.source==='/clear4'));
});
test('nearby thumbnails load before entering the viewport but clear upgrades wait',async()=>{
 const f=fixture();f.images[0].y=1400;f.visible();assert.equal(f.requests[0].source,'/tiny0');f.probes[0].ok();await settle();assert.equal(f.requests.length,1);f.images[0].y=100;f.visible();assert.equal(f.requests[1].source,'/clear0');
});
test('small preview failures still allow a clear image to load without exposing broken sources',async()=>{const f=fixture();f.visible();f.probes[0].fail();assert.equal(f.requests[1].source,'/lite0');f.probes[1].fail();f.probes[2].fail();assert.equal(f.images[0].src,'placeholder');assert.equal(f.requests[3].source,'/clear0');f.probes[3].ok();await settle();assert.equal(f.images[0].src,'/clear0');});

test('syncing appended content preserves completed quality and in-flight upgrades',async()=>{const f=fixture();f.visible();f.probes[0].ok();await settle();const count=f.requests.length;f.loader.watch();assert.equal(f.requests.length,count);assert.equal(f.images[0].src,'/tiny0');f.probes[1].ok();await settle();f.loader.watch();f.visible();assert.equal(f.images[0].dataset.previewQuality,'clear');assert.equal(f.requests.length,count);});
