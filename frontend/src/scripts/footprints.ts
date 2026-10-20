import {flipMarkup,installPhotoFlip,preparePhotoFlip} from './photo-flip';
import {installGlassButtons} from './glass-button';
import {placeReference} from '../../../miniprogram/utils/place-reference.js';
import {PreviewLoader} from './preview-loader';
import {browsingImage,clearPreview} from './photo-preview';
import {publicNavigation} from './public-navigation';
import {settledTask} from './footprints-settle';
import type * as maplibregl from 'maplibre-gl';
import type {GeoJSONSource} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {api,escaped as esc,notice,errorText,type Photo} from './api';
import {photoYear,located,filterPhotos,placeGroups,dayGroups,dayTitle,dayLabel,dateLabel,snapTimeline,dateTimeline,timelineForScroll,type AtlasFilter} from './footprints-model';

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const params=new URLSearchParams(location.search);
const validCategories=['','人像','自然','城市','星空'];
const filter:AtlasFilter={category:validCategories.includes(params.get('category')||'')?params.get('category')||'':'',query:(params.get('q')||'').slice(0,240),place:params.get('place')||'',from:0,to:0,includeUndated:params.get('undated')!=='0'};
let photos:Photo[]=[],shown:Photo[]=[],minYear=0,maxYear=0;
let loaded=false,loading=false,needsFit=true;
let map:maplibregl.Map|null=null,mapReady=false;
let mapEngine:typeof import('maplibre-gl')|undefined;
let groups=new Map<string,Photo[]>(),timeKeys:string[]=[],timeStops:number[]=[];
let currentKey='',currentPhotoId='',trackingFrame=0,measureFrame=0,railDragging=false;
let mapOverview=true,mapDayKey='',mapPhotoId='';
const mapSettlement=settledTask(commitMapSelection);
const previews=new PreviewLoader(el('atlas-gallery'));
const contextPreviews=new PreviewLoader(el('atlas-preview'),2,1);
let photoStops:Array<{key:string;id:string;top:number;left:number}>=[];
let searchTimer:ReturnType<typeof setTimeout>;
const progress=el<HTMLInputElement>('atlas-time-progress'),rail=el('atlas-time-rail'),story=el('atlas-story');
publicNavigation.useScrollContainer(story);
const footer=document.querySelector<HTMLElement>('.site-footer');
if(footer)story.append(footer);

