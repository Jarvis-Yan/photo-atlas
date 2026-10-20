const descriptions=require('./photo-descriptions');
const {API_ORIGIN} = require('../config');

function absolute(value) {
  if (!value) return '';
  if (/^https:\/\//.test(value)) return value;
  return API_ORIGIN + (value.startsWith('/') ? value : '/' + value);
}

function exifList(exif) {
  const labels = {camera:'相机', lens:'镜头', date:'拍摄时间', iso:'ISO', fnumber:'光圈', exposure:'快门', focal_length:'焦距'};
  return Object.keys(labels).filter((key) => exif && exif[key]).map((key) => ({label: labels[key], value: String(exif[key])}));
}

function browsingSource(item, width, fallback) {
  const manifest=item.thumbnail && typeof item.thumbnail==='object' ? item.thumbnail : null;
  if(!manifest)return absolute(fallback);
  const choices=String(manifest.srcset||'').split(',').map(value=>value.trim().match(/^(\S+)\s+(\d+)w$/)).filter(Boolean).map(value=>({url:value[1],width:Number(value[2])})).sort((a,b)=>a.width-b.width);
  return absolute((choices.find(value=>value.width>=width)||choices[choices.length-1]||{}).url||manifest.src||fallback);
}

function photo(item) {
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const location = item.geo && item.geo.label ? item.geo.label : '';
  const date = item.captured && item.captured.value ? item.captured.value : '';
  return Object.assign({}, item, {
    caption:String(item.caption||'').trim()?item.caption:(descriptions[item.id]||''),
    src: browsingSource(item,768,item.src),
    fallbackSrc:absolute(item.src),
    fallbackThumbnail:absolute('/media/'+item.id+'/480.webp'),
    preview: absolute('/media/' + item.id + '/2400.webp'),
    cardHeight: Math.round(333 * (item.height > 0 && item.width > 0 ? item.height / item.width : 1.25)),
    fullCardHeight: Math.round(686 * (item.height > 0 && item.width > 0 ? item.height / item.width : 1.25)),
    thumbnail: browsingSource(item,320,'/media/' + item.id + '/480.webp'),
    mapThumbnail: browsingSource(item,80,'/media/' + item.id + '/480.webp'),
    full: absolute(item.full),
    download: absolute(item.download),
    tagText: tags.slice(0, 2).join(' · '),
    locationText: [location, item.geo && item.geo.status === 'approximate' ? '地点推测' : '', date].filter(Boolean).join(' · '),
    exifList: exifList(item.exif),
    year: date ? Number(date.slice(0, 4)) || 0 : 0,
  });
}

function album(item) {
  const years=[...new Set((item.years||[]).map(Number).filter(value=>value>=1900&&value<=2200))].sort((a,b)=>a-b);
  const places=[...new Set((item.places||[]).filter(Boolean))];
  const generic=['按旅行地点整理的公开摄影作品。','按旅行地点整理的摄影作品。','记录旅行途中的风景与日常。'];
  return Object.assign({}, item, {cover:item.cover?photo(item.cover):null,yearText:years.length?(years.length>1?years[0]+'—'+years[years.length-1]:String(years[0])):'',placeText:places.slice(0,3).join(' · ')+(places.length>3?' 等 '+places.length+' 个地点':''),description:generic.includes(String(item.description||'').trim())?'':item.description});
}

function post(item) {
  const html = String(item.html || '').replace(/(src|href)=(['"])\//g, '$1=$2' + API_ORIGIN + '/');
  return Object.assign({}, item, {
    html,
    dateText: new Date(item.updated * 1000).toLocaleDateString('zh-CN'),
  });
}

function catalog(data) {
  return Object.assign({}, data, {
    photos: (data.photos || []).map(photo),
    albums: (data.albums || []).map(album),
    posts: (data.posts || []).map(post),
  });
}

module.exports = {absolute, browsingSource, exifList, photo, album, post, catalog};
