const {API_ORIGIN, REQUEST_TIMEOUT} = require('../config');
const format = require('./format');

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function networkRequest(path, options) {
  const opts = options || {};
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_ORIGIN + '/api' + path,
      method: opts.method || 'GET',
      data: opts.data,
      timeout: opts.timeout || REQUEST_TIMEOUT,
      header: Object.assign({'Accept': 'application/json'}, opts.header || {}),
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          let data = response.data;
          if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch (_) { /* Reject non-JSON responses below. */ }
          }
          if (!validResponse(path, data)) {
            return reject(new ApiError(response.statusCode, 'INVALID_RESPONSE', '服务器返回了异常内容，请重新加载'));
          }
          return resolve(data);
        }
        const body = response.data || {};
        reject(new ApiError(response.statusCode, body.code || 'HTTP_ERROR', body.message || '内容暂时无法加载'));
      },
      fail(error) {
        const detail = error && error.errMsg || '';
        if (/url not in domain list|合法域名|domain.*(?:list|allowed)/i.test(detail)) {
          return reject(new ApiError(0, 'DOMAIN_NOT_ALLOWED', '小程序服务器域名尚未配置，请管理员将 ' + API_ORIGIN + ' 加入 request 合法域名'));
        }
        reject(new ApiError(0, 'NETWORK_ERROR', '连接暂时中断，请重新加载'));
      },
    });
  });
}

function validResponse(path, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (path === '/public/home' || path === '/public/site' || path.startsWith('/public/catalog?')) {
    return !!data.settings && typeof data.settings === 'object' && Array.isArray(data.albums) && Array.isArray(data.posts)
      && (path === '/public/site' || Array.isArray(data.photos));
  }
  if (path.startsWith('/public/footprints?')) return Array.isArray(data.photos);
  if (path.startsWith('/public/albums/')) return !!data.album && Array.isArray(data.photos);
  if (path.startsWith('/public/photos/') || path.startsWith('/public/posts/')) return typeof data.id === 'string';
  return true;
}

const cache = new Map();
const pending = new Map();
const photoCache = new Map();
function seedPhotos(data) {
  const photos=(data.photos||[]).concat((data.albums||[]).map(a=>a.cover).filter(Boolean));
  for(const photo of photos){
    if(photo.id)photoCache.set(photo.id,{data:photo,expires:Date.now()+30000});
  }
  while(photoCache.size>256)photoCache.delete(photoCache.keys().next().value);
}
function request(path, options) {
  const opts=options||{}, readOnly=!opts.method||opts.method==='GET';
  if(!readOnly)return networkRequest(path,opts);
  const day=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  const key=path+(path==='/public/home'?'|'+day:'');
  const hit=cache.get(key);
  if(!opts.force&&hit&&hit.expires>Date.now())return Promise.resolve(hit.data);
  if(pending.has(key))return pending.get(key);
  const task=networkRequest(path,opts).then(data=>{seedPhotos(data);cache.set(key,{data,expires:Date.now()+30000});while(cache.size>24)cache.delete(cache.keys().next().value);return data}).finally(()=>pending.delete(key));
  pending.set(key,task);return task;
}
function invalidate(){cache.clear();photoCache.clear();}
async function site(force){return format.catalog(await request('/public/site',{force:!!force}));}

function query(params) {
  return Object.keys(params).filter((key) => params[key] !== '' && params[key] !== undefined && params[key] !== null)
    .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(params[key])).join('&');
}

async function home(force) { const data=await request('/public/home',{force:!!force});cache.set('/public/site',{data:{settings:data.settings,albums:data.albums,posts:data.posts},expires:Date.now()+30000});return format.catalog(data); }
async function catalog(params) { return format.catalog(await request('/public/catalog?' + query(params || {}))); }
async function footprints(params, force) {
  const data = await request('/public/footprints?' + query(params || {}),{force:!!force});
  return Object.assign({}, data, {photos: (data.photos || []).map(format.photo)});
}
async function onePhoto(id, force) {
  const hit=photoCache.get(id);
  if(!force&&hit&&hit.expires>Date.now())return format.photo(hit.data);
  const data=await request('/public/photos/' + encodeURIComponent(id),{force:!!force});seedPhotos({photos:[data]});return format.photo(data);
}
async function oneAlbum(id, params, force) {
  const data = await request('/public/albums/' + encodeURIComponent(id) + '?' + query(params || {}),{force:!!force});
  return Object.assign({}, data, {album: format.album(data.album), photos: (data.photos || []).map(format.photo)});
}
async function onePost(id, force) { return format.post(await request('/public/posts/' + encodeURIComponent(id),{force:!!force})); }

function message(error) {
  return error && error.message ? error.message : '内容暂时无法加载，请稍后重试';
}

module.exports = {ApiError, request, query, home, site, invalidate, catalog, footprints, onePhoto, oneAlbum, onePost, message};
