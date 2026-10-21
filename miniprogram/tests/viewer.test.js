const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {createPreviewCache}=require('../utils/preview-cache');
const photo=id=>({id,title:id,width:1200,height:800,mapThumbnail:'https://example.test/'+id+'/tiny.webp',thumbnail:'tiny',exifList:[]});
test('neighbor previews are bounded, decoded locally, deduplicated and never load full images',()=>{
 const calls=[],cache=createPreviewCache(options=>calls.push(options),2);cache.prime([photo('a'),photo('b'),photo('c')]);assert.equal(calls.length,2);cache.prime([photo('a'),photo('d')]);assert.equal(calls.length,2);
 calls[0].success({path:'wxfile://a'});calls[0].complete();assert.equal(calls.length,3);assert.ok(calls[2].src.includes('/d/'));assert.equal(cache.peek('a'),'wxfile://a');cache.remember('b','wxfile://b');cache.remember('d','wxfile://d');assert.equal(cache.peek('a'),undefined);cache.forget('d');assert.equal(cache.peek('d'),undefined);
});
test('viewer session preserves the source order and direct links never inherit another gallery',()=>{
 const module={exports:{}},routes=[];vm.runInNewContext(fs.readFileSync(require.resolve('../utils/viewer-session'),'utf8'),{module,wx:{navigateTo:o=>routes.push(o.url)}});const session=module.exports;session.openViewer([photo('b'),photo('a'),photo('b')],'a');assert.deepEqual(Array.from(session.viewerPhotos('a'),p=>p.id),['b','a']);assert.equal(session.viewerPhotos('other').length,0);assert.equal(routes[0],'/pages/photo/index?id=a&viewer=1');
});
test('large-image next/previous swaps immediately without waiting for metadata or full downloads',()=>{
 let p;const titles=[],scrolls=[],primed=[];const list=[photo('a'),photo('b'),{...photo('c'),width:800,height:1200}];
 vm.runInNewContext(fs.readFileSync(require.resolve('../pages/photo/index'),'utf8'),{Page:v=>p=v,require:path=>path.includes('viewer-session')?{viewerPhotos:()=>list,rememberViewer(){}}:path.includes('preview-cache')?{previewCache:{peek:id=>'wxfile://'+id,prime:items=>primed.push(items)}}:path.includes('api')?{onePhoto:()=>assert.fail('cached gallery must render immediately')}:path.includes('theme')?{pageTheme(){}}:{previewScroll(){}},wx:{getWindowInfo:()=>({windowWidth:390,windowHeight:700}),setNavigationBarTitle:o=>titles.push(o.title),pageScrollTo:o=>scrolls.push(o)},Promise});
 p.setData=patch=>Object.assign(p.data,patch);p.onLoad({id:'a',viewer:'1'});assert.equal(p.data.loading,false);assert.equal(p.data.photo.viewerPreview,'wxfile://a');assert.equal(p.data.viewerCount,3);p.next();p.next();assert.equal(p.data.photo.id,'c');assert.ok(p.data.viewerHeight<=700*.76);p.next();assert.equal(p.data.photo.id,'a');p.previous();assert.equal(p.data.photo.id,'c');assert.equal(scrolls.length,4);assert.equal(primed.length,5);
});

test('returning restores the last selected photo only on its source page, then clears the session',()=>{
 const module={exports:{}},restored=[],jobs=[];vm.runInNewContext(fs.readFileSync(require.resolve('../utils/viewer-session'),'utf8'),{module,wx:{navigateTo(){},nextTick:fn=>jobs.push(fn)}});const session=module.exports,owner={revealPhoto:id=>restored.push(id)};
 session.openViewer([photo('a'),photo('b')],'a',owner);session.rememberViewer('b');session.restoreViewer({});assert.equal(jobs.length,0);session.restoreViewer(owner);assert.equal(jobs.length,1);jobs[0]();assert.deepEqual(restored,['b']);assert.equal(session.viewerPhotos('b').length,0);
 session.openViewer([photo('a'),photo('b')],'a',owner);session.rememberViewer('b');session.rememberViewer('a');session.restoreViewer(owner);assert.equal(jobs.length,1);
});
test('gallery return scroll uses the selected tile bounds and the existing page scroll position',()=>{
 let component,selector,scrolled;vm.runInNewContext(fs.readFileSync(require.resolve('../components/photo-waterfall/index.js'),'utf8'),{Component:c=>component=c,require:()=>({}),wx:{pageScrollTo:o=>scrolled=o}});
 const query={select:id=>{selector=id;return query},boundingClientRect:()=>query,exec:fn=>fn([{top:420}])};component.methods.revealPhoto.call({createSelectorQuery:()=>query},'final',700);assert.equal(selector,'#gallery-photo-final');assert.equal(scrolled.scrollTop,1104);assert.equal(scrolled.duration,0);
});
