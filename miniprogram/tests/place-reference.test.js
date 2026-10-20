const test=require('node:test'),assert=require('node:assert/strict');
const {placeReference}=require('../utils/place-reference');
test('a named Liupan photo uses a sourced area without inventing photo GPS',()=>{
 const p={id:'pine-road',geo:{label:'宁夏 六盘山',status:'named',source:'manual',precision:'place'}};
 const before=JSON.stringify(p),r=placeReference(p);assert.equal(r.kind,'place-area');assert.equal(r.latitude,35.66);assert.equal(r.longitude,106.21);assert.ok(r.url.includes('getty.edu'));assert.equal(JSON.stringify(p),before);
});
test('all five currently named-only places have bounded map references',()=>{
 for(const label of ['宁夏 六盘山','内蒙古 库布齐沙漠','贵州 黄果树','贵州 小七孔','云南 沙溪古镇']){const r=placeReference({geo:{label,status:'named'}});assert.ok(r);assert.ok(r.scale>=6&&r.scale<=10);assert.ok(r.url.startsWith('https://'));}
});
test('actual photo coordinates win; unknown names and homonyms stay unresolved',()=>{
 assert.equal(placeReference({geo:{label:'宁夏 六盘山',latitude:35.5,longitude:106.2}}),null);
 for(const label of ['沙溪','贵州 沙溪古镇','广东 沙溪古镇','未知地点','沙溪古镇附近'])assert.equal(placeReference({geo:{label}}),null);
 assert.equal(placeReference({geo:{label:'云南 沙溪古镇',country:'JP'}}),null);
});
