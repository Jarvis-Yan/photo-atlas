const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {homeGallery}=require('../utils/home-gallery');
const photos=Array.from({length:72},(_,i)=>({id:String(i),width:i%4?6000:4000,height:i%4?4000:6000}));
test('daily gallery closes edges and all works append without moving earlier photos',()=>{
 const daily=homeGallery(photos.slice(0,12),'bounded');
 assert.ok(Math.abs(Math.max(...daily.items.map(p=>p.x+p.width))-686)<.001);
 assert.ok(Math.abs(Math.max(...daily.items.map(p=>p.y+p.height))-daily.height)<.001);
 daily.items.forEach(p=>assert.ok(Math.abs(p.height/p.width-photos[p.index].height/photos[p.index].width)<1e-9));
 assert.deepEqual(homeGallery(photos.slice(0,36),'masonry').items,homeGallery(photos,'masonry').items.slice(0,36));
});
test('append updates only new wall entries so existing progressive-image props do not reset',()=>{
 let definition;vm.runInNewContext(fs.readFileSync(require.resolve('../components/photo-waterfall/index.js'),'utf8'),{Component:v=>definition=v,require:p=>p.includes('home-gallery')?{homeGallery}:p.includes('photo-wall')?require('../utils/photo-wall'):require('../utils/waterfall')});
 const c={...definition.methods,_attached:true,data:{layoutMode:'masonry',photos:photos.slice(0,36)}};let patch;c.setData=v=>{patch=v;Object.assign(c.data,v)};
 c.layout();assert.equal(patch.wall.length,36);const first=patch.wall[0];c.data.photos=photos;c.layout();
 assert.equal(patch.wall,undefined);assert.equal(patch['wall[0]'],undefined);assert.equal(patch['wall[36]'].id,'36');assert.equal(c.data.wall[0],first);
});
