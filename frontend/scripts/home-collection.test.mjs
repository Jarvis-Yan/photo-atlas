import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/scripts/home-collection.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URLSearchParams,Error});
const photo=(id,category='自然',title='荷花')=>({id,category,title,tags:['水面'],geo:{label:'山东 济南'},captured:{value:'2026-07-01'}});
const daily=[photo('daily-a'),photo('daily-b','城市','街巷')];
const initial={mode:'daily',category:'',query:''};
const ids=state=>Array.from(state.photos,item=>item.id);
function setup(fetchPage,filter=initial){let state;const controller=exports.homeCollection(daily,fetchPage,next=>state=next,filter);return {controller,get state(){return state}}}
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail});return {promise,resolve,reject}};

test('daily selection is local and category/search never escape its scope',async()=>{
 let calls=0;const fixture=setup(async()=>{calls++;return {photos:[],total:0}});
 await fixture.controller.start();assert.deepEqual(ids(fixture.state),['daily-a','daily-b']);
 await fixture.controller.select({category:'自然',query:'济南'});assert.deepEqual(ids(fixture.state),['daily-a']);
 await fixture.controller.select({query:'城市之外的照片'});assert.equal(fixture.state.total,0);assert.equal(calls,0);
});
test('all works requests the whole catalog, paginates and retains both filters',async()=>{
 const calls=[];const fixture=setup(async(filter,offset)=>{calls.push({...filter,offset});return offset?{photos:[photo('all-c')],total:3}:{photos:[photo('all-a'),photo('all-b')],total:3}});
 await fixture.controller.select({mode:'all',category:'自然',query:'荷花'});
 assert.deepEqual(ids(fixture.state),['all-a','all-b']);assert.equal(fixture.state.total,3);
 await fixture.controller.more();assert.deepEqual(ids(fixture.state),['all-a','all-b','all-c']);
 assert.deepEqual(calls.map(call=>call.offset),[0,2]);assert.ok(calls.every(call=>call.mode==='all'&&call.category==='自然'&&call.query==='荷花'));
 await fixture.controller.more();assert.equal(calls.length,2);
});
test('late all-works response cannot replace the newly selected daily photos',async()=>{
 const request=deferred();const fixture=setup(()=>request.promise);
 const pending=fixture.controller.select({mode:'all'});assert.equal(fixture.state.loading,true);
 await fixture.controller.select({mode:'daily'});request.resolve({photos:[photo('old-all')],total:1});await pending;
 assert.equal(fixture.state.mode,'daily');assert.deepEqual(ids(fixture.state),['daily-a','daily-b']);
});
test('late query responses cannot overwrite newer filters',async()=>{
 const old=deferred();const fixture=setup(filter=>filter.query==='旧关键词'?old.promise:Promise.resolve({photos:[photo('fresh')],total:1}));
 const pending=fixture.controller.select({mode:'all',query:'旧关键词'});
 await fixture.controller.select({query:'新关键词'});old.resolve({photos:[photo('old')],total:1});await pending;
 assert.deepEqual(ids(fixture.state),['fresh']);assert.equal(fixture.state.query,'新关键词');
});
test('failed pagination preserves loaded works and retries the same offset',async()=>{
 let attempt=0;const calls=[];const fixture=setup(async(filter,offset)=>{calls.push(offset);if(offset&&attempt++===0)throw new Error('连接暂时中断');return offset?{photos:[photo('b')],total:2}:{photos:[photo('a')],total:2}});
 await fixture.controller.select({mode:'all'});await fixture.controller.more();
 assert.deepEqual(ids(fixture.state),['a']);assert.equal(fixture.state.error,'连接暂时中断');assert.equal(fixture.state.loading,false);
 await fixture.controller.retry();assert.deepEqual(ids(fixture.state),['a','b']);assert.deepEqual(calls,[0,1,1]);
});
test('direct links normalize mode, category and query without inventing new scopes',()=>{
 const parsed=exports.collectionFilter(new URLSearchParams('view=all&category=自然&q=+荷花+'));
 assert.equal(parsed.mode,'all');assert.equal(parsed.category,'自然');assert.equal(parsed.query,'荷花');
 const fallback=exports.collectionFilter(new URLSearchParams('view=unknown&category=unknown'));
 assert.equal(fallback.mode,'daily');assert.equal(fallback.category,'');
});
test('Back restores enough real pages and stops when a different scope is selected',async()=>{
 const calls=[];const fixture=setup(async(_,offset)=>{calls.push(offset);return {photos:[photo(String(offset))],total:3}},{...initial,mode:'all'});
 await fixture.controller.start(3);assert.deepEqual(calls,[0,1,2]);assert.deepEqual(ids(fixture.state),['0','1','2']);
 const pending=deferred();let count=0;
 const changed=setup(()=>++count===1?Promise.resolve({photos:[photo('first')],total:3}):pending.promise,{...initial,mode:'all'});
 const restoring=changed.controller.start(3);await Promise.resolve();await Promise.resolve();await changed.controller.select({mode:'daily'});
 pending.resolve({photos:[photo('old')],total:3});await restoring;
 assert.equal(changed.state.mode,'daily');assert.deepEqual(ids(changed.state),['daily-a','daily-b']);
});
