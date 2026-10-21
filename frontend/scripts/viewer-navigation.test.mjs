import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/scripts/viewer-navigation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
test('desktop arrow navigation works without consuming editor input or browser shortcuts',()=>{
 assert.equal(exports.viewerKeyStep({key:'ArrowLeft'}),-1);assert.equal(exports.viewerKeyStep({key:'ArrowRight'}),1);assert.equal(exports.viewerKeyStep({key:'Escape'}),0);
 for(const field of ['defaultPrevented','isComposing','altKey','ctrlKey','metaKey'])assert.equal(exports.viewerKeyStep({key:'ArrowRight',[field]:true}),0);
 assert.equal(exports.viewerKeyStep({key:'ArrowLeft',target:{closest:()=>({})}}),0);
});
