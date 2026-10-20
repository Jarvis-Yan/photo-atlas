const test=require('node:test');const assert=require('node:assert/strict');const {columns}=require('../utils/waterfall');
test('mixed orientation packing preserves every photo and append positions without cropping',()=>{
 const photos=Array.from({length:18},(_,i)=>({id:String(i),width:i%3?400:900,height:600}));
 const packed=columns(photos);assert.equal(new Set(packed.flatMap(c=>c.photos.map(p=>p.id))).size,18);
 for(const c of packed)for(const p of c.photos)assert.equal(p.cardHeight,Math.round(333*p.height/p.width));
 const next=columns([...photos,{id:'more',width:400,height:600}]);
 packed.forEach((c,i)=>assert.deepEqual(next[i].photos.slice(0,c.photos.length),c.photos));
 assert.ok(Math.abs(packed[0].height-packed[1].height)<=628);
 assert.deepEqual(packed.map(c=>c.direction),['normal','reverse']);
});
test('motion follows visibility/activity and disconnects on detach',()=>{
 let definition,disconnected=0;
 require('node:vm').runInNewContext(require('node:fs').readFileSync(require.resolve('../components/photo-waterfall/index.js'),'utf8'),{require:()=>({columns}),Component:c=>definition=c});
 const component={data:{active:true,flow:true,eligible:true,running:false},_attached:true,_visible:true,setData(p){Object.assign(this.data,p);},...definition.methods};
 component.updateMotion();assert.equal(component.data.running,true);
 component.data.active=false;component.activity();assert.equal(component.data.running,false);
 component.data.active=true;component._visible=false;component.updateMotion();assert.equal(component.data.running,false);
 component._observer={disconnect(){disconnected++;}};definition.lifetimes.detached.call(component);assert.equal(disconnected,1);assert.equal(component._attached,false);
});
test('render-layer drag preserves the other column and suppresses accidental tap',()=>{
 const nodes={};let time=1000,calls=[];
 for(const key of ['left','right'])for(const kind of ['column','track','position'])nodes['.'+kind+'-'+key]={state:{},style:{},getState(){return this.state;},setStyle(s){Object.assign(this.style,s);}};
 const owner={selectComponent:s=>nodes[s],callMethod:(name,data)=>calls.push({name,data})};const sandbox={module:{exports:{}},getDate:()=>({getTime:()=>time}),Math};
 require('node:vm').runInNewContext(require('node:fs').readFileSync(require.resolve('../components/photo-waterfall/index.wxml'),'utf8').split('<wxs module="gesture">')[1].split('</wxs>')[0],sandbox);const g=sandbox.module.exports;
 for(const key of ['left','right'])g.changed(key+':2000:2:true:true:1','',owner,nodes['.column-'+key]);
 const e=y=>({currentTarget:{dataset:{key:'left'}},touches:[{clientY:y}]});g.start(e(100),owner);g.move(e(200),owner);
 assert.equal(nodes['.track-left'].style['animation-play-state'],'paused');assert.equal(nodes['.track-right'].style['animation-play-state'],'running');assert.equal(nodes['.position-left'].style.transform,'translate3d(0,-1800rpx,0)');
 g.end(e(200),owner);assert.equal(nodes['.track-left'].style['animation-play-state'],'running');assert.equal(nodes['.position-left'].style.transform,'translate3d(0,-1800rpx,0)');
 const tap={currentTarget:{dataset:{key:'left',id:'photo'}}};g.tap(tap,owner);assert.equal(calls.length,0);time+=600;g.tap(tap,owner);assert.equal(calls.length,1);assert.equal(calls[0].data.id,'photo');
 g.changed('left:2000:2:true:false:1','',owner,nodes['.column-left']);assert.equal(nodes['.track-left'].style['animation-play-state'],'paused');
});
