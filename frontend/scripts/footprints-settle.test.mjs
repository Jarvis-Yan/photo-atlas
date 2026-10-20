import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
function setup(){
  let now=0,next=0,commits=0;
  const pending=new Map(),exports={};
  const code=ts.transpileModule(readFileSync(new URL('../src/scripts/footprints-settle.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,setTimeout:(run,delay)=>{const id=++next;pending.set(id,{run,at:now+delay});return id},clearTimeout:id=>pending.delete(id)});
  const task=exports.settledTask(()=>commits++,320);
  return {task,count:()=>commits,tick(ms){now+=ms;for(const [id,entry] of pending){if(entry.at<=now){pending.delete(id);entry.run()}}}};
}
test('map waits for scrolling to stop and commits only the latest selection',()=>{
  const state=setup();state.task.schedule();state.tick(300);assert.equal(state.count(),0);
  state.task.schedule();state.tick(300);assert.equal(state.count(),0);
  state.tick(20);assert.equal(state.count(),1);state.tick(1000);assert.equal(state.count(),1);
});
test('holding a still pointer does not move the map; release and momentum must settle',()=>{
  const state=setup();state.task.schedule();state.task.hold();state.tick(1000);assert.equal(state.count(),0);
  state.task.schedule();state.tick(1000);assert.equal(state.count(),0);
  state.task.release();state.tick(200);state.task.schedule();state.tick(319);assert.equal(state.count(),0);
  state.tick(1);assert.equal(state.count(),1);
});
test('cancel prevents stale pending map work',()=>{
  const state=setup();state.task.schedule();state.task.cancel();state.tick(1000);assert.equal(state.count(),0);
});
