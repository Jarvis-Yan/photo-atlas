import {api,escaped,type Catalog,type Photo} from './api';
import {progressiveMarkup} from './progressive-markup';

/** Only use confirmed place labels; daily curation is not a claim about a whole trip. */
export function journeySelection(photos:Photo[]){
 const groups=new Map<string,Photo[]>();
 for(const photo of photos){
  if(photo.geo?.status!=='resolved'||!photo.geo.label)continue;
  const list=groups.get(photo.geo.label)||[];
  if(!list.some(item=>item.id===photo.id))list.push(photo);
  groups.set(photo.geo.label,list);
 }
 const group=[...groups.entries()].filter(([,list])=>list.length>=2).sort((a,b)=>b[1].length-a[1].length)[0];
 return group?{place:group[0],photos:group[1].slice(0,3)}:null;
}
export async function homeJourney(catalog:Catalog,open:(index:number,photos:Photo[])=>void){
 const root=document.getElementById('home-journey');if(!root)return;
 let selection=journeySelection(catalog.photos);
 if(!selection){
  const album=catalog.albums.find(item=>item.kind==='travel'&&item.count>=2);
  if(!album)return;
  try{const data=await api<{photos:Photo[]}>('/public/albums/'+encodeURIComponent(album.slug)+'?limit=12');selection=journeySelection(data.photos)}catch{return}
 }
 if(!selection)return;
 const {place,photos}=selection;
 document.getElementById('journey-title')!.textContent=place+'的拍摄记录';
 const dates=[...new Set(photos.map(photo=>photo.captured?.value||'').filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(value)))].sort();
 const date=document.getElementById('journey-date')!;
 const datedCount=photos.filter(photo=>/^\d{4}-\d{2}-\d{2}$/.test(photo.captured?.value||'')).length;
 const prefix=datedCount<photos.length?'已知拍摄日期：':'';
 date.textContent=dates.length===1?prefix+dates[0]:dates.length?prefix+'照片拍于 '+dates[0]+' 至 '+dates.at(-1):'';
 date.hidden=!dates.length;
 (document.getElementById('journey-link') as HTMLAnchorElement).href='/footprints/?place='+encodeURIComponent(place);
 const gallery=document.getElementById('journey-photos')!;
 gallery.dataset.count=String(photos.length);
 gallery.innerHTML=photos.map((photo,index)=>{
  const mobile=photos.length===3&&index===0?'calc(100vw - 80px)':'calc((100vw - 94px)/2)';
  return '<a href="/photos/'+escaped(photo.slug)+'" class="journey-photo" data-journey-index="'+index+'"><figure>'+progressiveMarkup(photo,'(max-width:700px) '+mobile+', 40vw',1600)+'<figcaption>'+escaped(photo.title)+'</figcaption></figure></a>';
 }).join('');
 gallery.querySelectorAll<HTMLAnchorElement>('[data-journey-index]').forEach(link=>link.addEventListener('click',event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();open(Number(link.dataset.journeyIndex),photos)}));
 root.dataset.ready='true';root.hidden=root.dataset.filtered==='true';
}
