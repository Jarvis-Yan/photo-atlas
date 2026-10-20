/* React Bits adaptation — Copyright (c) 2026 David Haz.
 * MIT + Commons Clause; see third_party/react-bits/LICENSE.md and THIRD_PARTY_NOTICES.md.
 */
import {escaped,type Photo} from './api';

/** Adapted from the supplied React Bits FlipCard: native DOM keeps previews alive. */
export function photoFacts(photo:Photo){
 const labels:Record<string,string>={camera:"相机",lens:"镜头",iso:"ISO",fnumber:"光圈",exposure:"快门",focal_length:"焦距",date:"拍摄时间"};
 const entries=Object.entries(photo.exif||{}).filter(([key,value])=>labels[key]&&value);
 return entries.length?`<dl class="flip-exif">${entries.map(([key,value])=>`<div><dt>${labels[key]}</dt><dd>${escaped(value)}</dd></div>`).join('')}</dl>`:'';
}
export function flipMarkup(photo:Photo,index:number,image:string){
 const title=escaped(photo.title),facts=[photo.geo?.label,photo.captured?.value].filter(Boolean).map(escaped).join(' · ');
 return `<div class="photo-flip" data-flipped="false"><div class="flip-rotor"><button type="button" class="photo-card flip-face flip-front" aria-label="翻看${title}的信息" aria-expanded="false"><figure>${image}</figure><span class="flip-glare" aria-hidden="true"></span></button><section class="flip-face flip-back" tabindex="0" aria-label="${title}的信息" aria-hidden="true" inert><div class="flip-frost" aria-hidden="true"><img alt="" decoding="async"/></div><span class="flip-glare" aria-hidden="true"></span><div class="flip-copy"><h3>${title}</h3>${facts?`<p>${facts}</p>`:''}${photo.caption?`<p class="flip-description">${escaped(photo.caption)}</p>`:''}${photo.tags.length?`<p class="flip-tags">${photo.tags.slice(0,3).map(escaped).join(' · ')}</p>`:''}</div><div class="flip-actions"><button type="button" class="flip-view" data-photo-index="${index}">查看大图 ↗</button>${photo.download?`<a class="flip-view flip-save" href="${escaped(photo.download)}" download aria-label="保存${title}原尺寸带水印 JPEG">保存原图 ↓</a>`:''}</div></section></div></div>`;
}
export function installPhotoFlip(root:HTMLElement){
 const reduced=matchMedia('(prefers-reduced-motion:reduce)'),fine=matchMedia('(hover:hover) and (pointer:fine)');
 let grip:{card:HTMLElement;id:number;x:number;y:number;base:number;angle:number;dragging:boolean;vertical:boolean;lastX:number;time:number;velocity:number}|undefined;
 let suppressed:HTMLElement|undefined,suppressUntil=0;
 const turns=new Map<HTMLElement,ReturnType<typeof setTimeout>>();
 function finishTurn(card:HTMLElement){
  const timer=turns.get(card);if(timer===undefined)return;
  clearTimeout(timer);turns.delete(card);delete card.dataset.flipping;
  card.dispatchEvent(new Event('photo-atlas:flip-settled',{bubbles:true}));
 }
 root.addEventListener('transitionend',event=>{if(event.propertyName==='transform'&&(event.target as Element).matches('.flip-rotor')){const card=(event.target as Element).closest<HTMLElement>('.photo-flip');if(card)finishTurn(card)}});
 window.addEventListener('pagehide',()=>{for(const card of turns.keys())finishTurn(card)});
 const flipped=(card:HTMLElement)=>card.dataset.flipped==='true';
 function settle(card:HTMLElement,back:boolean,focus=false){
  clearTimeout(turns.get(card));
  if(!reduced.matches){card.dataset.flipping='true';turns.set(card,setTimeout(()=>finishTurn(card),620))}
  card.style.setProperty('--flip-x','0deg');card.style.setProperty('--flip-y','0deg');
  card.classList.remove('is-turning');card.dataset.flipped=String(back);card.style.setProperty('--flip-turn',back?'180deg':'0deg');
  const front=card.querySelector<HTMLButtonElement>('.flip-front')!,rear=card.querySelector<HTMLElement>('.flip-back')!;
  front.inert=back;front.setAttribute('aria-hidden',String(back));front.setAttribute('aria-expanded',String(back));rear.inert=!back;rear.setAttribute('aria-hidden',String(!back));
  card.dispatchEvent(new Event('photo-atlas:flip',{bubbles:true}));
  if(focus)(back?rear:front).focus({preventScroll:true});
 }
 root.addEventListener('click',event=>{
  const target=event.target as Element,card=target.closest<HTMLElement>('.photo-flip');if(!card)return;
  if(suppressed===card&&performance.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();return}
  if(!target.closest('.flip-view')&&target.closest('.flip-front,.flip-back')){event.preventDefault();settle(card,!flipped(card),true)}
 },true);
 root.addEventListener('pointerdown',event=>{
  const target=event.target as Element,card=target.closest<HTMLElement>('.photo-flip');
  if(!card||event.button!==0||target.closest('.flip-actions')||grip)return;
  grip={card,id:event.pointerId,x:event.clientX,y:event.clientY,base:flipped(card)?180:0,angle:flipped(card)?180:0,dragging:false,vertical:false,lastX:event.clientX,time:performance.now(),velocity:0};
 });
 root.addEventListener('pointermove',event=>{
  const card=(event.target as Element).closest<HTMLElement>('.photo-flip');
  if(grip&&grip.id===event.pointerId){
   const g=grip,dx=event.clientX-g.x,dy=event.clientY-g.y;
   if(g.vertical)return;
   if(!g.dragging){
    if(Math.max(Math.abs(dx),Math.abs(dy))<8)return;
    if(Math.abs(dy)>Math.abs(dx)){g.vertical=true;return}
    if(reduced.matches)return;
    g.dragging=true;g.card.classList.add('is-turning');g.card.setPointerCapture(event.pointerId);
   }
   event.preventDefault();const now=performance.now(),span=g.card.clientWidth||300;
   g.velocity=(event.clientX-g.lastX)/Math.max(1,now-g.time);g.time=now;g.lastX=event.clientX;
   g.angle=g.base+dx/span*180;g.card.style.setProperty('--flip-turn',g.angle+'deg');return;
  }
  if(!card||turns.has(card)||!fine.matches||reduced.matches||event.pointerType==='touch')return;
  const r=card.getBoundingClientRect(),x=(event.clientX-r.left)/r.width,y=(event.clientY-r.top)/r.height;
  card.style.setProperty('--flip-x',(0.5-y)*8+'deg');card.style.setProperty('--flip-y',(x-.5)*8+'deg');
  card.style.setProperty('--glare-x',x*100+'%');card.style.setProperty('--glare-y',y*100+'%');
 },{passive:false});
 function release(event?:PointerEvent,cancelled=false){
  const g=grip;if(!g||(event&&g.id!==event.pointerId))return;grip=undefined;
  if(g.dragging){
   const velocity=performance.now()-g.time<90?g.velocity:0;
   const crosses=Math.abs(g.angle-g.base+Math.max(-180,Math.min(180,velocity*70)))>=90;
   const back=cancelled?g.base===180:crosses?g.base!==180:g.base===180;
   settle(g.card,back,true);
   if(g.card.hasPointerCapture(g.id))g.card.releasePointerCapture(g.id);
  }
  if(g.dragging||g.vertical){suppressed=g.card;suppressUntil=performance.now()+400}
 }
 window.addEventListener('pointerup',event=>release(event));
 window.addEventListener('pointercancel',event=>release(event,true));
 root.addEventListener('lostpointercapture',event=>release(event,true));
 window.addEventListener('blur',()=>release(undefined,true));
 root.addEventListener('pointerout',event=>{
  const card=(event.target as Element).closest<HTMLElement>('.photo-flip');
  if(card&&!card.contains(event.relatedTarget as Node)){card.style.setProperty('--flip-x','0deg');card.style.setProperty('--flip-y','0deg')}
 });
 root.addEventListener('keydown',event=>{
  const target=event.target as Element;
  if((event.key==='Enter'||event.key===' ')&&target.matches('.flip-back')){event.preventDefault();const card=target.closest<HTMLElement>('.photo-flip');if(card&&!event.repeat)settle(card,false,true);return}
  if(event.key!=='Escape')return;
  const card=(event.target as Element).closest<HTMLElement>('.photo-flip');if(card&&flipped(card)){settle(card,false,true);event.stopPropagation()}
 });
}

/** Reuse the exact preview/full source already decoded on the front. */
export function preparePhotoFlip(node:HTMLElement){
 const front=node.querySelector<HTMLImageElement>('.flip-front img'),back=node.querySelector<HTMLImageElement>('.flip-frost img');
 if(!front||!back)return;
 const sync=()=>{const src=front.currentSrc||front.src;if(src&&back.getAttribute('src')!==src)back.src=src};
 front.addEventListener('load',sync);sync();
}
