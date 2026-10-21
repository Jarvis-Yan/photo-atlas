const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createQueue}=require('../utils/image-queue');
function fixture(options={}){
 let definition,id=0,now=0;const jobs=new Map(),events=[],downloads=[],queue=options.queue||createQueue();
 vm.runInNewContext(fs.readFileSync(require.resolve('../components/progressive-image/index.js'),'utf8'),{require:path=>path.includes('preview-cache')?{previewCache:{remember(){},forget(){}}}:path.includes('image-queue')?{imageQueue:queue}:{absolute:path=>path.startsWith('https://')?path:'https://photos.example.test'+path},Component:value=>definition=value,wx:{downloadFile(params){const task={params,aborted:false,abort(){this.aborted=true;params.fail({errMsg:'abort'})}};downloads.push(task);if(!options.manualDownload)params.success({statusCode:200,tempFilePath:params.url.replace('https://photos.example.test','')});return task}},setTimeout(fn,ms){jobs.set(++id,{fn,at:now+ms});return id},clearTimeout:key=>jobs.delete(key)});
 const data=Object.fromEntries(Object.entries(definition.properties).map(([key,property])=>[key,property.value]));
 const component={data:{...data,...definition.data,photo:{id:options.id||'a',mapThumbnail:'/tiny',thumbnail:'/lite',fallbackThumbnail:'/legacy'},priority:true,...options.data},...definition.methods,setData(patch,done){Object.assign(this.data,patch);done?.()},triggerEvent(name,value){events.push({name,value})}};
 definition.lifetimes.attached.call(component);
 return{c:component,definition,events,downloads,queue,load(stage){const key=component.data.frames.find(frame=>frame.stage===stage&&!frame.ready)?.key;assert.ok(key);component.frameLoaded({currentTarget:{dataset:{key}}})},fail(stage){const key=component.data.frames.find(frame=>frame.stage===stage&&!frame.ready)?.key;assert.ok(key);component.frameFailed({currentTarget:{dataset:{key}}})},tick(ms){now+=ms;for(const [key,job]of [...jobs])if(job.at<=now){jobs.delete(key);job.fn()}},jobs};
}
test('native clear layer is hidden until bindload, leaving the small layer and ratio intact',()=>{const f=fixture({data:{height:'376rpx',clearSize:960}}),c=f.c;assert.equal(c.data.frames[0].src,'/tiny');assert.equal(c.data.frames[0].ready,false);f.load('small');assert.equal(c.data.quality,'preview');assert.equal(c.data.frames[0].ready,true);assert.equal(c.data.frames[1].ready,false);assert.ok(c.data.frames[1].src.endsWith('/960.webp'));f.load('clear');assert.equal(c.data.frames.length,1);assert.equal(c.data.frames[0].ready,true);assert.equal(c.data.quality,'clear');assert.equal(c.data.height,'376rpx');});
test('clear failures and timeouts retain small image, retry finitely, then offer manual retry',()=>{const f=fixture(),c=f.c;f.load('small');f.fail('clear');assert.equal(c.data.frames.length,1);assert.equal(c.data.frames[0].src,'/tiny');f.tick(1500);assert.ok(c.data.frames[1].src.includes('thumb-v1-1280'));f.fail('clear');f.tick(5000);assert.ok(c.data.frames[1].src.endsWith('?retry=1'));f.tick(20000);assert.equal(c.data.quality,'preview');assert.equal(c.data.frames.length,1);assert.equal(c.data.retryLabel,'重试清晰预览');f.tick(60000);assert.equal(c.data.frames.length,1);c.retry();assert.equal(c.data.frames.length,2);assert.equal(c.data.frames[0].src,'/tiny');});
test('photo replacement and component detach ignore stale native load events',()=>{const f=fixture(),c=f.c;f.load('small');const oldKey=c.data.frames[1].key;c.data.photo={id:'b',mapThumbnail:'/tiny-b'};c.reset();c.frameLoaded({currentTarget:{dataset:{key:oldKey}}});assert.equal(c.data.quality,'none');assert.equal(c.data.frames[0].src,'/tiny-b');const nextKey=c.data.frames[0].key;f.definition.lifetimes.detached.call(c);c.frameLoaded({currentTarget:{dataset:{key:nextKey}}});assert.equal(c.data.quality,'none');});
test('adjacent cover keeps a small preview until selected; hiding cancels upgrades',()=>{const f=fixture({data:{upgrade:false}}),c=f.c;f.load('small');assert.equal(c.data.frames.length,1);c.data.upgrade=true;c.sync();assert.equal(c.data.frames.length,2);c.data.active=false;c.sync();assert.equal(c.data.frames.length,1);assert.equal(c.data.quality,'preview');c.data.active=true;c.sync();assert.equal(c.data.frames.length,2);});
test('new small previews outrank queued clear images with global limits',()=>{const queue=createQueue(4,2),starts=[],finish={};for(let i=0;i<4;i++)queue.enqueue('small',done=>{starts.push('s'+i);finish['s'+i]=done});for(let i=0;i<4;i++)queue.enqueue('clear',done=>{starts.push('c'+i);finish['c'+i]=done});queue.enqueue('small',done=>{starts.push('next-small');finish.next=done});assert.equal(starts.length,4);finish.s0();assert.equal(starts.at(-1),'next-small');finish.s1();finish.s2();finish.s3();assert.equal(starts.filter(value=>value.startsWith('c')).length,2);finish.c0();assert.equal(starts.filter(value=>value.startsWith('c')).length,3);});
test('downloads are abortable and only complete files enter the hidden native image layer',()=>{
 const f=fixture({manualDownload:true}),c=f.c,small=f.downloads[0];
 assert.equal(c.data.frames.length,0);
 small.params.success({statusCode:200,tempFilePath:'wxfile://small.webp'});
 assert.equal(c.data.frames[0].src,'wxfile://small.webp');assert.equal(c.data.quality,'none');
 f.load('small');const clear=f.downloads[1];
 c.data.upgrade=false;c.sync();assert.equal(clear.aborted,true);assert.equal(c.data.quality,'preview');
 clear.params.success({statusCode:200,tempFilePath:'wxfile://stale.webp'});
 assert.equal(c.data.frames.length,1);assert.equal(c.data.frames[0].src,'wxfile://small.webp');
});
test('HTTP failures, timeout and detach abort obsolete downloads without leaking queue slots',()=>{
 const f=fixture({manualDownload:true}),c=f.c;
 f.downloads[0].params.success({statusCode:503,tempFilePath:'wxfile://error.html'});
 assert.equal(c.data.frames.length,0);assert.equal(f.downloads[0].aborted,true);
 assert.equal(f.downloads.length,2);f.tick(12000);assert.equal(f.downloads[1].aborted,true);
 assert.equal(f.downloads.length,3);f.definition.lifetimes.detached.call(c);assert.equal(f.downloads[2].aborted,true);
});

