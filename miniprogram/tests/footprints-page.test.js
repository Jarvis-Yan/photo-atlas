const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),fp=require('../utils/footprints');
function fixture(window={windowWidth:390,windowHeight:600},wxExtras={}){let page,id=0;const jobs=new Map();vm.runInNewContext(fs.readFileSync(require.resolve('../pages/footprints/index.js'),'utf8'),{require:path=>path.includes('viewer-session')?{restoreViewer(){}}:path.includes('place-reference')?require('../utils/place-reference'):path.includes('map-camera')?require('../utils/map-camera'):path.includes('footprints')?fp:path.includes('api')?{message:e=>e.message}:{pageTheme(){}},Page:value=>page=value,setTimeout:fn=>{jobs.set(++id,fn);return id},clearTimeout:key=>jobs.delete(key),getApp:()=>({globalData:{}}),wx:Object.assign({getWindowInfo:()=>window},wxExtras)});let context;Object.defineProperty(page,'_mapContext',{get:()=>context,set(value){if(value&&!value.getRegion){let bounds;const include=value.includePoints;value.includePoints=options=>{bounds=options.points;include(options);};value.getRegion=options=>options.success({southwest:{latitude:Math.min(...bounds.map(p=>p.latitude)),longitude:Math.min(...bounds.map(p=>p.longitude))},northeast:{latitude:Math.max(...bounds.map(p=>p.latitude)),longitude:Math.max(...bounds.map(p=>p.longitude))}});}context=value;}});page.setData=function(patch,done){Object.assign(this.data,patch);if(done)done()};page.data.photos=[{id:'a',year:2025,position:0,title:'A',captured:{value:'2025-01'},locationText:'济南',geo:{label:'济南',latitude:36,longitude:117}},{id:'b',year:2024,position:1,title:'B',captured:{value:'2024-01'},locationText:'上海',geo:{label:'上海',latitude:31,longitude:121}}];page.data.from=2024;page.data.to=2025;page.data.loading=false;page.render();return{page,jobs,flush(){for(const [key,fn]of jobs){jobs.delete(key);fn()}}};}
test('map commits only after release and settling; returning to origin restores all places',()=>{const f=fixture(),p=f.page;assert.equal(p.data.mapTitle,'全部足迹');assert.equal(p.data.markers.length,2);p._scrollY=500;p._currentDay=1;p._currentPhoto='b';p._dragging=true;p.scheduleMap();f.flush();assert.equal(p.data.mapTitle,'全部足迹');p.endSeek();assert.equal(p.data.mapTitle,'全部足迹');f.flush();assert.equal(p.data.latitude,31);assert.equal(p.data.mapTitle,'2024 年 1 月 · 日待补充');p._scrollY=0;p.scheduleMap();f.flush();assert.equal(p.data.mapTitle,'全部足迹');assert.equal(p.data.includePoints.length,2);});
test('named locations without coordinates stay filterable without making a fake map point',()=>{const p=fixture().page;p.data.photos.push({id:'unknown',year:2025,geo:{label:'地点待定位'}});p.render();assert.ok(p.data.placeLabels.some(label=>label.includes('地点待定位')));assert.equal(p.data.markers.length,2);});
test('dragging interpolates continuously and waits for release to snap',()=>{const f=fixture(),p=f.page;p._stops=[0,100,1000,2000];p.data.railTop=200;p.data.railHeight=100;p.startSeek({touches:[{clientY:250}]});assert.equal(p.data.scrollTop,550);assert.equal(f.jobs.size,0);p.moveSeek({touches:[{clientY:300}]});assert.equal(p.data.scrollTop,550);p.endSeek();assert.equal(p.data.scrollTop,2000);assert.equal(f.jobs.size,1);});
test('native map fits only nonempty multi-point bounds; single and unknown places use a safe center',()=>{const f=fixture(),p=f.page,calls=[];p._mapContext={includePoints:options=>{calls.push(options.points);options.success();},moveToLocation:options=>options.success()};p._mapSelection=undefined;p.commitMap();assert.equal(calls.length,1);assert.equal(calls[0].length,2);p.data.shown=[p.data.photos[0]];p._mapSelection=undefined;p.commitMap();assert.equal(calls.length,2);assert.equal(p.data.latitude,36);p.data.shown=[{id:'unknown',geo:{label:'待定位'}}];p._mapSelection=undefined;p.commitMap();assert.equal(calls.length,3);assert.equal(p.data.latitude,32);assert.equal(p.data.longitude,112);});

