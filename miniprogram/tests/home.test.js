const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('failed home load remains retryable after category changes', async () => {
  let page, reads = 0;
  const api = {
    async home() { reads++; throw new Error('域名未配置'); },
    async catalog() { throw new Error('连接失败'); },
    message(error) { return error.message; },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../pages/home/index.js'), 'utf8'), {
    require(path) { return path.includes('api') ? api : path.includes('home-journey') ? require('../utils/home-journey') : {}; },
    Page(value) { page = value; }, wx: {setNavigationBarTitle() {}}, clearTimeout, setTimeout,
  });
  page.setData = function (patch) { Object.assign(this.data, patch); };
  await page.loadHome();
  assert.equal(page.data.error, '域名未配置');
  await page.loadCatalog(true);
  assert.equal(reads, 2);
  assert.equal(page.data.error, '域名未配置');
  page.data.category = '人像';
  await page.loadCatalog(true);
  assert.equal(page.data.error, '域名未配置');
  assert.equal(page.data.loadingMore, false);
  api.home = async () => ({settings: {}, photos: [{id:'one',category:'人像',tags:[]}], posts: []});
  await page.loadHome(true);
  assert.equal(page.data.error, '');
  assert.equal(page.data.photos.length, 1);
});


test('returning home after a Beijing date change refreshes the edition once', () => {
  let page, requests=0;
  vm.runInNewContext(fs.readFileSync(require.resolve('../pages/home/index.js'), 'utf8'), {
    require() { return {pageTheme(){}}; }, Page(value) { page=value; }, Date, clearTimeout, setTimeout,
  });
  page.setData=function(patch){Object.assign(this.data,patch)};
  page._homeLoaded=true;page.data.loading=false;
  page._dailyDate=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  page.loadHome=function(force){assert.equal(force,true);requests++;this.data.loading=true;};
  page.onShow();assert.equal(requests,0);
  page._dailyDate='2020-01-01';page.onShow();page.onShow();assert.equal(requests,1);
});
