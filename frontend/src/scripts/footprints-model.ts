import type {Photo} from './api';

export interface AtlasFilter {
  category:string;
  query:string;
  place:string;
  from:number;
  to:number;
  includeUndated:boolean;
}

export function photoYear(photo:Photo):number {
  const match=/^(\d{4})(?:-|$)/.exec(photo.captured?.value||'');
  return match?Number(match[1]):0;
}

export function located(photo:Photo):boolean {
  const lat=photo.geo?.latitude,lon=photo.geo?.longitude;
  return typeof lat==='number'&&Number.isFinite(lat)&&Math.abs(lat)<=90&&
    typeof lon==='number'&&Number.isFinite(lon)&&Math.abs(lon)<=180;
}

export function filterPhotos(photos:Photo[],filter:AtlasFilter):Photo[] {
  const words=filter.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return photos.filter(photo=>{
    if(filter.category&&photo.category!==filter.category)return false;
    if(filter.place&&photo.geo?.label!==filter.place)return false;
    const y=photoYear(photo);
    if(y?(y<filter.from||y>filter.to):!filter.includeUndated)return false;
    const text=[photo.title,photo.caption,photo.alt,photo.geo?.label,...photo.tags].join(' ').toLocaleLowerCase();
    return words.every(word=>text.includes(word));
  }).sort((a,b)=>(photoYear(b)?b.captured?.value||'':'').localeCompare(photoYear(a)?a.captured?.value||'':'')||a.position-b.position||a.id.localeCompare(b.id));
}

export function placeGroups(photos:Photo[]):Map<string,Photo[]> {
  const groups=new Map<string,Photo[]>();
  for(const photo of photos){
    const label=photo.geo?.label?.trim();
    if(!label)continue;
    const group=groups.get(label)||[];group.push(photo);groups.set(label,group);
  }
  return new Map([...groups.entries()].sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0],'zh-CN')));
}

export function dayGroups(photos:Photo[]):Map<string,Photo[]> {
  const groups=new Map<string,Photo[]>();
  for(const photo of photos){
    const value=photo.captured?.value||'';
    const key=/^\d{4}(?:-\d{2}(?:-\d{2})?)?/.exec(value)?.[0]||'undated';
    const group=groups.get(key)||[];group.push(photo);groups.set(key,group);
  }
  return groups;
}

/** A visit is one date and one explicit place, even when other places share that date. */
export function visitKey(photo:Photo):string {return (/^\d{4}(?:-\d{2}(?:-\d{2})?)?/.exec(photo.captured?.value||'')?.[0]||'undated')+'~'+encodeURIComponent((photo.geo?.label||'').trim())}
export function visitDate(key:string):string {return key.split('~')[0]}
export function visitPlace(key:string):string {return key.includes('~')?decodeURIComponent(key.slice(key.indexOf('~')+1)):''}
export function visitGroups(photos:Photo[]):Map<string,Photo[]> {
 const visits=new Map<string,Photo[]>();for(const photo of photos){const key=visitKey(photo);const group=visits.get(key)||[];group.push(photo);visits.set(key,group)}return visits;
}
export function visitTitle(key:string):string {return dayTitle(visitDate(key))+' · '+(visitPlace(key)||'地点待补充')}
export function visitLabel(key:string):string {return dayLabel(visitDate(key))+' · '+(visitPlace(key)||'地点待补充')}

export function dayTitle(key:string):string {
  key=visitDate(key);
  if(key==='undated')return '日期待补充';
  const [y,m,d]=key.split('-');
  return d?`${y} 年 ${Number(m)} 月 ${Number(d)} 日`:m?`${y} 年 ${Number(m)} 月 · 日待补充`:`${y} 年 · 日期待补充`;
}

export function dayLabel(key:string):string {key=visitDate(key);return /^\d{4}-\d{2}-\d{2}$/.test(key)?key:dayTitle(key)}

export function dateLabel(photo:Photo):string {
  return photoYear(photo)?photo.captured?.value||'日期待补充':'日期待补充';
}

/** Equal time slots navigate unequal section heights; the final stop is the page end. */
export function scrollForTimeline(stops:number[],progress:number):number {
  if(!stops.length)return 0;
  if(stops.length===1)return stops[0];
  const position=Math.max(0,Math.min(1,progress))*(stops.length-1);
  const index=Math.min(stops.length-2,Math.floor(position)),fraction=position-index;
  return stops[index]+(stops[index+1]-stops[index])*fraction;
}

export function timelineForScroll(stops:number[],scroll:number):number {
  if(stops.length<2||stops.at(-1)!<=stops[0])return 0;
  if(scroll>=stops.at(-1)!)return 1;
  if(scroll<=stops[0])return 0;
  let index=0;
  while(index<stops.length-2&&stops[index+1]<=scroll)index++;
  const span=stops[index+1]-stops[index];
  return (index+(span>0?(scroll-stops[index])/span:0))/(stops.length-1);
}

/** Rail input lands at a date title, independent of each day's photo count. */
export function snapTimeline(stops:number[],progress:number):number {
  return stops.length?stops[Math.round(Math.max(0,Math.min(1,progress))*(stops.length-1))]:0;
}
/** The highlighted rail label owns the snap target, even if another heading is closer. */
export function displayedHeadingIndex(stops:number[],scroll:number):number {
  if(scroll<=2||stops.length<3)return 0;
  let index=1;for(let i=2;i<stops.length-1;i++){if(stops[i]<=scroll+1)index=i;else break}
  return index;
}
export function dateTimeline(headings:number[],contentHeight:number,viewportHeight:number,currentTail=0,offset=16):{tail:number;max:number;stops:number[]} {
  const dates=headings.map(top=>Math.max(0,top-offset)),base=Math.max(0,contentHeight-currentTail);
  const tail=dates.length>1?Math.ceil(Math.max(0,dates[dates.length-1]+viewportHeight-base)):0;
  const max=Math.max(0,base+tail-viewportHeight);
  const stops=dates.map(top=>Math.min(max,top));
  return {tail,max,stops:[0,...stops,stops.at(-1)??0]};
}
