const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 let definition,now=1000,disconnected=false;const events=[],patches=[];
 vm.runInNewContext(fs.readFileSync(require.resolve('../components/featured-cover/index.js'),'utf8'),{require:()=>({absolute:p=>'https://portfolio.example'+p}),Component:d=>definition=d,Date:{now:()=>now}});
 const photos=Array.from({length:12},(_,i)=>({id:'p'+i,title:'作品'+i,thumbnail:'https://portfolio.example/media/p'+i+'/480.webp'}));
 const c={data:{...definition.data,photos,active:true},...definition.methods,setData(p){patches.push(p);for(const [key,value] of Object.entries(p)){const m=key.match(/^slides\[(\d+)\]\.(\w+)$/);if(m)this.data.slides[Number(m[1])][m[2]]=value;else this.data[key]=value}},triggerEvent(name,data){events.push({name,data})}};
 definition.lifetimes.attached.call(c);c._visible=true;c.activity();
 return {c,events,patches,definition,tick:ms=>now+=ms,get disconnected(){return disconnected},detach(){c._observer={disconnect(){disconnected=true}};definition.lifetimes.detached.call(c)}};
}
test('only current and adjacent images mount; cover retains the independent daily list',()=>{
 const {c}=fixture();assert.equal(c.data.slides.filter(s=>s.render).length,3);
 c.change({detail:{current:5,source:'touch'}});
 assert.deepEqual(Array.from(c.data.slides.entries()).filter(([i,s])=>s.render).map(([i])=>i),[4,5,6]);
 assert.equal(c.data.position,5);assert.equal(c.data.counter,'6 / 12');
});
test('native change callback has a loop guard and sends small patches rather than full slide arrays',()=>{
 const {c,patches}=fixture();c.change({detail:{current:1,source:'autoplay'}});
 const count=patches.length;c.change({detail:{current:1,source:''}});assert.equal(patches.length,count);
 assert.ok(!Object.prototype.hasOwnProperty.call(patches.at(-1),'slides'));
 c.next();assert.equal(c.data.position,2);c.change({detail:{current:2,source:''}});assert.equal(c.data.index,2);
});
test('swiping never opens a photo accidentally; a later tap opens the displayed daily photo',()=>{
 const {c,events,tick}=fixture();c.start({touches:[{clientX:200,clientY:100}]});c.move({touches:[{clientX:80,clientY:102}]});c.end();
 c.change({detail:{current:1,source:'touch'}});c.finish();c.open({currentTarget:{dataset:{index:1}}});assert.equal(events.length,0);
 tick(600);c.start({touches:[{clientX:100,clientY:100}]});c.end();c.open({currentTarget:{dataset:{index:1}}});
 assert.equal(events.length,1);assert.equal(events[0].data.photo.id,'p1');
});
test('autoplay follows page visibility and touch activity, and observers detach',()=>{
 const f=fixture(),c=f.c;assert.equal(c.data.running,true);c.data.active=false;c.activity();assert.equal(c.data.running,false);
 c.data.active=true;c._visible=false;c.activity();assert.equal(c.data.running,false);
 c._visible=true;c.start({touches:[{clientX:0,clientY:0}]});assert.equal(c.data.running,false);c.end();assert.equal(c.data.running,true);
 f.detach();assert.equal(f.disconnected,true);
});
test('hero uses the shared progressive component and upgrades only the displayed slide',()=>{const markup=fs.readFileSync(require.resolve('../components/featured-cover/index.wxml'),'utf8');assert.ok(markup.includes('<progressive-image'));assert.ok(markup.includes('upgrade="{{slideIndex===index}}"'));});

test('circular cards keep natural ratios and rotate neighbours correctly across wraparound',()=>{
 const {c}=fixture();c.data.photos=[{id:'portrait',width:600,height:900},{id:'wide',width:3000,height:1000},{id:'square',width:800,height:800}];c.layout();
 for(let i=0;i<3;i++){const s=c.data.slides[i],p=c.data.photos[i];assert.ok(s.width<=502);assert.ok(s.height<=420);assert.ok(Math.abs(s.width/s.height-p.width/p.height)<1e-9)}
 assert.equal(c.data.slides[2].side,'before');c.change({detail:{current:2,source:'autoplay'}});
 assert.equal(c.data.slides[2].side,'center');assert.equal(c.data.slides[1].side,'before');assert.equal(c.data.slides[0].side,'after');
});
