import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
const code=ts.transpileModule(readFileSync(new URL('../src/scripts/public-navigation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function fixture(type,url='/?view=all',savedUrl=url){
 const exports={},listeners={},scrolls=[],history={state:{other:'kept',photoAtlasBrowse:{url:savedUrl,scroll:4500,count:72}},replaceState(next){this.state=next}};
 vm.runInNewContext(code,{exports,history,performance:{getEntriesByType:()=>[{type}]},location:{href:url},scrollY:4800,window:{addEventListener:(key,fn)=>listeners[key]=fn},requestAnimationFrame:fn=>fn(),scrollTo:options=>scrolls.push(options)});
 return {navigation:exports.publicNavigation,history,listeners,scrolls};
}
test('only Back to the matching entry restores its count and scroll exactly once',()=>{
 const f=fixture('back_forward');assert.equal(f.navigation.count,72);assert.equal(f.history.scrollRestoration,'manual');
 f.navigation.restore();f.navigation.restore();assert.equal(f.scrolls.length,1);assert.equal(f.scrolls[0].top,4500);assert.equal(f.history.scrollRestoration,'auto');
 for(const f of [fixture('reload'),fixture('navigate'),fixture('back_forward','/?q=new','/?q=old')]){f.navigation.restore();assert.equal(f.navigation.count,0);assert.equal(f.scrolls.length,0)}
});
test('leaving saves the current count and position while preserving other history state',()=>{
 const f=fixture('navigate');f.navigation.rememberCount(108);f.listeners.pagehide();
 assert.equal(f.history.state.other,'kept');assert.equal(f.history.state.photoAtlasBrowse.count,108);assert.equal(f.history.state.photoAtlasBrowse.scroll,4800);
});
test('an atlas scroll pane saves and restores its own position instead of the window',()=>{
 const f=fixture('back_forward'),positions=[];
 const pane={scrollTop:2400,scrollTo:options=>positions.push(options)};
 f.navigation.useScrollContainer(pane);
 f.navigation.restore();f.navigation.restore();
 assert.equal(positions.length,1);assert.equal(positions[0].top,4500);
 assert.equal(f.scrolls.length,0);
 f.listeners.pagehide();
 assert.equal(f.history.state.photoAtlasBrowse.scroll,2400);
 assert.equal(f.history.state.other,'kept');
});
