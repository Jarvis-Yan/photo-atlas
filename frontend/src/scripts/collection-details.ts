import type {Album} from './api';

const templates=new Set(['按地点汇集旅行作品；不同年份在足迹时间轴中浏览。','同一拍摄项目的作品；跨地点按系列保持完整。','围绕统一视觉主题整理，不推测未知拍摄地点。']);
export function albumFacts(album:Album){
  const years=[...new Set((album.years||[]).filter(year=>Number.isInteger(year)&&year>=1800&&year<=2200))].sort((a,b)=>a-b);
  const year=years.length?(years.length===1?String(years[0]):`${years[0]}—${years.at(-1)}`):'';
  const places=[...new Set(album.places||[])];
  const prefix=places[0]?.split(' ')[0];
  const shorten=prefix&&album.title.includes(prefix);
  const labels=places.map(place=>shorten&&place.startsWith(prefix+' ')?place.slice(prefix.length+1):place);
  return {year,places:labels.slice(0,3).join(' · ')+(labels.length>3?` 等 ${labels.length} 个地点`:''),description:templates.has(album.description.trim())?'':album.description.trim()};
}

export function contactDestination(value:string):string|null {
  const text=value.trim();
  if(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(text)&&!/[\r\n]/.test(text))return 'mailto:'+encodeURIComponent(text).replace('%40','@');
  if(/^\+?[\d ()-]{7,24}$/.test(text))return 'tel:'+text.replace(/[ ()-]/g,'');
  try{const url=new URL(text);if(['https:','http:'].includes(url.protocol))return url.href}catch{}
  return null;
}
