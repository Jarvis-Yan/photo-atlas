const test=require('node:test'),assert=require('node:assert/strict');
const {photoWall}=require('../utils/photo-wall');
const photos=Array.from({length:243},(_,i)=>({width:i%3?600:400,height:i%3?400:600}));
for(const width of [280,350,686,768,1200,1920])test('closed random wall preserves ratios and photo/caption separation at width '+width,()=>{
 for(let seed=0;seed<5;seed++){
  const {items,height}=photoWall(photos,width,14,60,seed);
  assert.deepEqual(items.map(p=>p.index),photos.map((_,i)=>i));
  for(let i=0;i<items.length;i++){
   const a=items[i];assert.ok(a.width>0&&a.x>=-.001&&a.x+a.width<=width+.001&&a.y>=-.001&&a.y+a.height+60<=height+.001);
   assert.ok(Math.abs(a.width/a.height-photos[i].width/photos[i].height)<.0001);
   for(const b of items.slice(i+1))assert.ok(a.x+a.width+14<=b.x+.001||b.x+b.width+14<=a.x+.001||a.y+a.height+60+14<=b.y+.001||b.y+b.height+60+14<=a.y+.001);
  }
  for(let start=0;start<items.length;start+=12){
   const block=items.slice(start,start+12),bottom=Math.max(...block.map(p=>p.y+p.height+60)),top=Math.min(...block.map(p=>p.y));
   // Every outer edge is covered by photos/captions, separated only by the intended gap.
   for(const edge of ['left','right','top','bottom']){
    const vertical=edge==='left'||edge==='right';
    const boundary=block.filter(p=>Math.abs(edge==='left'?p.x:edge==='right'?p.x+p.width-width:edge==='top'?p.y-top:p.y+p.height+60-bottom)<.001);
    const intervals=boundary.map(p=>vertical?[p.y,p.y+p.height+60]:[p.x,p.x+p.width]).sort((a,b)=>a[0]-b[0]);
    assert.ok(Math.abs(intervals[0][0]-(vertical?top:0))<.001,edge+' begins at frame');
    assert.ok(Math.abs(intervals.at(-1)[1]-(vertical?bottom:width))<.001,edge+' ends at frame');
    for(let i=1;i<intervals.length;i++)assert.ok(Math.abs(intervals[i][0]-intervals[i-1][1]-14)<.001,edge+' has no abandoned corner');
   }
  }
 }
});
test('stable seeds and complete groups stay fixed when more photos arrive',()=>{
 const first=photoWall(photos.slice(0,36),1200,18,60,42);
 assert.deepEqual(first,photoWall(photos.slice(0,36),1200,18,60,42));
 assert.deepEqual(first.items,photoWall(photos,1200,18,60,42).items.slice(0,36));
 assert.notDeepEqual(first,photoWall(photos.slice(0,36),1200,18,60,43));
 assert.ok(new Set(first.items.map(p=>Math.round(p.width))).size>6);
});
test('short and irregular final groups close the frame without duplicates',()=>{
 for(const count of [1,2,3,5,11,13,23,25]){const wall=photoWall(photos.slice(0,count),350,10,52,37);assert.equal(wall.items.length,count);assert.ok(wall.height>0);assert.ok(wall.items.every(p=>p.width>0&&p.height>0));}
 assert.deepEqual(photoWall([],686),{height:0,items:[]});for(const p of photoWall([{width:0,height:0},{width:NaN,height:1}],686).items)assert.ok(Number.isFinite(p.height));
});