test('rapid move events coalesce, native scrolling avoids scrollTop setData, and final target is retained',()=>{
 const f=fixture(),p=f.page,calls=[],patches=[];const original=p.setData;p.setData=function(patch,done){patches.push(patch);original.call(this,patch,done);};p._scrollContext={scrollTo:options=>calls.push(options)};p._stops=[0,100,1000,2000];p.data.railTop=200;p.data.railHeight=100;
 p.startSeek({touches:[{clientY:200}]});for(let i=1;i<=120;i++)p.moveSeek({touches:[{clientY:200+i/120*100}]});
 assert.equal(calls.length,0);p.onScroll({detail:{scrollTop:50}});assert.equal(p._scrollY,0);assert.equal(p.data.mapTitle,'全部足迹');
 p.endSeek();assert.equal(calls.length,1);assert.equal(calls[0].top,2000);assert.equal(calls[0].animated,false);assert.ok(patches.every(patch=>!('scrollTop' in patch)));assert.equal(p.data.ticks.length,4);f.flush();assert.equal(p.data.mapTitle,'2024 年 1 月 · 日待补充');
});
test('all timeline ticks remain visible with short distant ticks',()=>{const p=fixture().page;p._stops=Array.from({length:17},(_,i)=>i*100);p.data.groups=Array.from({length:15},(_,i)=>({key:'2026-10-'+String(31-i).padStart(2,'0'),items:[]}));p._scrollY=800;p.updateTracking();assert.equal(p.data.ticks.length,17);assert.equal(p.data.ticks[8].width,50);assert.equal(p.data.ticks[0].width,7);assert.equal(p.data.ticks[16].width,7);assert.ok(p.data.ticks[7].width>p.data.ticks[6].width);});
test('map enlarges responsively and rail is exactly centered without changing frame during scrolling',()=>{for(const [width,height]of [[390,600],[320,420],[430,760]]){const p=fixture({windowWidth:width,windowHeight:height}).page;p.resize.call(Object.assign(Object.create(p),{setData(patch){assert.ok(patch.mapHeight>=120);assert.ok(patch.storyHeight>=180);assert.equal(patch.railTop+patch.railHeight/2,height/2);assert.ok(Math.abs(patch.fixedHeight+patch.storyHeight-height)<.01);}}));}});

test('returning to origin also works on fallback clients after manual scrolling',()=>{const p=fixture().page,values=[],original=p.setData;p.setData=function(patch,done){if('scrollTop'in patch)values.push(patch.scrollTop);original.call(this,patch,done)};p.data.scrollTop=0;p._scrollY=900;p.top();assert.deepEqual(values,[1,0]);assert.equal(p._scrollY,0);});
test('a day boundary never borrows the previous day photo; repeated scrolling does not refit the same selection',()=>{
 const f=fixture(),p=f.page;
 p.data.photos=[{id:'hongkong',year:2026,position:0,captured:{value:'2026-04-30'},geo:{label:'香港',latitude:22,longitude:114}},{id:'yinchuan',year:2026,position:1,captured:{value:'2026-04-01'},geo:{label:'银川',latitude:38,longitude:106}}];
 p.data.from=p.data.to=2026;p.render();p._stops=[0,100,1000,2000];
 p._photoStops=[{id:'hongkong',top:150,left:0},{id:'yinchuan',top:1100,left:0}];
 p._scrollY=1000;p.updateTracking();
 assert.equal(p.data.timeLabel,'2026-04-01');assert.equal(p._currentPhoto,'yinchuan');
 p.commitMap();assert.equal(p.data.latitude,38);assert.equal(p.data.markers.length,1);
 const patches=[],original=p.setData;p.setData=function(patch,done){patches.push(patch);original.call(this,patch,done)};
 p._scrollY=1050;p.updateTracking();p.commitMap();
 assert.ok(patches.every(patch=>!('latitude' in patch)&&!('markers' in patch)));
 p._scrollY=110;p.updateTracking();p.commitMap();assert.equal(p.data.latitude,22);assert.equal(p.data.timeLabel,'2026-04-30');
});
test('returning after a drag restores image upgrades and reschedules the map',()=>{
 const f=fixture(),p=f.page;p.data.previewUpgrade=false;p._dragging=true;p.onHide();p.onShow();
 assert.equal(p.data.previewUpgrade,true);assert.equal(p._dragging,false);assert.equal(f.jobs.size,1);
});
test('date to overview to the same date moves the native camera even with unchanged page coordinates',()=>{
 const f=fixture(),p=f.page,calls=[];
 p._mapContext={includePoints:o=>{calls.push(o.points);o.success();}};
 p._mapSelection=undefined;p.commitMap();p._scrollY=500;p._currentDay=1;p._currentPhoto='b';p.commitMap();
 assert.equal(p.data.latitude,31);p._scrollY=0;p.commitMap();assert.equal(p.data.latitude,31);
 p._scrollY=500;p.commitMap();assert.equal(calls.length,4);assert.deepEqual(calls[1],calls[3]);assert.notDeepEqual(calls[0],calls[1]);
});
test('an obsolete setData callback never sends the previous date to the native camera',()=>{
 const f=fixture(),p=f.page,callbacks=[],calls=[];
 p._mapContext={includePoints:o=>{calls.push(o.points);o.success();}};
 p.setData=function(patch,done){Object.assign(this.data,patch);if(done)callbacks.push(done);};
 p._scrollY=500;p._currentDay=0;p._currentPhoto='a';p.commitMap();p._currentDay=1;p._currentPhoto='b';p.commitMap();
 callbacks[0]();callbacks[1]();assert.equal(calls.length,1);assert.ok(calls[0][0].latitude<31&&calls[0][1].latitude>31);
});
test('a native map error clears the applied selection so the same date can recover',()=>{
 const p=fixture().page,calls=[];p._mapContext={includePoints:o=>{calls.push(o.points);o.success();}};
 p._scrollY=500;p._currentDay=1;p._currentPhoto='b';p.commitMap();p.mapFailed();assert.ok(p.data.mapError);
 p.commitMap();assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.equal(p.data.mapError,'');
});

