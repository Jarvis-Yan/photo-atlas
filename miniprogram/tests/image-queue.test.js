const test=require('node:test'),assert=require('node:assert/strict');
const {createQueue}=require('../utils/image-queue');
test('continuous scrolling downloads small images while deferring new clear upgrades',()=>{
 const queue=createQueue(4,2),started=[],finish=[];queue.setScrolling(true);
 queue.enqueue('clear',done=>{started.push('clear');finish.push(done)});
 for(let i=0;i<6;i++)queue.enqueue('small',done=>{started.push('small');finish.push(done)});
 assert.deepEqual(started,['small','small','small','small']);finish.shift()();finish.shift()();assert.equal(started.length,6);assert.ok(started.every(s=>s==='small'));
 queue.setScrolling(false);assert.equal(started.length,6);finish.shift()();assert.equal(started.at(-1),'clear');
});
