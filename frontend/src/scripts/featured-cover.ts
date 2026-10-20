import type {Photo} from './api';
import {progressiveSources} from './photo-preview';
import {PreviewLoader} from './preview-loader';

/** Two image buffers: display one and prepare only the next daily selection. */
export function featuredCover(root:HTMLElement,photos:Photo[],open:(index:number)=>void){
 const link=root.querySelector<HTMLAnchorElement>('.folio-cover')!;
 const title=root.querySelector<HTMLElement>('#cover-title')!;
 const count=root.querySelector<HTMLElement>('[data-cover-count]')!;
 const previous=root.querySelector<HTMLButtonElement>('[data-cover-prev]')!;
 const next=root.querySelector<HTMLButtonElement>('[data-cover-next]')!;
 if(!photos.length){root.querySelector<HTMLElement>('.cover-controls')!.hidden=true;return}
 const reduced=matchMedia('(prefers-reduced-motion:reduce)');
 const reasons=new Set<string>(['loading','offscreen']);
 const failed=new Set<number>();
 let current=0,active=-1,generation=0,ready=false,suppressUntil=0;
 let timer:ReturnType<typeof setTimeout>|undefined,preload:ReturnType<typeof setTimeout>|undefined;
 const buffers=Array.from({length:2},()=>{
  const image=document.createElement('img');image.decoding='async';image.setAttribute('aria-hidden','true');
  image.sizes='(max-width:700px) calc(100vw - 80px), (max-width:1000px) calc(54vw - 44px), (max-width:1512px) calc(63vw - 67px), 886px';
  link.prepend(image);return {image,index:-1,promise:Promise.resolve()};
 });
 const pending=new Map<HTMLImageElement,{resolve:()=>void;reject:()=>void}>();
 const previews=new PreviewLoader(link,2,1,{ready:image=>pending.get(image)?.resolve(),error:image=>{pending.get(image)?.reject();return false}});
 const normalize=(index:number)=>(index+photos.length)%photos.length;
 const following=()=>{for(let step=1;step<=photos.length;step++){const index=normalize(current+step);if(!failed.has(index))return index}return current};
 function prepare(slot:number,index:number){
  const buffer=buffers[slot];if(buffer.index===index)return buffer.promise;
  const photo=photos[index];buffer.index=index;
  buffer.image.alt=photo.alt||photo.title;buffer.image.width=photo.width;buffer.image.height=photo.height;
  buffer.image.fetchPriority=active<0?'high':'low';
  Object.assign(buffer.image.dataset,progressiveSources(photo,1600),{previewOwner:'cover'});
  buffer.promise=new Promise<void>((resolve,reject)=>pending.set(buffer.image,{resolve,reject}));
  previews.watch();
  // A failed preload must not hide the currently displayed work.
  buffer.promise.catch(()=>{});return buffer.promise;
 }
 function schedule(){
  clearTimeout(timer);
  const playing=ready&&photos.length-failed.size>1&&!reasons.size;
  root.dataset.playing=String(playing);
  if(playing)timer=setTimeout(()=>void show(following()),7000);
 }
 function reason(name:string,value:boolean){if(value)reasons.add(name);else reasons.delete(name);if(['hidden','offscreen','page'].includes(name)){if(reasons.has('hidden')||reasons.has('offscreen')||reasons.has('page'))previews.pause();else previews.resume()}schedule()}
 async function show(index:number){
  if(ready)root.dataset.firstFrame='false';
  clearTimeout(timer);clearTimeout(preload);reasons.add('loading');schedule();const token=++generation;
  const slot=active===0?1:0;
  try{await prepare(slot,index)}catch{
   if(token!==generation)return;
   // Skip a broken frame without hiding the previously displayed work.
   failed.add(index);reasons.delete('loading');
   if(!ready&&failed.size<photos.length){void show(following());return}
   schedule();return;
  }
  if(token!==generation||buffers[slot].index!==index)return;
  if(active>=0){buffers[active].image.dataset.active='false';buffers[active].image.setAttribute('aria-hidden','true')}
  if(!ready)root.dataset.firstFrame='true';
  buffers[slot].image.dataset.active='true';buffers[slot].image.removeAttribute('aria-hidden');
  active=slot;current=index;ready=true;failed.delete(index);
  const photo=photos[index];link.href='/photos/'+photo.slug;link.setAttribute('aria-label','查看今日精选：'+photo.title);
  title.textContent=photo.title;count.textContent=String(index+1)+' / '+String(photos.length);
  link.querySelector('.cover-loading')?.remove();reasons.delete('loading');schedule();
  if(photos.length>1)preload=setTimeout(()=>{void prepare(1-slot,normalize(index+1)).catch(()=>{})},650);
 }
 previous.onclick=()=>void show(normalize(current-1));next.onclick=()=>void show(normalize(current+1));
 previous.hidden=next.hidden=photos.length<2;
 const updatePreference=()=>reason('reduced',reduced.matches);
 updatePreference();reduced.addEventListener('change',updatePreference);
 root.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')reason('hover',true)});
 root.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse')reason('hover',false)});
 root.addEventListener('focusin',()=>reason('focus',true));
 root.addEventListener('focusout',event=>reason('focus',root.contains(event.relatedTarget as Node)));
 root.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
  event.preventDefault();void show(normalize(current+(event.key==='ArrowLeft'?-1:1)));
 });
 let pointer:number|null=null,startX=0,startY=0,swiping=false;
 link.addEventListener('pointerdown',event=>{
  if(event.pointerType!=='touch'||pointer!==null)return;
  pointer=event.pointerId;startX=event.clientX;startY=event.clientY;swiping=false;reason('touch',true);
 });
 link.addEventListener('pointermove',event=>{
  if(pointer!==event.pointerId)return;
  const dx=event.clientX-startX,dy=event.clientY-startY;
  if(!swiping&&Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*1.2){swiping=true;link.setPointerCapture(event.pointerId)}
  if(swiping)event.preventDefault();
 });
 const release=(event:PointerEvent)=>{
  if(pointer!==event.pointerId)return;
  const dx=event.clientX-startX;
  if(swiping){suppressUntil=Date.now()+500;if(event.type==='pointerup'&&Math.abs(dx)>40)void show(normalize(current+(dx<0?1:-1)))}
  pointer=null;if(link.hasPointerCapture(event.pointerId))link.releasePointerCapture(event.pointerId);reason('touch',false);
 };
 link.addEventListener('pointerup',release);link.addEventListener('pointercancel',release);
 link.addEventListener('lostpointercapture',()=>{pointer=null;reason('touch',false)});
 link.addEventListener('click',event=>{if(Date.now()<suppressUntil){event.preventDefault();return}if(ready){event.preventDefault();open(current)}});
 document.addEventListener('visibilitychange',()=>reason('hidden',document.hidden));
 document.addEventListener('photo-atlas:viewer',()=>reason('viewer',Boolean(document.querySelector('dialog[open]'))));
 window.addEventListener('pagehide',()=>{clearTimeout(preload);reason('page',true)});
 window.addEventListener('pageshow',()=>reason('page',false));
 const observer=new IntersectionObserver(entries=>reason('offscreen',!entries[0]?.isIntersecting),{threshold:.15});observer.observe(root);
 reason('hidden',document.hidden);void show(0);
}