test('a frozen native map is remounted once without changing the fixed map frame',()=>{
 const context={includePoints:o=>o.success(),getRegion:o=>o.success({southwest:{latitude:30,longitude:120},northeast:{latitude:32,longitude:122}})};
 const f=fixture(undefined,{createMapContext:()=>context,nextTick:fn=>fn()}),p=f.page,patches=[],original=p.setData;
 p.setData=function(patch,done){patches.push(patch);original.call(this,patch,done);};
 p.data.latitude=31;p.data.longitude=121;p._hidden=false;p._dragging=true;p.remountMap();
 assert.ok(patches.some(p=>p.mapMounted===false));assert.ok(patches.some(p=>p.mapMounted===true));
 assert.equal(p.data.mapLatitude,31);assert.equal(p.data.mapLongitude,121);assert.equal(p.data.mapMounted,true);
 assert.ok(patches.every(p=>!('fixedHeight' in p)&&!('mapHeight' in p)&&!('storyHeight' in p)));
});
test('native camera bindings stay stable while logical photo coordinates change',()=>{
 const p=fixture().page;p._scrollY=500;p._currentDay=1;p._currentPhoto='b';p.commitMap();
 assert.equal(p.data.latitude,31);assert.equal(p.data.mapLatitude,32);assert.equal(p.data.mapLongitude,112);
 const markup=fs.readFileSync(require.resolve('../pages/footprints/index.wxml'),'utf8');
 assert.ok(markup.includes('latitude="{{mapLatitude}}"'));assert.ok(!markup.includes('latitude="{{latitude}}"'));
});
test('Shanghai to 2025-10-26 Liupan without coordinates moves to Liupan area rather than retaining Shanghai',()=>{
 const p=fixture().page;
 p.data.photos=[{id:'shanghai',year:2025,position:0,captured:{value:'2025-12-31'},geo:{label:'上海',latitude:31.23,longitude:121.47}}, {id:'pine-road',year:2025,position:1,captured:{value:'2025-10-26'},locationText:'宁夏 六盘山 · 2025-10-26',geo:{label:'宁夏 六盘山',status:'named',precision:'place'}}];
 p.data.from=p.data.to=2025;p.render();p._scrollY=500;p._currentDay=0;p._currentPhoto='shanghai';p.commitMap();assert.equal(p.data.latitude,31.23);
 p._currentDay=1;p._currentPhoto='pine-road';p.commitMap();assert.equal(p.data.mapTitle,'2025 年 10 月 26 日');assert.equal(p.data.latitude,35.66);assert.equal(p.data.longitude,106.21);assert.equal(p.data.mapArea,true);assert.equal(p.data.markers.length,0);assert.ok(p.data.mapDescription.includes('地点范围'));assert.equal(p.data.photos[1].geo.latitude,undefined);
});
test('an unknown location clears previous photo markers and shows an overview with a coordinate notice',()=>{
 const p=fixture().page;p.data.photos.push({id:'unlocated',year:2024,position:2,captured:{value:'2024-01-02'},geo:{label:'未核实地点',status:'named'}});p.render();
 p._scrollY=500;p._currentDay=p.data.groups.findIndex(g=>g.items.some(p=>p.id==='unlocated'));p._currentPhoto='unlocated';p.data.latitude=31.23;p.data.longitude=121.47;p.commitMap();
 assert.equal(p.data.mapUnavailable,true);assert.equal(p.data.mapArea,false);assert.equal(p.data.markers.length,0);assert.equal(p.data.latitude,32);assert.equal(p.data.longitude,112);assert.equal(p.data.includePoints.length,2);assert.ok(p.data.mapDescription.includes('坐标待补充'));
});
test('overview of a filtered named-only place also displays that place area rather than the previous city',()=>{
 const p=fixture().page;p.data.photos=[{id:'desert',year:2025,position:0,captured:{value:'2025-08-01'},geo:{label:'内蒙古 库布齐沙漠',status:'named'}}];p.render();
 assert.equal(p.data.mapArea,true);assert.equal(p.data.latitude,40.53);assert.equal(p.data.longitude,107.93);assert.equal(p.data.scale,6);assert.equal(p.data.markers.length,0);
});
test('rail stays between headings while held; release snaps smoothly and a new gesture cancels it',()=>{
 const f=fixture(),p=f.page,calls=[];p._stops=[0,100,1000,2000];p.data.railTop=200;p.data.railHeight=100;p._scrollContext={scrollTo:o=>calls.push(o)};
 p.startSeek({touches:[{clientY:251}]});const continuous=fp.scrollForTimeline(p._stops,.51);assert.ok(Math.abs(calls[0].top-continuous)<.001);assert.equal(f.jobs.size,0);
 assert.equal(p.data.mapTitle,'全部足迹');p.endSeek();assert.equal(calls.length,1);const label=p.data.timeLabel;p.snapSeek();assert.equal(p.data.timeLabel,label);assert.equal(calls[1].top,100);assert.equal(calls[1].animated,true);
 p.startSeek({touches:[{clientY:240}]});p.endSeek();p.storyTouch();const count=calls.length;p.snapSeek();assert.equal(calls.length,count);
});
test('same date in Tokyo and Kamakura uses separate map groups and never borrows another visit photo',()=>{
 const p=fixture().page;p.data.photos=[{id:'tokyo',year:2026,position:0,captured:{value:'2026-10-07'},geo:{label:'日本 东京',latitude:35.68,longitude:139.69}},{id:'kamakura',year:2026,position:1,captured:{value:'2026-10-07'},geo:{label:'日本 镰仓',latitude:35.31,longitude:139.55}}];p.data.from=p.data.to=2026;p.render();assert.equal(p.data.groups.length,2);p._stops=[0,100,1000,1000];p._photoStops=[{id:'tokyo',top:150,left:0},{id:'kamakura',top:1050,left:0}];p._scrollY=1000;p.updateTracking();p.commitMap();assert.equal(p._currentPhoto,'kamakura');assert.equal(p.data.latitude,35.31);assert.equal(p.data.markers.length,1);
});

