import {browsingImage} from './photo-preview';
import type {Photo} from './api';

/** Show a light preview immediately; only the latest decoded full image may replace it. */
export function viewerImage(image:HTMLImageElement,status:HTMLElement,retry:HTMLButtonElement){
 let generation=0,current:Photo|undefined;
 function show(photo:Photo){
  current=photo;const token=++generation,preview=browsingImage(photo,768);
  image.width=photo.width;image.height=photo.height;image.style.aspectRatio=photo.width+'/'+photo.height;
  image.alt=photo.alt||photo.title;image.removeAttribute('srcset');image.src=preview.src;
  image.dataset.quality='preview';status.hidden=false;status.textContent='正在加载清晰大图…';retry.hidden=true;
  image.onerror=()=>{if(token===generation&&image.dataset.quality==='preview')status.textContent='预览加载中，正在尝试高清图…'};
  const full=new Image();full.decoding='async';full.fetchPriority='high';full.src='/media/'+photo.id+'/2400.webp';
  void full.decode().then(()=>{
   if(token!==generation)return;
   image.onerror=null;image.src=full.src;image.dataset.quality='full';status.hidden=true;retry.hidden=true;
  }).catch(()=>{
   if(token!==generation)return;
   status.textContent=image.complete&&image.naturalWidth?'高清图暂未加载，当前显示预览。':'图片暂未加载，请重试。';retry.hidden=false;
  });
 }
 retry.onclick=()=>{if(current)show(current)};
 return {show,cancel(){generation++;current=undefined;image.onerror=null}};
}
