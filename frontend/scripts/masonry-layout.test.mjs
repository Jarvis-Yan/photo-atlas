import test from 'node:test';
import assert from 'node:assert/strict';
import {masonryLayout} from '../src/scripts/masonry-layout.ts';
const items=Array.from({length:243},(_,i)=>({width:[6000,4000,6000,6000][i%4],height:[4000,6000,3500,4000][i%4]}));
for(const width of [280,350,390,540,768,1024,1296,1800]){
 test(`preserves proportions, gaps and bounds at ${width}px`,()=>{
  const {boxes,height,gap}=masonryLayout(items,width);
  boxes.forEach((box,i)=>{
   assert.ok(box.x>=0&&box.x+box.width<=width+.001&&box.y+box.height<=height+.001);
   assert.ok(Math.abs(box.height/box.width-items[i].height/items[i].width)<1e-10);
   boxes.slice(0,i).forEach(other=>assert.ok(box.x>=other.x+other.width+gap-.001||other.x>=box.x+box.width+gap-.001||box.y>=other.y+other.height+gap-.001||other.y>=box.y+box.height+gap-.001));
  });
  assert.deepEqual(masonryLayout(items.slice(0,36),width).boxes,boxes.slice(0,36),'pagination must not move existing tiles');
 });
}
test('empty and missing dimensions remain finite',()=>{
 assert.equal(masonryLayout([],350).height,0);
 assert.equal(masonryLayout([{width:0,height:0}],350).boxes[0].height,350);
});

const {boundedLayout}=await import('../src/scripts/masonry-layout.ts');
for(const width of [280,350,600,768,1296,1800]){
 test(`small mosaics close all four edges without cropping at ${width}px`,()=>{
  for(let count=1;count<=12;count++){
   const input=items.slice(0,count),{boxes,height,gap}=boundedLayout(input,width);
   boxes.forEach((box,i)=>{
    assert.ok(box.x>=-.001&&box.y>=-.001&&box.x+box.width<=width+.001&&box.y+box.height<=height+.001);
    assert.ok(Math.abs(box.height/box.width-input[i].height/input[i].width)<1e-9);
    boxes.slice(0,i).forEach(b=>assert.ok(box.x>=b.x+b.width+gap-.001||b.x>=box.x+box.width+gap-.001||box.y>=b.y+b.height+gap-.001||b.y>=box.y+box.height+gap-.001));
   });
   const edges=[
    [boxes.filter(b=>b.y<.001).map(b=>[b.x,b.x+b.width]),width],
    [boxes.filter(b=>Math.abs(b.y+b.height-height)<.001).map(b=>[b.x,b.x+b.width]),width],
    [boxes.filter(b=>b.x<.001).map(b=>[b.y,b.y+b.height]),height],
    [boxes.filter(b=>Math.abs(b.x+b.width-width)<.001).map(b=>[b.y,b.y+b.height]),height],
   ];
   for(const [intervals,end] of edges){
    intervals.sort((a,b)=>a[0]-b[0]);assert.ok(intervals[0][0]<.001);
    assert.ok(Math.abs(intervals.at(-1)[1]-end)<.001);
    for(let i=1;i<intervals.length;i++)assert.ok(intervals[i][0]-intervals[i-1][1]<=gap+.001);
   }
  }
 });
}

test('reading-sized cards use at most three columns and one column on phones',()=>{
 for(const width of [350,600,900,1296,1800]){const result=masonryLayout(items,width);assert.ok(result.columns<=3);if(width<720)assert.equal(result.columns,1)}
});

const {expandCardBacks}=await import('../src/scripts/masonry-layout.ts');
test('long backs extend fully without overlapping adjacent cards in either layout',()=>{
 for(const layout of [masonryLayout,boundedLayout])for(const width of [350,768,1296]){
  const {boxes}=layout(items.slice(0,12),width),needs=boxes.map((b,i)=>i%3===0?b.height+400:0);
  const height=expandCardBacks(boxes,needs);
  boxes.forEach((b,i)=>{
   assert.ok(b.height>=needs[i]);assert.ok(b.y+b.height<=height+.001);
   boxes.slice(0,i).forEach(a=>assert.ok(b.x>=a.x+a.width-.001||a.x>=b.x+b.width-.001||b.y>=a.y+a.height-.001||a.y>=b.y+b.height-.001));
  });
 }
});
