const test=require('node:test'),assert=require('node:assert/strict');
const {createMapCamera,cameraBounds,regionMatches}=require('../utils/map-camera');
function box(points){return{southwest:{latitude:Math.min(...points.map(p=>p.latitude)),longitude:Math.min(...points.map(p=>p.longitude))},northeast:{latitude:Math.max(...points.map(p=>p.latitude)),longitude:Math.max(...points.map(p=>p.longitude))}};}
function fixture(){
 const calls=[],jobs=new Map();let id=0,now=0,paused=false,errors=0,successes=0,region=box(cameraBounds(32,112,3,320,180));
 const context={includePoints:options=>calls.push({...options,success(move=true){if(move)region=box(options.points);options.success();}}),getRegion:options=>options.success(region)};
 const camera=createMapCamera({getContext:()=>context,isPaused:()=>paused,onError:()=>errors++,onSuccess:()=>successes++,setTimer:(fn,delay)=>{jobs.set(++id,{fn,at:now+delay});return id;},clearTimer:key=>jobs.delete(key)});
 function advance(ms){const end=now+ms;let limit=10000;while(limit--){const entry=[...jobs].sort((a,b)=>a[1].at-b[1].at)[0];if(!entry||entry[1].at>end)break;now=entry[1].at;jobs.delete(entry[0]);entry[1].fn();}if(limit<=0)throw Error('timer loop');now=end;}
 return{camera,calls,jobs,advance,pause(value){paused=value;},next(){const task=[...jobs.values()].sort((a,b)=>a.at-b.at)[0];advance(task.at-now);},setRegion(points){region=box(points);},get region(){return region;},get errors(){return errors;},get successes(){return successes;}};
}
const point=(key,latitude=31,longitude=121)=>({key,points:cameraBounds(latitude,longitude,10,320,180)});
const overview={key:'overview',points:[{latitude:31,longitude:121},{latitude:38,longitude:106}]};
test('native acceptance without camera movement is never reported as a completed selection',()=>{
 const f=fixture(),plan=point('a');f.camera.submit(plan);f.calls[0].success(false);
 assert.equal(f.successes,0);f.advance(500);assert.equal(f.successes,0);
 f.setRegion(plan.points);f.advance(150);assert.equal(f.successes,1);assert.equal(f.jobs.size,0);
});
test('revisiting unchanged coordinates after overview issues a verified native move',()=>{
 const f=fixture();f.camera.submit(point('a'));f.calls[0].success();f.camera.submit(overview);f.calls[1].success();
 f.camera.submit(point('a'));f.calls[2].success();f.camera.submit(point('a'));assert.equal(f.calls.length,3);assert.equal(f.successes,3);
});
test('the newest date wins when several selections arrive during native animation',()=>{
 const f=fixture();f.camera.submit(overview);f.camera.submit(point('a'));f.camera.submit(point('b',38));
 assert.equal(f.calls.length,1);f.calls[0].success();assert.equal(f.calls.length,2);f.calls[1].success();
 assert.ok(regionMatches(point('b',38).points,f.region));assert.equal(f.successes,1);assert.equal(f.jobs.size,0);
});
test('accepted no-op commands time out and retry instead of leaving the camera stuck',()=>{
 const f=fixture();f.camera.submit(point('a'));f.calls[0].success(false);f.advance(2750);
 assert.equal(f.calls.length,2);assert.equal(f.successes,0);f.calls[1].success();assert.equal(f.successes,1);assert.equal(f.jobs.size,0);
});
test('an obsolete late animation end repairs the viewport back to the latest selected date',()=>{
 const f=fixture();f.camera.submit(overview);f.next();f.camera.submit(point('a'));f.calls[1].success();
 f.calls[0].success();assert.equal(f.calls.length,3);f.calls[2].success();
 f.setRegion(overview.points);f.camera.regionChanged({type:'end',detail:{causedBy:'update'}});assert.equal(f.calls.length,4);f.calls[3].success();
 assert.ok(regionMatches(point('a').points,f.region));assert.equal(f.jobs.size,0);
});
test('manual map gestures are preserved and hidden or unloaded pages never start native work',()=>{
 const f=fixture();f.camera.submit(point('a'));f.calls[0].success();f.setRegion(overview.points);
 f.camera.regionChanged({type:'end',detail:{causedBy:'gesture'}});assert.equal(f.calls.length,1);
 f.pause(true);f.camera.invalidate();f.camera.submit(point('b'));assert.equal(f.calls.length,1);
 f.pause(false);f.camera.submit(point('b'));assert.equal(f.calls.length,2);f.camera.dispose();f.calls[1].success();assert.equal(f.jobs.size,0);
});
test('persistent native failures are bounded and expose recovery rather than looping forever',()=>{
 const f=fixture();f.camera.submit(point('a'));f.calls[0].fail({errMsg:'busy'});f.next();f.calls[1].fail({errMsg:'busy'});f.next();f.calls[2].fail({errMsg:'busy'});
 assert.equal(f.errors,1);assert.equal(f.jobs.size,0);assert.equal(f.calls.length,3);
});
test('800 repeated date switches with accepted no-ops always end on the latest viewport',()=>{
 const f=fixture();let target;
 for(let i=0;i<800;i++){
  target=i%2?point('yinchuan-'+i,38,106):point('hongkong-'+i,22,114);
  f.camera.invalidate();f.camera.submit(target);f.calls.at(-1).success(i%7!==0);
  if(i%7===0){assert.equal(regionMatches(target.points,f.region),false);f.advance(2750);f.calls.at(-1).success();}
  assert.ok(regionMatches(target.points,f.region),'selection '+i);assert.equal(f.jobs.size,0);
 }
 assert.equal(f.errors,0);assert.equal(f.successes,800);
});
test('viewport matching rejects stale centers and a zoomed-out world containing the photo',()=>{
 const target=point('a');assert.ok(regionMatches(target.points,box(target.points)));
 assert.equal(regionMatches(target.points,box(point('elsewhere',38,106).points)),false);
 assert.equal(regionMatches(target.points,{southwest:{latitude:-80,longitude:-180},northeast:{latitude:80,longitude:180}}),false);
 assert.equal(regionMatches(target.points,{}),false);
});
test('focused bounds preserve the requested Mercator center without phone location access',()=>{
 for(const [lat,lon]of [[31,121],[38,106],[-33,151],[35,139]]){const points=cameraBounds(lat,lon,10,320,180),y=p=>Math.log(Math.tan(Math.PI/4+p.latitude*Math.PI/360));assert.ok(Math.abs((y(points[0])+y(points[1]))/2-y({latitude:lat}))<1e-10);assert.ok(Math.abs((points[0].longitude+points[1].longitude)/2-lon)<1e-10);}
});
