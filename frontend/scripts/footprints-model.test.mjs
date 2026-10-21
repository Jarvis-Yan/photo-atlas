import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
const exports={};
const code=ts.transpileModule(readFileSync(new URL('../src/scripts/footprints-model.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{exports});
const {filterPhotos,photoYear,located,placeGroups,dayGroups}=exports;
const photo=(id,options={})=>({id,title:'荷花',caption:'旅行记录',alt:'荷塘',tags:['自然'],category:'自然',position:0,captured:{value:'2026-07-11'},geo:{label:'山东 济南',latitude:36.67,longitude:116.99},...options});
const filter={category:'',query:'',place:'',from:2024,to:2026,includeUndated:true};
const ids=list=>Array.from(list,item=>item.id);
test('place, subject, keywords and time filters intersect without leaking other places',()=>{
  const items=[photo('a'),photo('b',{geo:{label:'浙江 杭州'}}),photo('c',{category:'城市'}),photo('d',{captured:{value:'2025-07-11'}})];
  const found=filterPhotos(items,{...filter,category:'自然',query:'济南 荷花',place:'山东 济南',from:2026,to:2026});
  assert.deepEqual(ids(found),['a']);
  assert.equal(filterPhotos(items,{...filter,place:'不存在的地点'}).length,0);
});
test('undated works follow the explicit option, not the selected year range',()=>{
  const items=[photo('dated'),photo('unknown',{captured:undefined})];
  assert.deepEqual(ids(filterPhotos(items,{...filter,from:2025,to:2025})),['unknown']);
  assert.equal(filterPhotos(items,{...filter,from:2025,to:2025,includeUndated:false}).length,0);
  assert.equal(photoYear(photo('invalid',{captured:{value:'not-a-date'}})),0);
});
test('chronology and daily grouping retain year-only dates without mutating the input',()=>{
  const items=[photo('old',{captured:{value:'2024'}}),photo('new'),photo('unknown',{captured:undefined})];
  const ordered=filterPhotos(items,filter);
  assert.deepEqual(ids(ordered),['new','old','unknown']);assert.deepEqual(ids(items),['old','new','unknown']);
  assert.deepEqual(Array.from(dayGroups(ordered).keys()),['2026-07-11','2024','undated']);
});
test('different days in one month remain separate, and partial dates never invent a day',()=>{
 const items=filterPhotos([photo('yinchuan',{captured:{value:'2026-04-01'}}),photo('hongkong',{captured:{value:'2026-04-30'}}),photo('partial',{captured:{value:'2026-04'}})],filter);
 assert.deepEqual(Array.from(dayGroups(items).keys()),['2026-04-30','2026-04-01','2026-04']);
 assert.equal(exports.dayTitle('2026-04-30'),'2026 年 4 月 30 日');
 assert.equal(exports.dayLabel('2026-04-30'),'2026-04-30');
 assert.equal(exports.dayTitle('2026-04'),'2026 年 4 月 · 日待补充');
});
test('place totals include named works while invalid coordinates never become map points',()=>{
  const items=[photo('a'),photo('b',{geo:{label:'山东 济南'}}),photo('c',{geo:{label:'浙江 杭州',latitude:91,longitude:120}})];
  const groups=placeGroups(items);assert.equal(groups.get('山东 济南').length,2);
  assert.equal(located(items[0]),true);assert.equal(located(items[1]),false);assert.equal(located(items[2]),false);
  assert.equal(located(photo('nan',{geo:{latitude:NaN,longitude:120}})),false);
});

test('time rail interpolates actual, unequal section heights rather than assuming equal page lengths',()=>{
  const stops=[120,960,1400,4200];
  assert.equal(exports.scrollForTimeline(stops,1/3),960);
  assert.equal(exports.scrollForTimeline(stops,2/3),1400);
  for(let i=0;i<=100;i++){
    const progress=i/100;
    const position=exports.scrollForTimeline(stops,progress);
    assert.ok(Math.abs(exports.timelineForScroll(stops,position)-progress)<1e-9);
  }
});
test('rail endpoints and collapsed sections stay bounded and monotonic',()=>{
  const stops=[0,0,400,400,900];let previous=-1;
  assert.equal(exports.scrollForTimeline(stops,-1),0);
  assert.equal(exports.scrollForTimeline(stops,2),900);
  assert.equal(exports.timelineForScroll([0,0,0],0),0);
  for(let y=0;y<=900;y+=10){const value=exports.timelineForScroll(stops,y);assert.ok(Number.isFinite(value)&&value>=previous&&value>=0&&value<=1);previous=value}
  assert.equal(exports.scrollForTimeline([],0.5),0);assert.equal(exports.timelineForScroll([],100),0);
});
test('rail selection snaps to date headings including a short final date on both clients',()=>{
 const stops=[0,100,1000,2000];assert.equal(exports.snapTimeline(stops,.5),1000);
 for(let i=0;i<stops.length;i++)assert.equal(exports.snapTimeline(stops,i/(stops.length-1)),stops[i]);
 const layout=exports.dateTimeline([220,1300,1900],2150,600,0,16);
 assert.equal(layout.tail,334);assert.deepEqual(Array.from(layout.stops),[0,204,1284,1884,1884]);
 assert.equal(exports.dateTimeline([220,1300,1900],2484,600,334,16).tail,334);
 assert.deepEqual(Array.from(exports.dateTimeline([220,1300],2400,600,0,16).stops),[0,204,1284,1284]);
});

test('date and place keys split a mixed-location day without losing photos or unknown places',()=>{
 const visits=exports.visitGroups([photo('tokyo',{geo:{label:'日本 东京'}}),photo('kamakura',{geo:{label:'日本 镰仓'}}),photo('tokyo2',{geo:{label:'日本 东京'}}),photo('unknown',{geo:{}})]);
 assert.equal(visits.size,3);assert.deepEqual(Array.from(visits.values(),list=>ids(list)),[['tokyo','tokyo2'],['kamakura'],['unknown']]);const key=Array.from(visits.keys())[1];assert.equal(exports.visitPlace(key),'日本 镰仓');assert.equal(exports.visitDate(key),'2026-07-11');assert.ok(exports.visitTitle(key).includes('日本 镰仓'));
});
test('release follows the displayed rail group even when the next heading is physically closer',()=>{
 const stops=[0,100,1000,1000];
 const y=exports.scrollForTimeline(stops,.51);assert.ok(y>550&&y<1000);
 assert.equal(exports.displayedHeadingIndex(stops,y),1);
 assert.equal(stops[exports.displayedHeadingIndex(stops,y)],100);
 assert.equal(exports.displayedHeadingIndex(stops,1000),2);
 assert.equal(exports.displayedHeadingIndex(stops,0),0);
 assert.equal(exports.displayedHeadingIndex([],100),0);
});
