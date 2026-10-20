const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const format=require('../utils/format'),descriptions=require('../utils/photo-descriptions');
test('captions come from the API and preserve authored content and metadata',()=>{
 const id='demo-photo';assert.deepEqual(descriptions,{});
 const raw={id,title:'测试',width:6000,height:4000,tags:['旅行'],src:'/x.webp',exif:{camera:'Canon',iso:100},captured:{value:'2026-10-19'},geo:{label:'银川'}};
 const filled=format.photo(raw);assert.equal(filled.caption,'');assert.equal(raw.caption,undefined);assert.deepEqual(filled.exifList,[{label:'相机',value:'Canon'},{label:'ISO',value:'100'}]);assert.equal(filled.fullCardHeight,Math.round(686*2/3));assert.equal(format.photo({...raw,caption:'作者原文'}).caption,'作者原文');assert.equal(format.photo({...raw,id:'new-upload'}).caption,'');
});
test('all card galleries open a large image with camera facts below it',()=>{
 for(const path of ['home','album-detail','footprints']){
 let page,opened;
 const wx={navigateTo:options=>opened=options.url,previewImage:()=>assert.fail('camera facts need the large-image page')};
 vm.runInNewContext(fs.readFileSync(require.resolve('../pages/'+path+'/index.js'),'utf8'),{Page:p=>page=p,require:()=>({}),wx,setTimeout,clearTimeout});
 page.openPhoto({detail:{pure:true,photo:{id:'one'}}});
 assert.equal(opened,'/pages/photo/index?id=one&viewer=1');
 }
});
test('card backs have no camera fields and large-image footer follows the image',()=>{
 const back=fs.readFileSync(require.resolve('../components/photo-flip/index.wxml'),'utf8');assert.ok(!back.includes('exifList'));
 const page=fs.readFileSync(require.resolve('../pages/photo/index.wxml'),'utf8');assert.ok(page.indexOf('class="camera-footer"')>page.indexOf('class="large-photo"'));assert.ok(page.includes('photo.exifList'));
});
