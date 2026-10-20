const test=require('node:test'),assert=require('node:assert/strict');
const {journeySelection}=require('../utils/home-journey');
test('homepage groups only real confirmed shared places, deduplicates and qualifies partial dates',()=>{
 const photos=[{id:'a',geo:{status:'resolved',label:'济南'},captured:{value:'2025-06-01'}},{id:'b',geo:{status:'resolved',label:'济南'},captured:{value:'2025'}},{id:'c',geo:{status:'approximate',label:'济南'}},{id:'a',geo:{status:'resolved',label:'济南'}}];
 const result=journeySelection(photos);assert.equal(result.place,'济南');assert.deepEqual(result.photos.map(p=>p.id),['a','b']);assert.equal(result.date,'已知拍摄日期：2025-06-01');assert.equal(journeySelection([photos[2]]),null);
});