function image(photo:Photo,sizes:string,eager=false,full=false):string {
  const small=browsingImage(photo,160),lite=browsingImage(photo,320),mapThumb=sizes==='80px';
  const clear=clearPreview(photo,mapThumb?480:full?1600:960);
  const fallback='/media/'+photo.id+'/thumb-v1-'+(mapThumb?320:full?1280:768)+'.webp';
  return `<img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" data-preview-src="${esc(clear.src)}" data-preview-srcset="${esc(clear.srcset)}" data-preview-small="${esc(small.src)}" data-preview-lite="${esc(lite.src)}" data-preview-fallback="/media/${esc(photo.id)}/480.webp" data-preview-clear-fallback="${esc(fallback)}" sizes="${sizes}" width="${photo.width}" height="${photo.height}" style="aspect-ratio:${photo.width}/${photo.height}" alt="${esc(photo.alt||photo.title)}" decoding="async"/>`;
}
function photoLink(photo:Photo):string {return '/photos/'+encodeURIComponent(photo.slug)}
function open(photo:Photo):void {document.dispatchEvent(new CustomEvent('pixelcore:open-photo',{detail:{photos:shown,index:shown.findIndex(item=>item.id===photo.id),pure:true}}))}
function plainClick(event:MouseEvent):boolean {return event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey}
function uncertainty(photo:Photo):string {return photo.geo?.status==='approximate'?' · 地点推测':''}
function syncUrl():void {
  const url=new URL(location.href);url.searchParams.delete('view');
  const values:Record<string,string>={place:filter.place,q:filter.query,category:filter.category,from:minYear&&filter.from!==minYear?String(filter.from):'',to:maxYear&&filter.to!==maxYear?String(filter.to):'',undated:filter.includeUndated?'':'0'};
  for(const [key,value] of Object.entries(values)){if(value)url.searchParams.set(key,value);else url.searchParams.delete(key)}
  history.replaceState(history.state,'',url.pathname+url.search+url.hash);
}
function refresh():void {story.scrollTop=0;currentKey='';currentPhotoId='';needsFit=true;render();syncUrl()}
function selectPlace(label:string):void {
  filter.place=label;refresh();
  requestAnimationFrame(()=>{measureTimeline();seekProgress(0)});
}
function updateControls():void {
  const places=placeGroups(filterPhotos(photos,{...filter,place:''})),select=el<HTMLSelectElement>('atlas-place');
  const options=[`<option value="">全部地点（${places.size}）</option>`];
  if(filter.place&&!places.has(filter.place))options.push(`<option value="${esc(filter.place)}">${esc(filter.place)} · 0 张</option>`);
  for(const [label,list] of places)options.push(`<option value="${esc(label)}">${esc(label)} · ${list.length} 张</option>`);
  select.innerHTML=options.join('');select.value=filter.place;
  for(const name of ['from','to'] as const){
    const input=el<HTMLInputElement>('year-'+name);input.min=String(minYear);input.max=String(maxYear);input.value=String(filter[name]);input.disabled=!minYear;
    el('year-'+name+'-value').textContent=minYear?String(filter[name]):'暂无日期';
  }
  el('atlas-undated-field').hidden=!photos.some(photo=>!photoYear(photo));
  const chips:Array<[string,string]>=[];
  if(filter.place)chips.push(['place',filter.place]);if(filter.category)chips.push(['category',filter.category]);if(filter.query)chips.push(['query','搜索：'+filter.query]);
  if(minYear&&(filter.from!==minYear||filter.to!==maxYear))chips.push(['time',filter.from===filter.to?String(filter.from):`${filter.from}—${filter.to}`]);
  if(!filter.includeUndated)chips.push(['undated','仅显示有日期的作品']);
  const row=el('atlas-active-filters');row.hidden=!chips.length;
  row.innerHTML=chips.map(([key,label])=>`<button type="button" data-clear="${key}" aria-label="清除筛选：${esc(label)}">${esc(label)} <span aria-hidden="true">×</span></button>`).join('');
}
function card(photo:Photo,key:string,eager:boolean,full:boolean):string {
  const sizes=full?'(min-width:701px) and (max-width:900px) and (max-height:550px) calc(60vw - 50.4px), (max-width:900px) calc(100vw - 60px), (max-width:1100px) calc(57vw - 60px), (max-width:1512px) calc(54.625vw - 64.4px), 757px':'(min-width:701px) and (max-width:900px) and (max-height:550px) calc(30vw - 32.2px), (max-width:900px) calc((100vw - 74px)/2), (max-width:1100px) calc((57vw - 76px)/2), (max-width:1512px) calc((54.625vw - 88.4px)/2), 367px';
  return `<article id="work-${esc(photo.id)}" class="atlas-work ${full?'atlas-work-full':''}" data-photo="${esc(photo.id)}" data-day="${key}"><div class="atlas-flip-slot" style="aspect-ratio:${photo.width}/${photo.height}">${flipMarkup(photo,shown.indexOf(photo),image(photo,sizes,eager,full))}</div></article>`;
}
installPhotoFlip(el('atlas-gallery'));installGlassButtons(el('atlas-gallery'));
function renderGallery():void {
  el('atlas-result-title').textContent=filter.place||'拍摄记录';
  const unknown=shown.filter(photo=>!photoYear(photo)).length;
  el('atlas-result-count').textContent=`${shown.length} 张作品${unknown?' · '+unknown+' 张日期待补充':''}`;
  groups=dayGroups(shown);timeKeys=[...groups.keys()];
  el('atlas-gallery').innerHTML=shown.length?[...groups].map(([key,list],index)=>`<section class="atlas-day-group" id="day-${key}" aria-labelledby="day-title-${key}"><div class="atlas-day-heading"><h3 id="day-title-${key}">${dayTitle(key)}</h3><span>${list.length} 张作品</span></div><div class="atlas-work-grid">${list.map((photo,i)=>card(photo,key,index===0&&i===0,i===0)).join('')}</div></section>`).join(''):'<div class="atlas-empty"><p>没有符合当前筛选的作品。</p><button type="button" class="atlas-text-button" data-reset>清除筛选，浏览全部作品</button></div>';
}
function renderContext():void {
  const photo=shown.find(item=>item.id===mapPhotoId);
  const place=photo?.geo?.label||'地点待补充';
  el('atlas-preview').innerHTML=mapOverview
    ?`<div class="atlas-overview-mark" aria-hidden="true">◎</div><div><h2>全部足迹</h2><p>${placeGroups(shown).size} 个地点 · ${shown.length} 张作品</p><p class="atlas-context-title">${minYear}—${maxYear}</p></div>`
    :photo?`<a href="${photoLink(photo)}" data-photo="${esc(photo.id)}" aria-label="查看当前作品：${esc(photo.title)}">${image(photo,'80px')}</a><div><h2>${dayTitle(mapDayKey)}</h2><p>${esc(place)}${uncertainty(photo)}</p><p class="atlas-context-title">${esc(photo.title)}</p></div>`:'';
  contextPreviews.watch();
  const area=placeReference(photo);
  el('atlas-location-note').hidden=mapOverview||!photo||located(photo);
  el('atlas-location-note').textContent=area?'地点范围参考，不代表精确拍摄点。':'这张照片暂无公开坐标，地图显示全部足迹。';
  el('atlas-map-panel').dataset.mapMode=mapOverview?'overview':'place';
}
function renderRail():void {
  rail.hidden=timeKeys.length<2;progress.disabled=timeKeys.length<2;
  el('atlas-time-ticks').innerHTML=['overview',...timeKeys,'end'].map((key,index)=>`<span class="atlas-time-tick" data-tick="${index}" style="top:${index/Math.max(1,timeKeys.length+1)*100}%"></span>`).join('');
}
// The map owns a layout pane; only the adjacent photo story scrolls.
function readingOffset():number {return innerWidth<=900?16:20}
function contentTop(node:HTMLElement):number {return node.getBoundingClientRect().top-story.getBoundingClientRect().top+story.scrollTop}
function syncAtlasLayout():void {
  const viewport=window.visualViewport;
  rail.style.setProperty('--rail-center',((viewport?.offsetTop||0)+(viewport?.height||innerHeight)/2)+'px');
  document.body.style.setProperty('--atlas-header-height',document.querySelector<HTMLElement>('.site-header')!.offsetHeight+'px');
  map?.resize();queueMeasure();
}
function scheduleMapUpdate():void {
  // Stop a previous camera transition immediately; do not chase a moving page.
  map?.stop();el('atlas-map-panel').setAttribute('aria-busy','true');mapSettlement.schedule();
}
function commitMapSelection():void {
  if(!shown.length)return;
  trackScroll();previews.resume();
  const overview=story.scrollTop<=2;
  const changed=needsFit||overview!==mapOverview||(!overview&&(mapDayKey!==currentKey||mapPhotoId!==currentPhotoId));
  mapOverview=overview;mapDayKey=currentKey;mapPhotoId=currentPhotoId;
  el('atlas-map-panel').setAttribute('aria-busy','false');
  if(!changed)return;
  needsFit=true;renderContext();updateMap();fitMap();
}
function measureTimeline():void {
  cancelAnimationFrame(measureFrame);measureFrame=0;
  const tail=el('atlas-timeline-tail'),oldTail=parseFloat(tail.style.height)||0;
  const layout=dateTimeline(timeKeys.map(key=>contentTop(el('day-title-'+key))),story.scrollHeight,story.clientHeight,oldTail,readingOffset());
  if(Math.abs(layout.tail-oldTail)>1){tail.style.height=layout.tail+'px';queueMeasure()}
  rail.hidden=timeKeys.length<2||layout.max===0;progress.disabled=rail.hidden;
  timeStops=layout.stops;
  photoStops=Array.from(el('atlas-gallery').querySelectorAll<HTMLElement>('.atlas-work')).map(node=>{const box=node.getBoundingClientRect();return{key:node.dataset.day!,id:node.dataset.photo!,top:contentTop(node),left:box.left}}).sort((a,b)=>a.top-b.top||b.left-a.left);
  trackScroll();
}
function queueMeasure():void {if(!measureFrame)measureFrame=requestAnimationFrame(measureTimeline)}
function setCurrent(key:string,id:string):void {
  if(key===currentKey&&id===currentPhotoId)return;
  document.getElementById('work-'+currentPhotoId)?.removeAttribute('aria-current');
  currentKey=key;currentPhotoId=id;
  document.getElementById('work-'+id)?.setAttribute('aria-current','true');
}
function trackScroll():void {
  cancelAnimationFrame(trackingFrame);trackingFrame=0;
  if(!timeKeys.length||!timeStops.length)return;
  const scroll=story.scrollTop;
  let index=0;
  for(let i=1;i<timeKeys.length;i++){if(timeStops[i+1]<=scroll+1)index=i;else break}
  const key=timeKeys[index],line=scroll+readingOffset()+12;
  const candidates=photoStops.filter(point=>point.key===key);
  let current=candidates[0];for(const point of candidates){if(point.top<=line)current=point;else break}
  setCurrent(key,current?.id||groups.get(key)![0].id);
  const value=scroll<=2?0:timelineForScroll(timeStops,scroll);
  if(!railDragging)progress.value=String(Math.round(value*1000));
  rail.style.setProperty('--time-progress',(value*100)+'%');
  const label=scroll<=2?'全部足迹':dayLabel(key);
  el('atlas-time-current').textContent=label;progress.setAttribute('aria-valuetext',label);
  const active=scroll<=2?0:scroll>=timeStops[timeStops.length-1]-1?timeKeys.length+1:index+1;
  el('atlas-time-ticks').querySelectorAll<HTMLElement>('[data-tick]').forEach(tick=>{
    const distance=Math.abs(Number(tick.dataset.tick)-active);
    tick.hidden=false;
    tick.style.setProperty('--tick-scale',String([1,.58,.34][distance]??.14));
    tick.style.setProperty('--tick-opacity',String([1,.54,.34][distance]??.24));
    tick.dataset.active=String(distance===0);
  });
}
function queueTracking():void {if(!trackingFrame)trackingFrame=requestAnimationFrame(trackScroll)}
function seekProgress(value:number):void {
  if(!timeStops.length)return;previews.pause();scheduleMapUpdate();
  story.scrollTo({top:snapTimeline(timeStops,value),behavior:'instant'});queueTracking();
}
function render():void {
  if(!loaded)return;
  shown=filterPhotos(photos,filter);updateControls();renderGallery();el('atlas-gallery').querySelectorAll<HTMLElement>('.atlas-work').forEach(preparePhotoFlip);previews.watch();renderRail();
  el('atlas-map-panel').hidden=!shown.length;el('atlas-retry').hidden=true;
  if(shown.length){currentKey=timeKeys[0];currentPhotoId=groups.get(currentKey)![0].id;document.getElementById('work-'+currentPhotoId)?.setAttribute('aria-current','true');needsFit=true;requestAnimationFrame(()=>{syncAtlasLayout();measureTimeline();commitMapSelection();publicNavigation.restore()})}
  else {currentKey='';currentPhotoId='';timeStops=[];photoStops=[]}
}
function reset():void {
  filter.category='';filter.query='';filter.place='';filter.from=minYear;filter.to=maxYear;filter.includeUndated=true;
  el<HTMLSelectElement>('atlas-category').value='';el<HTMLInputElement>('atlas-search').value='';el<HTMLInputElement>('include-undated').checked=true;
  clearTimeout(searchTimer);refresh();
}
function mapGroups(){return [...placeGroups(mapOverview?shown:groups.get(mapDayKey)||[]).entries()].map(([label,list])=>({label,list,photo:list.find(located)})).filter(group=>group.photo)}
function updateMap():void {
  if(!map||!mapReady)return;
  const active=mapOverview?undefined:shown.find(photo=>photo.id===mapPhotoId)?.geo?.label;
  const features=mapGroups().map(({label,list,photo})=>({type:'Feature' as const,geometry:{type:'Point' as const,coordinates:[photo!.geo!.longitude!,photo!.geo!.latitude!]},properties:{label,count:list.length,selected:label===active,approximate:list.some(item=>item.geo?.status==='approximate')}}));
  (map.getSource('places') as GeoJSONSource).setData({type:'FeatureCollection',features});
}
function fitMap():void {
  if(!map||!mapReady||!needsFit||!loaded||!shown.length)return;needsFit=false;
  const current=mapOverview?undefined:shown.find(photo=>photo.id===mapPhotoId);
  const duration=matchMedia('(prefers-reduced-motion:reduce)').matches?0:300;
  map.stop();
  if(current&&located(current)){map.easeTo({center:[current.geo!.longitude!,current.geo!.latitude!],zoom:current.geo?.precision==='city'?8:10,duration});return}
  const area=placeReference(current);if(area){map.easeTo({center:[area.longitude,area.latitude],zoom:area.scale,duration});return}
  const points=(mapOverview?shown:current&&!located(current)?shown:groups.get(mapDayKey)||[]).map(photo=>located(photo)?photo.geo:placeReference(photo)).filter((point):point is {latitude:number;longitude:number}=>!!point&&typeof point.latitude==='number'&&typeof point.longitude==='number');if(!points.length){map.easeTo({center:[112,32],zoom:2.2,duration});return}
  const bounds=new mapEngine!.LngLatBounds();points.forEach(point=>bounds.extend([point.longitude,point.latitude]));map.fitBounds(bounds,{padding:Math.min(40,el('atlas-map').clientWidth/8),maxZoom:8,duration});
}

