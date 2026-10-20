const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(wx){const module={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../utils/save-photo'),'utf8'),{module,wx,Promise,Error});return module.exports;}
test('saves only the public full-size download after successful download and image decode',async()=>{
 const calls=[];const wx={downloadFile:o=>{calls.push(o.url);o.success({statusCode:200,tempFilePath:'/tmp/jpeg'});},getImageInfo:o=>{assert.equal(o.src,'/tmp/jpeg');o.success({path:'/tmp/decoded.jpeg',width:6000,height:4000});},saveImageToPhotosAlbum:o=>{calls.push(o.filePath);o.success({});}};
 await fixture(wx).savePhoto({download:'https://portfolio.example/api/public/photos/id/download',preview:'thumbnail'});assert.deepEqual(calls,['https://portfolio.example/api/public/photos/id/download','/tmp/decoded.jpeg']);
});
test('failed HTTP responses or missing download never write a photo',async()=>{
 const api=fixture({downloadFile:o=>o.success({statusCode:503}),saveImageToPhotosAlbum:()=>assert.fail('must not save')});await assert.rejects(api.savePhoto({download:'url'}));await assert.rejects(api.savePhoto({}));
});
test('permission explanation only opens settings on an explicit confirmation',()=>{
 let modal,opened=0;const api=fixture({showModal:o=>modal=o,openSetting:()=>opened++,showToast:()=>assert.fail('wrong flow')});api.saveError({errMsg:'saveImageToPhotosAlbum:fail auth deny'});modal.success({confirm:false});assert.equal(opened,0);modal.success({confirm:true});assert.equal(opened,1);
});
test('card save remains on the back and ignores repeated taps until completion',async()=>{
 let definition,resolve,calls=0;const pending=new Promise(r=>resolve=r);vm.runInNewContext(fs.readFileSync(require.resolve('../components/photo-flip/index.js'),'utf8'),{Component:c=>definition=c,require:()=>({savePhoto:()=>{calls++;return pending;},saveError:()=>assert.fail('unexpected failure')}),wx:{showLoading(){},hideLoading(){},showToast(){}},setTimeout,clearTimeout});
 const card={data:{photo:{download:'url'},flipped:true,saving:false,turning:false},setData:p=>Object.assign(card.data,p)};
 const first=definition.methods.save.call(card);await definition.methods.save.call(card);assert.equal(calls,1);assert.equal(card.data.flipped,true);resolve();await first;assert.equal(card.data.saving,false);
});
