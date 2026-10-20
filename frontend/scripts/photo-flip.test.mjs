import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
function setup(reduce=false){
 const events={},windowEvents={},exports={};let focused,now=1000;
 const control=()=>({inert:false,setAttribute(){},focus(){focused=this}}),front=control(),rear=control(),view=control();
 const card={dispatchEvent(){},dataset:{flipped:'false'},clientWidth:200,style:{setProperty(){}},classList:{add(){},remove(){}},querySelector:s=>s==='.flip-front'?front:s==='.flip-back'?rear:view,setPointerCapture(){},hasPointerCapture:()=>false};
 const target=kind=>({matches:s=>s==='.'+kind,closest:s=>s==='.photo-flip'?card:s.includes(kind)?{}:null});
 const root={addEventListener:(k,f)=>events[k]=f};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/scripts/photo-flip.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,setTimeout:()=>1,clearTimeout(){},Event:class{},require:()=>({escaped:s=>String(s).replaceAll('<','&lt;')}),matchMedia:q=>({matches:q.includes('reduced')?reduce:true}),performance:{now:()=>now},window:{addEventListener:(k,f)=>windowEvents[k]=f}});
 exports.installPhotoFlip(root);
 function event(kind='flip-front',x=0,y=0){return{target:target(kind),button:0,pointerId:1,pointerType:'touch',clientX:x,clientY:y,preventDefault(){},stopImmediatePropagation(){},stopPropagation(){}}}
 return {exports,events,windowEvents,card,front,rear,view,event,get focused(){return focused},tick(){now+=20}};
}
test('front click reveals accessible back; view action does not flip back',()=>{
 const f=setup();f.events.click(f.event());assert.equal(f.card.dataset.flipped,'true');assert.equal(f.front.inert,true);assert.equal(f.rear.inert,false);assert.equal(f.focused,f.rear);
 f.events.click(f.event('flip-view'));assert.equal(f.card.dataset.flipped,'true');
 f.events.click(f.event('flip-back'));assert.equal(f.card.dataset.flipped,'false');assert.equal(f.focused,f.front);
});
test('vertical swipe never flips on its trailing click',()=>{
 const f=setup();f.events.pointerdown(f.event());f.events.pointermove(f.event('flip-front',2,100));f.windowEvents.pointerup(f.event());f.events.click(f.event());assert.equal(f.card.dataset.flipped,'false');
});
test('horizontal drag snaps and suppresses click; cancel returns to original face',()=>{
 const f=setup();f.events.pointerdown(f.event());f.tick();f.events.pointermove(f.event('flip-front',150,0));f.windowEvents.pointerup(f.event());f.events.click(f.event());assert.equal(f.card.dataset.flipped,'true');
 f.events.pointerdown(f.event());f.tick();f.events.pointermove(f.event('flip-front',150,0));f.windowEvents.pointercancel(f.event());assert.equal(f.card.dataset.flipped,'true');
});
test('reduced motion retains click and Escape accessibility',()=>{
 const f=setup(true);f.events.click(f.event());f.events.keydown({...f.event('flip-view'),key:'Escape'});assert.equal(f.card.dataset.flipped,'false');
});

test('back keyboard activation returns; large-image action is not intercepted',()=>{
 const f=setup();f.events.click(f.event());f.events.click(f.event('flip-view'));assert.equal(f.card.dataset.flipped,'true');
 f.events.keydown({...f.event('flip-back'),key:'Enter'});assert.equal(f.card.dataset.flipped,'false');
});

 test('card back keeps description but moves escaped camera facts to the viewer',()=>{
 const {exports}=setup();const html=exports.flipMarkup({title:'Test',geo:{label:'银川'},captured:{value:'2026-10-19'},caption:'<script>bad</script>',tags:['秋'],exif:{camera:'Canon',iso:'100',fnumber:'8/1',exposure:'8/10',focal_length:'24/1',date:'2026-10-19T21:42:19'}},0,'<img/>');
 assert.ok(!html.includes('flip-exif'));assert.ok(!html.includes('Canon'));const facts=exports.photoFacts({exif:{camera:'<Canon>',iso:'100'}});assert.ok(facts.includes('&lt;Canon>'));assert.ok(facts.includes('ISO')); assert.ok(!html.includes('<script>bad'));assert.ok(html.includes('&lt;script>bad'));
 });

test('save action uses the public original-size attachment and discloses the watermark',()=>{
 const {exports}=setup();const photo={id:'id',title:'照片',caption:'',tags:[],exif:{},download:'/api/public/photos/id/download'};
 const markup=exports.flipMarkup(photo,0,'<img/>');assert.ok(markup.includes('href="/api/public/photos/id/download" download'));assert.ok(markup.includes('保存原图'));assert.ok(!markup.includes('flip-download-note'));assert.ok(markup.includes('原尺寸带水印 JPEG')); assert.ok(!exports.flipMarkup({...photo,download:null},0,'<img/>').includes('flip-save'));
});
