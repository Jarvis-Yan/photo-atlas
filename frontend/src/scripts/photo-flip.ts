import {escaped,type Photo} from './api';

/** Accessible information panel; photographs remain in place while details are open. */
export function photoFacts(photo:Photo){
 const names:Record<string,string>={camera:'相机',lens:'镜头',date:'拍摄时间',iso:'ISO',fnumber:'光圈',exposure:'快门',focal_length:'焦距'};
 const fields=Object.entries(names).filter(([key])=>photo.exif?.[key]);
 return fields.length?'<dl class="flip-exif">'+fields.map(([key,label])=>'<div><dt>'+label+'</dt><dd>'+escaped(photo.exif[key])+'</dd></div>').join('')+'</dl>':'';
}
export function flipMarkup(photo:Photo,index:number,image:string){
 const name=escaped(photo.title),caption=escaped(photo.caption||''),place=escaped([photo.geo?.label,photo.captured?.value].filter(Boolean).join(' · '));
 return `<div class="photo-flip" data-flipped="false"><button class="photo-card flip-front" type="button" aria-expanded="false" aria-label="查看${name}的信息"><figure>${image}</figure></button><section class="flip-back" hidden aria-label="${name}的信息"><button class="detail-close" type="button" aria-label="关闭作品信息">×</button><div class="flip-copy"><h3>${name}</h3><p>${place}</p><p class="flip-description">${caption}</p></div><div class="flip-actions"><button class="flip-view" type="button" data-photo-index="${index}">查看大图 ↗</button>${photo.download?`<a class="flip-view" href="${escaped(photo.download)}" download>保存 JPEG ↓</a>`:''}</div></section></div>`;
}
export function installPhotoFlip(root:HTMLElement){
 if(root.dataset.detailsInstalled)return;
 root.dataset.detailsInstalled='true';
 const close=(card:HTMLElement)=>{
  card.dataset.flipped='false';
  card.querySelector<HTMLElement>('.flip-back')!.hidden=true;
  const button=card.querySelector<HTMLButtonElement>('.flip-front')!;
  button.setAttribute('aria-expanded','false');button.focus({preventScroll:true});
 };
 root.addEventListener('click',event=>{
  const target=event.target as Element,card=target.closest<HTMLElement>('.photo-flip');if(!card)return;
  if(target.closest('.detail-close')){close(card);return}
  if(!target.closest('.flip-front'))return;
  const panel=card.querySelector<HTMLElement>('.flip-back')!;
  panel.hidden=false;card.dataset.flipped='true';
  card.querySelector('.flip-front')!.setAttribute('aria-expanded','true');
  panel.querySelector<HTMLButtonElement>('.detail-close')!.focus({preventScroll:true});
 });
 root.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  const card=(event.target as Element).closest<HTMLElement>('.photo-flip[data-flipped="true"]');
  if(card){event.stopPropagation();close(card)}
 });
}
export function preparePhotoFlip(_node:HTMLElement){}