function paintMap():void {
  if(!map||!mapReady)return;
  const dark=document.documentElement.dataset.theme==='dark';
  const ground=dark?'#192c40':'#edf2f5',water=dark?'#122237':'#cbdce7',ink=dark?'#b3c2d7':'#52647a';
  for(const layer of map.getStyle().layers||[]){
    const source='source-layer' in layer?layer['source-layer']:'';
    if(layer.id.startsWith('atlas-'))continue;
    if(layer.type==='background')map.setPaintProperty(layer.id,'background-color',ground);
    if(layer.type==='fill'){
      if(source==='water')map.setPaintProperty(layer.id,'fill-color',water);
      else if(['landcover','landuse','park','building'].includes(source||''))map.setPaintProperty(layer.id,'fill-color',dark?'#23394b':'#dde6e8');
    }
    if(layer.type==='line'&&source==='transportation')map.setPaintProperty(layer.id,'line-color',dark?'#344c60':'#f8fafb');
    if(layer.type==='symbol'&&layer.layout?.['text-field']){map.setPaintProperty(layer.id,'text-color',ink);map.setPaintProperty(layer.id,'text-halo-color',ground)}
  }
  const accent=dark?'#8ccff2':'#286b9a',selected=dark?'#edf1f7':'#15243a',text=dark?'#15243a':'#ffffff';
  map.setPaintProperty('atlas-clusters','circle-color',accent);
  map.setPaintProperty('atlas-cluster-counts','text-color',text);
  map.setPaintProperty('atlas-places','circle-color',['case',['get','selected'],selected,['get','approximate'],'#9c723b',accent]);
  map.setPaintProperty('atlas-place-counts','text-color',text);
}
async function initMap():Promise<void> {
  try{
    // Fetch and render the photo timeline independently of the larger map engine.
    const engine=await import('maplibre-gl');mapEngine=engine;
    engine.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
    map=new engine.Map({container:'atlas-map',style:'https://tiles.openfreemap.org/styles/liberty',center:[112,32],zoom:2.2,attributionControl:{compact:true}});
    let attributionCollapsed=false;
    map.on('sourcedata',()=>{
      if(innerWidth>900||attributionCollapsed)return;
      const attribution=el('atlas-map').querySelector('.maplibregl-ctrl-attrib.maplibregl-compact-show');
      const button=attribution?.querySelector<HTMLButtonElement>('.maplibregl-ctrl-attrib-button');
      // Keep the attribution available through its own control without covering a small map.
      if(button){button.click();attributionCollapsed=true}
    });
    map.scrollZoom.disable();
    map.addControl(new engine.NavigationControl({showCompass:false}),'top-right');
    map.on('error',()=>{el('atlas-map-loading').hidden=true;if(!mapReady)el('atlas-map-error').hidden=false});
    map.once('idle',()=>{el('atlas-map-loading').hidden=true});
    map.on('load',()=>{
      if(!map)return;
      mapReady=true;el('atlas-map-error').hidden=false;
      map.addSource('places',{type:'geojson',data:{type:'FeatureCollection',features:[]},cluster:true,clusterMaxZoom:11,clusterRadius:40,clusterProperties:{photos:['+',['get','count']]}});
      map.addLayer({id:'atlas-clusters',type:'circle',source:'places',filter:['has','point_count'],paint:{'circle-color':'#286b9a','circle-radius':['step',['get','photos'],20,20,25,60,31],'circle-stroke-width':2,'circle-stroke-color':'#ffffff'}});
      map.addLayer({id:'atlas-cluster-counts',type:'symbol',source:'places',filter:['has','point_count'],layout:{'text-field':['to-string',['get','photos']],'text-size':13,'text-font':['Noto Sans Regular']},paint:{'text-color':'#ffffff'}});
      map.addLayer({id:'atlas-places',type:'circle',source:'places',filter:['!', ['has','point_count']],paint:{'circle-color':'#286b9a','circle-radius':['step',['get','count'],16,10,20,30,25],'circle-stroke-width':2,'circle-stroke-color':'#ffffff'}});
      map.addLayer({id:'atlas-place-counts',type:'symbol',source:'places',filter:['!', ['has','point_count']],layout:{'text-field':['to-string',['get','count']],'text-size':12,'text-font':['Noto Sans Regular']},paint:{'text-color':'#ffffff'}});
      paintMap();updateMap();needsFit=true;scheduleMapUpdate();el('atlas-map-error').hidden=true;
      map.on('click','atlas-clusters',async event=>{
        const feature=event.features?.[0];if(!feature||!map)return;
        try{const zoom=await (map.getSource('places') as GeoJSONSource).getClusterExpansionZoom(Number(feature.properties!.cluster_id));map.easeTo({center:(feature.geometry as GeoJSON.Point).coordinates as [number,number],zoom,duration:matchMedia('(prefers-reduced-motion:reduce)').matches?0:400})}catch{}
      });
      map.on('click','atlas-places',event=>{const label=event.features?.[0]?.properties?.label;if(typeof label==='string')selectPlace(label)});
      for(const layer of ['atlas-clusters','atlas-places']){
        map.on('mouseenter',layer,()=>{if(map)map.getCanvas().style.cursor='pointer'});
        map.on('mouseleave',layer,()=>{if(map)map.getCanvas().style.cursor=''});
      }
    });
    new MutationObserver(()=>paintMap()).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  }catch{el('atlas-map-loading').hidden=true;el('atlas-map-error').hidden=false}
}


