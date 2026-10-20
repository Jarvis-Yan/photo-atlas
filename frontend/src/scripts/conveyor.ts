import {photoWall} from '../../../miniprogram/utils/photo-wall';
import {bindTouchScroll} from './conveyor-touch';
interface Frame {markup:string;width:number;height:number}
export class PhotoConveyor {
 private wallSeed=Math.floor(Math.random()*4294967296);
 private frames:Frame[]=[];private flow=true;private eligible=false;private visible=false;
 private columnCleanup:Array<()=>void>=[];private width=0;private controls=document.createElement('div');private button=document.createElement('button');private label=document.createElement('span');
 private reduced=matchMedia('(prefers-reduced-motion:reduce)');private intersection:IntersectionObserver;private resize:ResizeObserver;private cycles:ResizeObserver;
 constructor(private element:HTMLElement,private options:{defaultFlow?:boolean;controls?:HTMLElement}={}){
  this.flow=options.defaultFlow??true;
  try{const preference=sessionStorage.getItem('pixelcore-gallery-flow');if(preference==='on'||preference==='off')this.flow=preference==='on'}catch{}
  element.classList.add('conveyor');this.controls.className='conveyor-controls';this.button.type='button';this.button.className='button subtle';this.controls.append(this.label,this.button);
  if(options.controls)options.controls.append(this.controls);else element.before(this.controls);
  this.button.onclick=()=>{this.flow=!this.flow;try{sessionStorage.setItem('pixelcore-gallery-flow',this.flow?'on':'off')}catch{}this.layout()};
  this.intersection=new IntersectionObserver(entries=>{this.visible=entries[0]?.isIntersecting||false;this.updateMotion()},{threshold:0});this.intersection.observe(element);
  this.resize=new ResizeObserver(()=>{const width=element.clientWidth;if(Math.abs(width-this.width)>1)this.layout();else this.measure()});this.resize.observe(element);
  this.cycles=new ResizeObserver(()=>this.measure());
  document.addEventListener('visibilitychange',()=>{this.updateMotion()});
  document.addEventListener('pixelcore:viewer',()=>this.updateMotion());
  this.reduced.addEventListener('change',()=>this.layout());
  window.addEventListener('pagehide',()=>{element.dataset.running='false';this.columnCleanup.forEach(clear=>clear())});
  window.addEventListener('pageshow',()=>this.updateMotion());
 }
 render(frames:Frame[]){this.frames=frames;this.layout()}
 private layout(){
  this.columnCleanup.forEach(clear=>clear());this.columnCleanup=[];this.width=this.element.clientWidth;this.cycles.disconnect();
  if(!this.frames.length){this.controls.hidden=true;this.options.controls?.closest('details')?.setAttribute('hidden','');this.element.dataset.flow='false';this.element.innerHTML='<p class="empty glass">这里暂时没有公开作品。</p>';return}
  this.controls.hidden=false;
  if(!this.flow||this.reduced.matches){
   this.element.dataset.layout='wall';this.element.dataset.flow='false';this.element.dataset.running='false';
   const mobile=innerWidth<=700,gap=mobile?10:18;
   const wall=photoWall(this.frames,Math.max(1,this.width),gap,mobile?52:60,this.wallSeed);
   this.element.style.setProperty('--wall-height',wall.height+'px');
   this.element.innerHTML=wall.items.map(item=>'<div class="photo-wall-item" style="left:'+item.x+'px;top:'+item.y+'px;width:'+item.width+'px">'+this.frames[item.index].markup+'</div>').join('');
   this.element.querySelectorAll<HTMLImageElement>('img').forEach(img=>{img.sizes=Math.ceil(img.getBoundingClientRect().width)+'px'});
   this.eligible=this.frames.length>=6;this.label.textContent='自由浏览 · 完整构图';this.button.hidden=!this.eligible||this.reduced.matches;
   this.button.textContent=this.options.controls?'开启自动流动':'流动浏览';this.button.setAttribute('aria-pressed','false');this.button.setAttribute('aria-label','开启自动滚动');
   this.options.controls?.closest('details')?.toggleAttribute('hidden',this.button.hidden);return;
  }
  this.element.dataset.layout='columns';
  const count=matchMedia('(min-width:1100px)').matches?3:2;
  const gap=matchMedia('(max-width:700px)').matches?14:28;
  const width=(this.width-gap*(count-1))/count;
  const columns=Array.from({length:count},()=>({height:0,frames:[] as Frame[]}));
  for(const frame of this.frames){const column=columns.reduce((a,b)=>a.height<=b.height?a:b);column.frames.push(frame);column.height+=width*(frame.width>0&&frame.height>0?frame.height/frame.width:1.25)+100}
  this.element.dataset.touchScroll=String(matchMedia('(any-pointer:coarse)').matches||innerWidth<=700);
  this.element.innerHTML=columns.map((column,i)=>'<div class="conveyor-column" data-reverse="'+Boolean(i%2)+'" tabindex="0" role="group" aria-label="第'+(i+1)+'列作品，可独立滚动"><div class="conveyor-position"><div class="conveyor-track" style="animation-direction:'+(i%2?'reverse':'normal')+'"><div class="conveyor-cycle">'+column.frames.map(f=>f.markup).join('')+'</div></div></div></div>').join('');
  this.element.querySelectorAll<HTMLElement>('.conveyor-column').forEach(column=>this.bindColumn(column));
  this.element.querySelectorAll<HTMLElement>('.conveyor-cycle').forEach(cycle=>this.cycles.observe(cycle));this.measure();
 }
 private measure(){
  if(this.element.dataset.layout==='wall')return;
  const cycles=Array.from(this.element.querySelectorAll<HTMLElement>('.conveyor-cycle:not(.conveyor-mirror)'));
  // Four consecutive card slots leave room for three complete works at any loop phase.
  const heights=cycles.map(cycle=>Array.from(cycle.children).map(card=>(card as HTMLElement).offsetHeight+parseFloat(getComputedStyle(card).marginBottom||'0')));
  let height=innerWidth<=700?900:1200;
  for(const slots of heights)for(let start=0;start<slots.length;start++){let span=0;for(let n=0;n<4;n++)span+=slots[(start+n)%slots.length];height=Math.max(height,span)}
  this.element.style.setProperty('--conveyor-height',Math.ceil(height)+'px');
  this.eligible=cycles.length>0&&cycles.every(cycle=>cycle.children.length>=3&&cycle.offsetHeight>0);
  const flow=this.flow&&this.eligible&&!this.reduced.matches;
  this.element.dataset.flow=String(flow);
  this.label.textContent=flow?'独立滑动每一列 · 其余列继续流动':'自由浏览 · 完整构图';
  this.button.hidden=!this.eligible||this.reduced.matches;
  if(this.options.controls){this.button.textContent=flow?'停止自动流动':'开启自动流动';this.options.controls.closest('details')?.toggleAttribute('hidden',this.button.hidden)}
  else this.button.textContent=flow?'自由浏览':'流动浏览';
  this.button.setAttribute('aria-pressed',String(flow));
  this.button.setAttribute('aria-label',flow?'停止自动滚动，自由浏览全部作品':'开启自动滚动');
  for(const cycle of cycles){
   const track=cycle.parentElement!;const position=track.parentElement!;const column=position.parentElement!;
   column.tabIndex=flow?0:-1;column.setAttribute('aria-label',`第${cycles.indexOf(cycle)+1}列作品${flow?'，可独立滚动':''}`);
   const cycleHeight=cycle.offsetHeight,duration=Math.max(45,cycleHeight/9);
   track.style.setProperty('--travel',-cycleHeight+'px');track.style.setProperty('--duration',duration+'s');
   const native=flow&&this.element.dataset.touchScroll==='true';
   position.style.setProperty('--scroll-space',height+2*cycleHeight+'px');
   const previousHeight=Number(column.dataset.cycleHeight||0);
   column.dataset.cycleHeight=String(cycleHeight);column.dataset.duration=String(duration*1000);
   const mirrors=Array.from(track.querySelectorAll('.conveyor-mirror'));
   const copies=flow?Math.ceil(height/cycleHeight)+(native?2:0):0;
   for(let i=mirrors.length;i<copies;i++){const copy=cycle.cloneNode(true) as HTMLElement;copy.classList.add('conveyor-mirror');copy.setAttribute('aria-hidden','true');copy.querySelectorAll('a').forEach(a=>a.tabIndex=-1);track.append(copy)}
   mirrors.slice(copies).forEach(mirror=>mirror.remove());
   if(native&&previousHeight!==cycleHeight)column.scrollTop=cycleHeight;
   if(!native)column.scrollTop=0;
  }
  this.updateMotion();
 }
 private bindColumn(column:HTMLElement){
  const track=column.querySelector<HTMLElement>('.conveyor-track')!;
  let pointer:number|null=null,lastY=0,startY=0,moved=false,focused=false,suppressUntil=0;
  let timer:ReturnType<typeof setTimeout>|undefined,frame=0,delta=0;
  const active=()=>this.element.dataset.flow==='true';
  const native=()=>active()&&this.element.dataset.touchScroll==='true';
  this.columnCleanup.push(bindTouchScroll(column,track,native));
  const pause=()=>{clearTimeout(timer);column.dataset.manual='true'};
  const resume=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(pointer===null&&!focused)column.dataset.manual='false'},1000)};
  const shift=(distance:number)=>{
   const animation=track.getAnimations()[0];const height=track.querySelector<HTMLElement>('.conveyor-cycle')!.offsetHeight;
   if(!animation||!height)return;
   const duration=Number(animation.effect?.getTiming().duration);if(!duration)return;
   const sign=getComputedStyle(track).animationDirection==='reverse'?1:-1;
   animation.currentTime=((Number(animation.currentTime||0)+sign*distance*duration/height)%duration+duration)%duration;
  };
  const flush=()=>{cancelAnimationFrame(frame);frame=0;if(delta){shift(delta);delta=0}};
  const queue=(distance:number)=>{delta+=distance;if(!frame)frame=requestAnimationFrame(flush)};
  column.addEventListener('pointerdown',event=>{if(!active()||event.button!==0||native()&&event.pointerType==='touch')return;focused=false;pointer=event.pointerId;lastY=startY=event.clientY;moved=false;pause()});
  column.addEventListener('pointermove',event=>{
   if(pointer!==event.pointerId)return;
   if(!moved&&Math.abs(event.clientY-startY)<5)return;
   if(!moved){moved=true;column.setPointerCapture(event.pointerId);column.dataset.dragging='true'}
   event.preventDefault();queue(event.clientY-lastY);lastY=event.clientY;
  });
  const release=(event:PointerEvent)=>{
   if(pointer!==event.pointerId)return;flush();if(moved)suppressUntil=Date.now()+400;
   pointer=null;column.dataset.dragging='false';if(column.hasPointerCapture(event.pointerId))column.releasePointerCapture(event.pointerId);resume();
  };
  column.addEventListener('pointerup',release);column.addEventListener('pointercancel',release);
  column.addEventListener('lostpointercapture',event=>{if(pointer!==event.pointerId)return;pointer=null;column.dataset.dragging='false';resume()});
  column.addEventListener('dragstart',event=>{if(active())event.preventDefault()});
  column.addEventListener('click',event=>{if(Date.now()<suppressUntil){event.preventDefault();event.stopPropagation()}},true);
  column.addEventListener('wheel',event=>{if(!active()||native()||event.ctrlKey)return;event.preventDefault();focused=false;pause();queue(-event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?column.clientHeight:1));resume()},{passive:false});
  column.addEventListener('focusin',()=>{if(active()&&!native()&&pointer===null&&document.activeElement?.matches(':focus-visible')){focused=true;pause()}});
  column.addEventListener('focusout',event=>{if(native())return;focused=column.contains(event.relatedTarget as Node);if(!focused)resume()});
  column.addEventListener('keydown',event=>{if(!active()||native()||!['ArrowUp','ArrowDown','PageUp','PageDown'].includes(event.key))return;event.preventDefault();pause();shift((event.key.endsWith('Up')?1:-1)*(event.key.startsWith('Page')?column.clientHeight*.8:100));resume()});
  this.columnCleanup.push(()=>{clearTimeout(timer);cancelAnimationFrame(frame);delta=0;pointer=null;column.dataset.manual='false';column.dataset.dragging='false'});
 }
 private updateMotion(){this.element.dataset.running=String(this.flow&&this.eligible&&this.visible&&!document.hidden&&!this.reduced.matches&&!document.querySelector('dialog[open]'))}
}
