const test=require('node:test');const assert=require('node:assert/strict');const fp=require('../utils/footprints');
const photos=[{id:'a',title:'A',position:1,year:2024,thumbnail:'a',captured:{value:'2024-06'},geo:{label:'杭州',latitude:30,longitude:120}},{id:'b',title:'B',position:2,year:2025,thumbnail:'b',captured:{value:'2025'},geo:{label:'杭州',latitude:30.1,longitude:120.1,status:'approximate'}},{id:'c',title:'C',position:3,year:0,thumbnail:'c',captured:{},geo:{}}];
test('timeline keeps or removes undated photos explicitly',()=>{assert.deepEqual(fp.filterPhotos(photos,{from:2024,to:2024,includeUndated:true}).map(p=>p.id),['a','c']);assert.deepEqual(fp.filterPhotos(photos,{from:2024,to:2024,includeUndated:false}).map(p=>p.id),['a']);});
test('place, calendar and marker models stay deterministic',()=>{assert.deepEqual(fp.places(photos).map(p=>[p.label,p.count,p.approximate]),[['杭州',2,true]]);assert.deepEqual(fp.groups(photos).map(g=>g.key),['2025','2024-06','undated']);assert.equal(fp.markers(photos).length,2);assert.equal(fp.markers(photos)[0].photoId,'a');});
test('categories and keywords intersect locally, while invalid coordinates never create markers',()=>{const data=[...photos,{id:'bad',title:'杭州城',category:'城市',tags:['雨'],year:2025,geo:{label:'杭州',latitude:100,longitude:120}}];assert.deepEqual(fp.filterPhotos(data,{includeUndated:true,category:'城市',query:'雨'}).map(p=>p.id),['bad']);assert.equal(fp.markers(data).length,2);assert.ok(fp.markers(data).every(m=>Number.isInteger(m.width)&&m.iconPath.startsWith('/assets/')));});
test('time rail interpolates unequal sections with bounded endpoints',()=>{const stops=[0,80,1200,2500];for(const value of [0,.1,.4,.7,1]){const y=fp.scrollForTimeline(stops,value);assert.ok(Math.abs(fp.timelineForScroll(stops,y)-value)<.00001);}assert.equal(fp.scrollForTimeline(stops,-1),0);assert.equal(fp.scrollForTimeline(stops,2),2500);});
test('same-month photos split by day and labels preserve incomplete dates honestly',()=>{
 const daily=fp.groups([{id:'a',position:0,captured:{value:'2026-04-01'}},{id:'b',position:1,captured:{value:'2026-04-30'}},{id:'c',position:2,captured:{value:'2026-04'}}]);
 assert.deepEqual(daily.map(group=>group.key),['2026-04-30','2026-04-01','2026-04']);
 assert.equal(daily[0].title,'2026 年 4 月 30 日');
 assert.equal(fp.dateLabel(daily[0].key),'2026-04-30');
 assert.equal(daily[2].title,'2026 年 4 月 · 日待补充');
});
test('time rail lands on the nearest date heading rather than halfway through that day photos',()=>{
 const stops=[0,100,1000,2000];assert.equal(fp.snapTimeline(stops,.5),1000);
 for(let i=0;i<stops.length;i++)for(const delta of [-.1,0,.1])assert.equal(fp.snapTimeline(stops,(i+delta)/(stops.length-1)),stops[i]);
 assert.equal(fp.snapTimeline([],1),0);assert.equal(fp.snapTimeline(stops,-1),0);assert.equal(fp.snapTimeline(stops,2),2000);
});
test('the last short date gains only enough trailing space to align its heading',()=>{
 const layout=fp.dateTimeline([220,1300,1900],2150,600,0,16);
 assert.equal(layout.tail,334);assert.equal(layout.max,1884);assert.deepEqual(layout.stops,[0,204,1284,1884,1884]);
 assert.deepEqual(fp.dateTimeline([220,1300,1900],2484,600,334,16),layout);
 assert.equal(fp.dateTimeline([220,1300],2400,600,0,16).tail,0);
 assert.deepEqual(fp.dateTimeline([220,1300],2400,600,0,16).stops,[0,204,1284,1284]);
});
