function located(photo) {
  return photo && photo.geo && Number.isFinite(photo.geo.latitude) && Number.isFinite(photo.geo.longitude) && Math.abs(photo.geo.latitude)<=90 && Math.abs(photo.geo.longitude)<=180;
}

function filterPhotos(photos, options) {
  const from = options.from || 0;
  const to = options.to || 9999;
  return photos.filter((item) => {
    if(options.category && item.category!==options.category)return false;
    const query=String(options.query||'').toLocaleLowerCase();
    if(query && ![item.title,item.geo&&item.geo.label,item.captured&&item.captured.value,...(item.tags||[])].some(value=>String(value||'').toLocaleLowerCase().includes(query)))return false;
    if (options.place && (!item.geo || item.geo.label !== options.place)) return false;
    if (!item.year) return Boolean(options.includeUndated);
    return item.year >= from && item.year <= to;
  });
}

function places(photos) {
  const map = new Map();
  photos.filter(item=>item.geo&&item.geo.label).forEach((item) => {
    const label = item.geo.label || '拍摄地点';
    if (!map.has(label)) map.set(label, []);
    map.get(label).push(item);
  });
  return Array.from(map.entries()).sort((a,b) => b[1].length-a[1].length).map(([label, items]) => ({
    label, count:items.length, thumbnail:items[0].thumbnail,
    latitude:items[0].geo.latitude, longitude:items[0].geo.longitude,
    approximate:items.some((item) => item.geo.status === 'approximate'),
  }));
}

function dateKey(value) {return (/^\d{4}(?:-\d{2}(?:-\d{2})?)?/.exec(value||'')||[])[0]||'undated';}
function dateTitle(key) {
  key=visitDate(key);
  if(key==='undated')return '日期待补充';
  const [year,month,day]=key.split('-');
  return day?`${year} 年 ${Number(month)} 月 ${Number(day)} 日`:month?`${year} 年 ${Number(month)} 月 · 日待补充`:`${year} 年 · 日期待补充`;
}
function dateLabel(key) {key=visitDate(key);return /^\d{4}-\d{2}-\d{2}$/.test(key)?key:dateTitle(key);}
function visitKey(photo){return dateKey(photo.captured&&photo.captured.value)+'~'+encodeURIComponent(String(photo.geo&&photo.geo.label||'').trim());}
function visitDate(key){return key.split('~')[0];}
function visitPlace(key){return key.includes('~')?decodeURIComponent(key.slice(key.indexOf('~')+1)):'';}
function groups(photos) {
  const map = new Map();
  photos.slice().sort((a,b) => String(b.captured&&b.captured.value||'').localeCompare(String(a.captured&&a.captured.value||'')) || a.position-b.position || String(a.id).localeCompare(String(b.id))).forEach((item) => {
    const value = item.captured && item.captured.value || '';
    const key = visitKey(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return Array.from(map.entries()).map(([key, items]) => ({
    key, date:visitDate(key), place:visitPlace(key), count:items.length, title:dateTitle(visitDate(key)), items,
  }));
}

function years(photos, from, to) {
  const counts = new Map();
  photos.forEach((item) => {if(item.year) counts.set(item.year,(counts.get(item.year)||0)+1);});
  return Array.from(counts.entries()).sort((a,b)=>a[0]-b[0]).map(([year,count])=>({year,count,active:year>=from&&year<=to}));
}

function markers(photos) {
  return photos.filter(located).map((item,index)=>({
    id:index+1, photoId:item.id, latitude:item.geo.latitude, longitude:item.geo.longitude,
    iconPath:'/assets/map-pin.png', width:20, height:20, alpha:.95,
    callout:{content:(item.geo.label||'拍摄地点')+'\n'+item.title,padding:7,borderRadius:7,bgColor:'#ffffff',color:'#1e293b',fontSize:11,display:'BYCLICK'},
  }));
}

function scrollForTimeline(stops,value){if(!stops.length)return 0;const scaled=Math.max(0,Math.min(1,value))*(stops.length-1),index=Math.min(stops.length-2,Math.floor(scaled));if(index<0)return stops[0];return stops[index]+(stops[index+1]-stops[index])*(scaled-index);}
function timelineForScroll(stops,top){if(stops.length<2)return 0;if(top<=stops[0])return 0;for(let i=0;i<stops.length-1;i++){if(top<stops[i+1]){const gap=stops[i+1]-stops[i];return (i+(gap?(top-stops[i])/gap:0))/(stops.length-1);}}return 1;}
// Drag continuously; snapping is a separate, release-only operation.
function snapTimeline(stops,value){if(!stops.length)return 0;return stops[Math.round(Math.max(0,Math.min(1,value))*(stops.length-1))];}
// Match the visible rail label; proximity to the next title must not change selection.
function displayedHeadingIndex(stops,top){if(top<=2||stops.length<3)return 0;let index=1;for(let i=2;i<stops.length-1;i++){if(stops[i]<=top+1)index=i;else break;}return index;}
function dateTimeline(headings,contentHeight,viewportHeight,currentTail=0,offset=16){
 const dates=headings.map(top=>Math.max(0,top-offset));
 const base=Math.max(0,contentHeight-currentTail);
 const tail=dates.length>1?Math.ceil(Math.max(0,dates[dates.length-1]+viewportHeight-base)):0;
 const max=Math.max(0,base+tail-viewportHeight);
 const stops=dates.map(top=>Math.min(max,top));
 return {tail,max,stops:[0,...stops,stops.length?stops[stops.length-1]:0]};
}
module.exports={visitKey,visitDate,visitPlace,displayedHeadingIndex,dateKey,dateTitle,dateLabel,located,filterPhotos,places,groups,years,markers,scrollForTimeline,timelineForScroll,snapTimeline,dateTimeline};
