import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
const code=ts.transpileModule(readFileSync(new URL('../src/scripts/featured-cover.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const previewExports={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/scripts/photo-preview.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:previewExports});
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve()};
function fixture({defer=false,broken=[]}={}){
 let now=0,id=0;const jobs=new Map(),images=[],waiting=[],opened=[],exports={};
 class Element {
  dataset={};attributes=new Map();listeners=new Map();hidden=false;textContent='';children=[];capture=null;
  addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(fn)}
  emit(name,extra={}){const e={type:name,prevented:false,preventDefault(){this.prevented=true},...extra};for(const fn of this.listeners.get(name)||[])fn(e);return e}
  setAttribute(name,value){this.attributes.set(name,value)}removeAttribute(name){this.attributes.delete(name)}
  prepend(el){this.children.unshift(el)}querySelector(name){return this.elements?.[name]||null}
  contains(el){return Object.values(this.elements||{}).includes(el)}remove(){this.removed=true}
  setPointerCapture(id){this.capture=id}hasPointerCapture(id){return this.capture===id}releasePointerCapture(){this.capture=null}
 }
 class Image extends Element {
  decode(){if(broken.includes(this.src))return Promise.reject(new Error('broken image'));if(!defer)return Promise.resolve();return new Promise(resolve=>waiting.push({src:this.src,resolve}))}
 }
 const root=new Element(),link=new Element(),document=new Element(),window=new Element(),reduced=new Element();
 reduced.matches=false;document.hidden=false;
 root.elements=Object.fromEntries(['.folio-cover','#cover-title','[data-cover-count]','[data-cover-toggle]','[data-cover-prev]','[data-cover-next]','.cover-controls'].map(name=>[name,name==='.folio-cover'?link:new Element()]));
 link.elements={'.cover-loading':new Element()};document.createElement=()=>{const image=new Image();images.push(image);return image};
 let observe;
 vm.runInNewContext(code,{exports,require:name=>{if(name==='./photo-preview')return previewExports;if(name==='./preview-loader')return {PreviewLoader:class{seen=new Map();constructor(root,limit,clear,callbacks){this.root=root;this.callbacks=callbacks}pause(){}resume(){}watch(){for(const image of this.root.children){const key=image.dataset.previewSrc;if(!key||this.seen.get(image)===key)continue;this.seen.set(image,key);image.src=image.dataset.previewSmall;image.decode().then(()=>this.callbacks.ready(image,'preview')).catch(()=>this.callbacks.error(image))}}}};throw new Error(name)},document,window,matchMedia:()=>reduced,Date:{now:()=>now},IntersectionObserver:class{constructor(fn){observe=fn}observe(){}},setTimeout:(fn,ms)=>{jobs.set(++id,{fn,due:now+ms,ms});return id},clearTimeout:key=>jobs.delete(key)});
 const photos=Array.from({length:3},(_,i)=>({title:'作品'+i,alt:'作品'+i,slug:'work-'+i,width:600,height:400,src:'/photo-'+i,srcset:''}));
 exports.featuredCover(root,photos,index=>opened.push(index));observe([{isIntersecting:true}]);
 return {root,link,document,images,opened,jobs,waiting,button:name=>root.elements['[data-cover-'+name+']'],get title(){return root.elements['#cover-title'].textContent},visible:value=>observe([{isIntersecting:value}]),resolve(src){waiting.filter(w=>w.src===src).forEach(w=>w.resolve())},async tick(ms){now+=ms;for(const [key,job] of [...jobs])if(job.due<=now){jobs.delete(key);job.fn()}await flush()}};
}
test('display only after decoding and preload just the next daily frame',async()=>{
 const f=fixture({defer:true});assert.equal(f.images.length,2);assert.equal(f.title,'');
 f.resolve('/photo-0');await flush();assert.equal(f.title,'作品0');assert.equal(f.link.href,'/photos/work-0');
 await f.tick(650);assert.equal(f.images.filter(i=>i.src).length,2);assert.ok(f.images.some(i=>i.src==='/photo-1'));
 f.button('next').onclick();await flush();assert.equal(f.title,'作品0');
 assert.ok(![...f.jobs.values()].some(j=>j.ms===7000));
 f.resolve('/photo-1');await flush();assert.equal(f.title,'作品1');assert.equal(f.link.href,'/photos/work-1');
 f.link.emit('click');assert.deepEqual(f.opened,[1]);
});
test('seven-second rotation pauses offscreen and while hovered, then resumes',async()=>{
 const f=fixture();await flush();await f.tick(7000);assert.equal(f.title,'作品1');
 f.visible(false);await f.tick(14000);assert.equal(f.title,'作品1');
 f.visible(true);f.root.emit('pointerenter',{pointerType:'mouse'});await f.tick(7000);assert.equal(f.title,'作品1');
 f.root.emit('pointerleave',{pointerType:'mouse'});await f.tick(7000);assert.equal(f.title,'作品2');
});
test('horizontal touch swipes advance without accidentally opening a photograph',async()=>{
 const f=fixture();await flush();f.link.emit('pointerdown',{pointerType:'touch',pointerId:1,clientX:200,clientY:100});
 assert.equal(f.link.emit('pointermove',{pointerId:1,clientX:100,clientY:103}).prevented,true);
 f.link.emit('pointerup',{pointerId:1,clientX:100,clientY:103});await flush();assert.equal(f.title,'作品1');
 assert.equal(f.link.emit('click').prevented,true);assert.deepEqual(f.opened,[]);
 await f.tick(600);f.link.emit('click');assert.deepEqual(f.opened,[1]);
 f.link.emit('pointerdown',{pointerType:'touch',pointerId:2,clientX:200,clientY:100});
 assert.equal(f.link.emit('pointermove',{pointerId:2,clientX:202,clientY:200}).prevented,false);
 f.link.emit('pointercancel',{pointerId:2,clientX:202,clientY:200});await flush();assert.equal(f.title,'作品1');
});
test('late decode from a superseded request cannot overwrite the manually selected frame',async()=>{
 const f=fixture({defer:true});f.resolve('/photo-0');await flush();
 f.button('next').onclick();f.button('prev').onclick();
 f.resolve('/photo-2');await flush();assert.equal(f.title,'作品2');
 f.resolve('/photo-1');await flush();assert.equal(f.title,'作品2');
});
test('a broken first photo is skipped while the remaining daily selection can display',async()=>{
 const f=fixture({broken:['/photo-0']});await flush();assert.equal(f.title,'作品1');
 await f.tick(7000);assert.equal(f.title,'作品2');
});
