import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/scripts/collection-details.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL});
test('album facts show member years and places, retain unique copy, and omit template copy',()=>{
 const result=exports.albumFacts({title:'云南旅行',years:[2026,2024,2026],places:['云南 大理','云南 沙溪古镇'],description:'按地点汇集旅行作品；不同年份在足迹时间轴中浏览。'});
 assert.equal(result.year,'2024—2026');assert.equal(result.places,'大理 · 沙溪古镇');assert.equal(result.description,'');
 assert.equal(exports.albumFacts({title:'旧册',description:'一次真实的旅行'}).description,'一次真实的旅行');
 assert.equal(exports.albumFacts({title:'旧册',description:''}).year,'');
});
test('contact links accept real destinations and keep unrecognized or executable text as plain text',()=>{
 assert.equal(exports.contactDestination('photo@example.com'),'mailto:photo@example.com');
 assert.equal(exports.contactDestination('+86 123-4567-8901'),'tel:+8612345678901');
 assert.equal(exports.contactDestination('https://example.com/contact'),'https://example.com/contact');
 for(const value of ['javascript:alert(1)','其他联系信息','photo@example.com\r\nBcc:someone@example.com'])assert.equal(exports.contactDestination(value),null);
});