test('release keeps the rail date-place selection when the next visit is closer',()=>{
 const f=fixture(),p=f.page,calls=[];
 p.data.photos=[{id:'tokyo',year:2026,position:0,captured:{value:'2026-10-07'},geo:{label:'日本 东京',latitude:35.68,longitude:139.69}},{id:'kamakura',year:2026,position:1,captured:{value:'2026-10-07'},geo:{label:'日本 镰仓',latitude:35.31,longitude:139.55}}];p.data.from=p.data.to=2026;p.render();
 p._stops=[0,100,1000,1000];p.data.railTop=200;p.data.railHeight=100;p._scrollContext={scrollTo:o=>calls.push(o)};
 p.startSeek({touches:[{clientY:251}]});assert.ok(p._scrollY>550);assert.equal(p.data.timeLabel,'2026-10-07');assert.equal(p._currentPhoto,'tokyo');
 p.endSeek();p.snapSeek();assert.equal(calls.at(-1).top,100);assert.equal(p._currentPhoto,'tokyo');f.flush();assert.equal(p.data.latitude,35.68);
 p.startSeek({touches:[{clientY:200+100*2/3}]});p.endSeek();p.snapSeek();f.flush();assert.equal(p._currentPhoto,'kamakura');assert.equal(p.data.latitude,35.31);
});

test('returning from a viewer positions the photo inside the fixed-map story only',()=>{
 let selected=[],callback;const query={in(){return this},select(selector){selected.push(selector);return this},selectAll(){return this},boundingClientRect(){return this},exec(fn){callback=fn}};
 const f=fixture(undefined,{createSelectorQuery:()=>query}),p=f.page,calls=[];p._scrollY=400;p._scrollContext={scrollTo:o=>calls.push(o)};p.revealPhoto('target');callback([{top:220},{top:830}]);assert.equal(calls[0].top,994);assert.equal(calls[0].animated,false);assert.ok(selected.includes('#atlas-photo-target'));assert.equal(p._snapPending,false);
});
