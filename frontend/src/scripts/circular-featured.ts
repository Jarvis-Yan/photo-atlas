/* React Bits adaptation — Copyright (c) 2026 David Haz.
 * MIT + Commons Clause; see third_party/react-bits/LICENSE.md and THIRD_PARTY_NOTICES.md.
 */
import type {Photo} from './api';
import {progressiveSources} from './photo-preview';
import {galleryAutoplay} from './circular-autoplay';
import {featuredCover} from './featured-cover';
import {mountCircularGallery} from './circular-engine';

export function circularFeatured(root:HTMLElement,photos:Photo[],open:(index:number)=>void){
 const stage=root.querySelector<HTMLElement>('.circular-gallery')!;
 const nav=root.querySelector<HTMLElement>('.circular-nav')!;
 const fallback=root.querySelector<HTMLElement>('.cover-image')!;
 const oldControls=root.querySelector<HTMLElement>('.cover-controls')!;
 const list=stage.querySelector<HTMLUListElement>('[data-gallery-list]')!;
 const counter=root.querySelector<HTMLElement>('[data-circular-count]')!;
 let engine:ReturnType<typeof mountCircularGallery>,autoplay:ReturnType<typeof galleryAutoplay>|undefined,fallbackStarted=false;
 let disposePlayback=()=>{};
 const showFallback=()=>{if(fallbackStarted)return;fallbackStarted=true;disposePlayback();engine?.destroy();stage.hidden=nav.hidden=true;fallback.hidden=oldControls.hidden=false;root.dataset.circular='false';featuredCover(root,photos,open)};
 if(!photos.length){showFallback();return}
 const items=photos.map(photo=>{const sources=progressiveSources(photo,960);return {image:sources.previewSmall,clear:sources.previewSrc,fallback:sources.previewFallback,aspect:photo.width/photo.height,text:photo.title,alt:photo.alt||photo.title}});
 const buttons=items.map((item,index)=>{const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent=item.alt;button.setAttribute('aria-label',`${item.text}，第 ${index+1} 张，共 ${items.length} 张`);button.tabIndex=index===0?0:-1;button.onfocus=()=>engine?.focus(index);button.onclick=()=>open(index);li.append(button);list.append(li);return button});
 const activate=(index:number)=>{autoplay?.reset();stage.dataset.activeIndex=String(index);counter.textContent=`${index+1} / ${items.length}`;buttons.forEach((button,i)=>{button.tabIndex=i===index?0:-1;button.setAttribute('aria-current',String(i===index))})};
 stage.hidden=false;
 try{engine=mountCircularGallery({container:stage,canvas:stage.querySelector('canvas')!,labelLayer:stage.querySelector('.circular-gallery-labels')!,caption:stage.querySelector('.circular-gallery-caption')!,buttons,onActive:activate,settings:{items,bend:2.7,textColor:'#edf1f7',borderRadius:0,itemSize:1.33,itemAspect:1.5,gap:.04,wave:0,fadeEdges:.07,shadow:0,showTitles:true,grayscale:false,snap:true,autoScroll:0,openOnClick:false,intro:true,scrollSpeed:2,scrollEase:.075,dpr:1.5,onItemClick:(_item:unknown,index:number)=>open(index),onContextLost:showFallback}})}catch{showFallback();return}
 if(!engine){showFallback();return}
 fallback.hidden=oldControls.hidden=true;nav.hidden=false;root.dataset.circular='true';activate(0);
 root.querySelector<HTMLButtonElement>('[data-circular-prev]')!.onclick=()=>engine?.step(-1);
 root.querySelector<HTMLButtonElement>('[data-circular-next]')!.onclick=()=>engine?.step(1);
 const events=new AbortController(),signal=events.signal;
 autoplay=galleryAutoplay(()=>{if(Number(stage.dataset.loaded)>0)engine?.step(1)});
 autoplay.pause('reduced-motion',matchMedia('(prefers-reduced-motion:reduce)').matches);
 counter.setAttribute('aria-live','off');
 const pauseGesture=()=>autoplay?.pause('gesture',true);
 const releaseGesture=()=>autoplay?.pause('gesture',false);
 const visibility=()=>autoplay?.pause('hidden',document.hidden);
 const viewer=()=>autoplay?.pause('viewer',Boolean(document.querySelector('dialog[open]')));
 root.addEventListener('pointerdown',pauseGesture,{signal});
 window.addEventListener('pointerup',releaseGesture,{signal});
 window.addEventListener('pointercancel',releaseGesture,{signal});
 root.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')autoplay?.pause('hover',true)},{signal});
 root.addEventListener('pointerleave',()=>autoplay?.pause('hover',false),{signal});
 root.addEventListener('focusin',event=>{if((event.target as Element).matches(':focus-visible'))autoplay?.pause('focus',true)},{signal});
 root.addEventListener('focusout',event=>{if(!root.contains(event.relatedTarget as Node))autoplay?.pause('focus',false)},{signal});
 document.addEventListener('visibilitychange',visibility,{signal});
 document.addEventListener('photo-atlas:viewer',viewer,{signal});
 autoplay.pause('offscreen',true);visibility();viewer();
 const observer=new IntersectionObserver(entries=>autoplay?.pause('offscreen',!entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>=.2)),{threshold:[0,.2]});
 observer.observe(stage);
 disposePlayback=()=>{autoplay?.destroy();observer.disconnect();events.abort()};
 window.addEventListener('pagehide',event=>{if(!event.persisted){disposePlayback();engine?.destroy()}},{signal});
}