async function load():Promise<void> {
  if(loading)return;loading=true;
  el('atlas-result-count').textContent='正在加载摄影足迹…';el('atlas-retry').hidden=true;
  try{
    const data=await api<{photos:Photo[];total:number}>('/public/footprints?limit=500');
    const collected=[...data.photos];
    while(collected.length<data.total){
      const next=await api<{photos:Photo[]}>(`/public/footprints?limit=500&offset=${collected.length}`);
      if(!next.photos.length)throw new Error('作品数据未加载完整，请重试。');collected.push(...next.photos);
    }
    photos=[...new Map(collected.map(photo=>[photo.id,photo])).values()];
    const years=photos.map(photoYear).filter(Boolean);minYear=years.length?Math.min(...years):0;maxYear=years.length?Math.max(...years):0;
    filter.from=Math.max(minYear,Math.min(maxYear,Number(params.get('from'))||minYear));
    filter.to=Math.max(filter.from,Math.min(maxYear,Number(params.get('to'))||maxYear));
    el<HTMLSelectElement>('atlas-category').value=filter.category;el<HTMLInputElement>('atlas-search').value=filter.query;el<HTMLInputElement>('include-undated').checked=filter.includeUndated;
    const range=minYear?(minYear===maxYear?String(minYear):`${minYear}—${maxYear}`):'';
    el('atlas-stats').textContent=[`${placeGroups(photos).size} 个地点`,`${photos.length} 张作品`,range].filter(Boolean).join(' · ');
    loaded=true;render();syncUrl();
  }catch(error){
    el('atlas-result-count').textContent='摄影足迹暂未加载完成。';el('atlas-preview').innerHTML='<p class="atlas-context-loading">照片暂未加载，请重新加载。</p>';el('atlas-retry').hidden=false;notice(errorText(error),true);
  }finally{loading=false}
}