test('nearby thumbnails load during scrolling while clear upgrades wait for visibility and release',()=>{
 const f=fixture({data:{priority:false,upgrade:false}}),c=f.c;
 assert.equal(f.downloads.length,0);c._near=true;c.sync();assert.equal(f.downloads.length,1);
 f.load('small');assert.equal(c.data.quality,'preview');assert.equal(f.downloads.length,1);
 c.data.upgrade=true;c.sync();assert.equal(f.downloads.length,1);
 c._visible=true;c.sync();assert.equal(f.downloads.length,2);
 c._visible=false;c.sync();assert.equal(c.data.quality,'preview');assert.equal(c.data.frames.length,1);
});

test('cached tiny preview is immediately visible and stale local files recover through the normal small loader',()=>{
 const f=fixture({data:{clearSize:2400,photo:{id:'cached',mapThumbnail:'/tiny',viewerPreview:'wxfile://cached'}}}),c=f.c;
 assert.equal(c.data.quality,'preview');assert.equal(c.data.frames[0].src,'wxfile://cached');assert.equal(c.data.frames[0].ready,true);assert.equal(f.downloads.length,1);assert.ok(f.downloads[0].params.url.endsWith('/2400.webp'));
 const cached=c.data.frames[0].key;c.frameFailed({currentTarget:{dataset:{key:cached}}});assert.equal(f.downloads[0].aborted,true);assert.equal(c.data.quality,'none');assert.equal(c.data.frames[0].src,'/tiny');
});
