const test=require('node:test');
const assert=require('node:assert/strict');
const requests=[];
global.wx={request(options){requests.push(options);}};
const api=require('../utils/api');
function success(index,data){requests[index].success({statusCode:200,data});}

test('public cache merges concurrent reads, force-refreshes, and never caches failures',async()=>{
 api.invalidate();
 const first=api.request('/public/site'),second=api.request('/public/site');
 assert.equal(requests.length,1);
 success(0,{settings:{site_name:'PixelCore'},albums:[],posts:[]});
 assert.deepEqual(await first,await second);
 await api.request('/public/site');assert.equal(requests.length,1);
 const refresh=api.request('/public/site',{force:true});assert.equal(requests.length,2);success(1,{settings:{site_name:'New'},albums:[],posts:[]});await refresh;
 api.invalidate();const failed=api.request('/public/photos/test');requests[2].fail({errMsg:'offline'});await assert.rejects(failed);
 const retry=api.request('/public/photos/test');assert.equal(requests.length,4);success(3,{id:'test'});assert.equal((await retry).id,'test');
});

test('domain failures are actionable and malformed success responses cannot become empty galleries',async()=>{
 api.invalidate();let index=requests.length;
 const denied=api.home(true);
 requests[index].fail({errMsg:'request:fail url not in domain list'});
 await assert.rejects(denied,error=>error.code==='DOMAIN_NOT_ALLOWED'&&error.message.includes('request 合法域名'));
 for(const invalid of ['<html>gateway</html>',{}, {settings:{},albums:[],posts:[]}]){
  index=requests.length;const read=api.home(true);success(index,invalid);
  await assert.rejects(read,error=>error.code==='INVALID_RESPONSE');
 }
 index=requests.length;const retry=api.home(true);
 success(index,JSON.stringify({settings:{site_name:'PixelCore'},photos:[{id:'one',tags:[]}],albums:[],posts:[]}));
 assert.equal((await retry).photos.length,1);
});

test('home seeds shared site data for instant first tab switch',async()=>{
 api.invalidate();const index=requests.length;
 const home=api.home(true);success(index,{settings:{site_name:'PixelCore'},photos:[],albums:[],posts:[]});await home;
 const before=requests.length;const site=await api.site();assert.equal(requests.length,before);assert.equal(site.settings.site_name,'PixelCore');
});

test('list to detail reuses photo data, while forced refresh and invalidation reach server',async()=>{
 api.invalidate();let index=requests.length;
 const listing=api.home(true);
 success(index,{settings:{},photos:[{id:'fast-photo',title:'Before',tags:[],download:'/api/public/photos/fast-photo/download'}],albums:[],posts:[]});await listing;
 const before=requests.length;const photo=await api.onePhoto('fast-photo');
 assert.equal(requests.length,before);assert.equal(photo.title,'Before');assert.ok(photo.download.endsWith('/download'));
 const refresh=api.onePhoto('fast-photo',true);assert.equal(requests.length,before+1);success(before,{id:'fast-photo',title:'After'});assert.equal((await refresh).title,'After');
 api.invalidate();index=requests.length;const read=api.onePhoto('fast-photo');assert.equal(requests.length,index+1);success(index,{id:'fast-photo',title:'Fresh'});assert.equal((await read).title,'Fresh');
});
