import {refractionFilter} from './glass-button';

/** Shared public-site material. Keep native labels, handlers and pressed states. */
export function installPublicGlass(){
 const selector=[
  '.site-header button','.hero-actions a','.about-actions a',
  '.circular-nav button','.cover-actions button',
  '.collection-scope button','.category-filter button',
  '.collection-tool > summary','.atlas-advanced > summary',
  '#public-main .button','#public-main .text-button',
  '.atlas-text-button','.atlas-active-filters button',
  '.collection-back','.viewer-toolbar button','#viewer-retry','#viewer-exif button','#viewer-exif .button'
 ].join(',');
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
 svg.classList.add('public-glass-defs');svg.setAttribute('width','0');svg.setAttribute('height','0');
 document.body.append(svg);
 const filters=new Map<HTMLElement,{id:string;size:string;defs:SVGDefsElement}>();
 let serial=0;
 function resize(element:HTMLElement){
  const saved=filters.get(element);if(!saved)return;
  const w=element.offsetWidth,h=element.offsetHeight,size=w+'x'+h;
  if(!w||!h||size===saved.size)return;
  saved.size=size;saved.defs.innerHTML=refractionFilter(saved.id,w,h);
  element.style.setProperty('--glass-lens',`url("#${saved.id}")`);
 }
 const observer=new ResizeObserver(entries=>entries.forEach(entry=>resize(entry.target as HTMLElement)));
 function scan(){
  // Infinite loading and filter chips may remove controls; release their SVG filters.
  for(const [element,saved] of filters){if(!element.isConnected){observer.unobserve(element);saved.defs.remove();filters.delete(element)}}
  document.querySelectorAll<HTMLElement>(selector).forEach(element=>{
   if(filters.has(element)||element.closest('.photo-flip'))return;
   const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');svg.append(defs);
   filters.set(element,{id:'public-glass-'+(++serial),size:'',defs});
   element.classList.add('glass-action');observer.observe(element);resize(element);
  });
 }
 let queued=false;
 const changes=new MutationObserver(records=>{
  if(queued||records.every(record=>svg.contains(record.target)))return;
  queued=true;queueMicrotask(()=>{queued=false;scan()});
 });
 scan();changes.observe(document.body,{childList:true,subtree:true});
 // The browser caches the displacement maps; no animation loop or photo downloads.
}