el<HTMLSelectElement>('atlas-place').onchange=event=>selectPlace((event.target as HTMLSelectElement).value);
el<HTMLInputElement>('atlas-search').oninput=event=>{filter.query=(event.target as HTMLInputElement).value.trim();clearTimeout(searchTimer);searchTimer=setTimeout(()=>refresh(),180)};
el<HTMLSelectElement>('atlas-category').onchange=event=>{filter.category=(event.target as HTMLSelectElement).value;refresh()};
el<HTMLInputElement>('year-from').oninput=event=>{filter.from=Math.min(Number((event.target as HTMLInputElement).value),filter.to);refresh()};
el<HTMLInputElement>('year-to').oninput=event=>{filter.to=Math.max(Number((event.target as HTMLInputElement).value),filter.from);refresh()};
el<HTMLInputElement>('include-undated').onchange=event=>{filter.includeUndated=(event.target as HTMLInputElement).checked;refresh()};
el('atlas-clear').onclick=reset;el('atlas-retry').onclick=()=>void load();
el('atlas-active-filters').onclick=event=>{
  const key=(event.target as Element).closest<HTMLButtonElement>('[data-clear]')?.dataset.clear;if(!key)return;
  if(key==='place')filter.place='';if(key==='category'){filter.category='';el<HTMLSelectElement>('atlas-category').value=''}
  if(key==='query'){filter.query='';el<HTMLInputElement>('atlas-search').value='';clearTimeout(searchTimer)}
  if(key==='time'){filter.from=minYear;filter.to=maxYear}if(key==='undated'){filter.includeUndated=true;el<HTMLInputElement>('include-undated').checked=true}refresh();
};
el('atlas-preview').onclick=event=>{
  const target=event.target as Element;if(target.closest('[data-clear-place]')){selectPlace('');return}
  const link=target.closest<HTMLAnchorElement>('a[data-photo]');if(link&&plainClick(event)){event.preventDefault();const photo=shown.find(item=>item.id===link.dataset.photo);if(photo)open(photo)}
};
el('atlas-gallery').onclick=event=>{
  const target=event.target as Element;if(target.closest('[data-reset]')){reset();return}
  const button=target.closest<HTMLButtonElement>('.flip-view[data-photo-index]');if(button){event.preventDefault();const photo=shown[Number(button.dataset.photoIndex)];if(photo)open(photo)}
};
progress.oninput=()=>seekProgress(Number(progress.value)/1000);
progress.onkeydown=event=>{
  if(!timeStops.length)return;
  const last=timeStops.length-1,index=Math.round(Number(progress.value)/1000*last);
  const steps:Record<string,number>={ArrowDown:1,ArrowRight:1,ArrowUp:-1,ArrowLeft:-1,PageDown:5,PageUp:-5};
  const next=event.key==='Home'?0:event.key==='End'?last:event.key in steps?Math.max(0,Math.min(last,index+steps[event.key])):undefined;
  if(next===undefined)return;event.preventDefault();progress.value=String(Math.round(next/last*1000));seekProgress(next/last);
};
progress.addEventListener('pointerdown',()=>{railDragging=true;previews.pause();rail.dataset.dragging='true';map?.stop();mapSettlement.hold()});
const finishSeek=()=>{if(!railDragging)return;railDragging=false;rail.dataset.dragging='false';queueTracking();mapSettlement.release()};
window.addEventListener('pointerup',finishSeek);window.addEventListener('pointercancel',finishSeek);
el('atlas-time-top').onclick=()=>{story.scrollTo({top:0,behavior:'instant'});queueTracking();scheduleMapUpdate()};
story.addEventListener('scroll',()=>{queueTracking();scheduleMapUpdate()},{passive:true});
window.addEventListener('resize',()=>{syncAtlasLayout();needsFit=true;scheduleMapUpdate()});
window.visualViewport?.addEventListener('resize',syncAtlasLayout);
window.visualViewport?.addEventListener('scroll',syncAtlasLayout);
new ResizeObserver(queueMeasure).observe(el('atlas-gallery'));
new ResizeObserver(syncAtlasLayout).observe(el('atlas-map-panel'));
new ResizeObserver(syncAtlasLayout).observe(story);
new ResizeObserver(syncAtlasLayout).observe(document.querySelector('.site-header')!);
const advanced=el<HTMLDetailsElement>('atlas-advanced');
document.addEventListener('click',event=>{if(!advanced.contains(event.target as Node))advanced.open=false});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&advanced.open){advanced.open=false;advanced.querySelector('summary')?.focus()}});
syncAtlasLayout();void initMap();void load();
