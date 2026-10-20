import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
const compile=file=>ts.transpileModule(readFileSync(new URL('../src/scripts/'+file+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const preview={};vm.runInNewContext(compile('photo-preview'),{exports:preview});
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve()};
function fixture(){
 const requests=[],exports={};
 class Image{decode(){return new Promise((resolve,reject)=>requests.push({src:this.src,resolve,reject}))}}
 vm.runInNewContext(compile('viewer-image'),{exports,Image,require:()=>preview});
 const image={style:{},dataset:{},removeAttribute(){},complete:true,naturalWidth:320},status={},retry={};
 return {loader:exports.viewerImage(image,status,retry),image,status,retry,requests};
}
const photo=id=>({id,width:600,height:900,title:id,src:'/old.jpg',srcset:'',thumbnail:{src:'/small-'+id,srcset:''}});
test('preview appears first; late full image cannot replace a newer selection',async()=>{
 const f=fixture();f.loader.show(photo('a'));assert.equal(f.image.src,'/small-a');assert.equal(f.status.hidden,false);
 f.loader.show(photo('b'));f.requests[0].resolve();await flush();assert.equal(f.image.src,'/small-b');
 f.requests[1].resolve();await flush();assert.equal(f.image.src,'/media/b/2400.webp');assert.equal(f.image.dataset.quality,'full');assert.equal(f.status.hidden,true);
});
test('failed full image preserves preview and offers a functional retry',async()=>{
 const f=fixture();f.loader.show(photo('a'));f.requests[0].reject();await flush();
 assert.equal(f.image.src,'/small-a');assert.equal(f.retry.hidden,false);assert.match(f.status.textContent,/当前显示预览/);
 f.retry.onclick();assert.equal(f.requests.length,2);f.requests[1].resolve();await flush();assert.equal(f.image.dataset.quality,'full');
});
test('closing invalidates pending decodes and clears retry selection',async()=>{
 const f=fixture();f.loader.show(photo('a'));f.loader.cancel();f.requests[0].resolve();await flush();
 assert.equal(f.image.src,'/small-a');f.retry.onclick();assert.equal(f.requests.length,1);
});
