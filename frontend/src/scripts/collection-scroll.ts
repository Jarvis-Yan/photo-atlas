/** One small spring drives only the boundary ornament. It sleeps at rest. */
function boundaryMotion(sentinel:HTMLElement,reduced:MediaQueryList){
 const root=sentinel.closest<HTMLElement>('.collection-bridge');
 let frame=0,x=0,velocity=0,target=0,last=0;
 const ghosts=new Set<HTMLElement>();
 function render(){root?.style.setProperty('--bridge-pull',x.toFixed(4))}
 function tick(now:number){
  const dt=last?Math.min((now-last)/1000,.032):1/60;last=now;
  velocity+=(170*(target-x)-25*velocity)*dt;x+=velocity*dt;render();
  if(Math.abs(target-x)<.001&&Math.abs(velocity)<.005){x=target;velocity=0;frame=0;last=0;render()}
  else frame=requestAnimationFrame(tick);
 }
 return {
  to(value:number){target=value;if(!root)return;if(reduced.matches){cancelAnimationFrame(frame);frame=0;last=0;x=velocity=0;render();return}if(!frame)frame=requestAnimationFrame(tick)},
  phase(value:string){if(root)root.dataset.phase=value},
  capture(){
   const parent=root?.parentElement,grid=parent?.querySelector('#photo-grid');
   if(!root||!parent||!grid||reduced.matches)return ()=>{};
   const box=root.getBoundingClientRect(),parentBox=parent.getBoundingClientRect(),count=grid.children.length,first=grid.firstElementChild;
   if(box.top>innerHeight||box.bottom<0)return ()=>{};
   const ghost=root.cloneNode(true) as HTMLElement;
   ghost.removeAttribute('id');ghost.removeAttribute('aria-label');ghost.setAttribute('aria-hidden','true');
   ghost.querySelectorAll('[id],[role],[aria-live]').forEach(node=>{node.removeAttribute('id');node.removeAttribute('role');node.removeAttribute('aria-live')});
   return ()=>{
    // An error, filter switch or navigation must never leave a fake loading panel.
    if(!root.isConnected||root.hidden||grid.children.length<=count||grid.firstElementChild!==first)return;
    ghost.classList.add('bridge-handoff');ghost.style.top=(box.top-parentBox.top)+'px';ghost.style.left=(box.left-parentBox.left)+'px';ghost.style.width=box.width+'px';ghost.style.height=box.height+'px';
    parent.append(ghost);ghosts.add(ghost);
    const remove=()=>{ghost.remove();ghosts.delete(ghost)};ghost.addEventListener('animationend',remove,{once:true});setTimeout(remove,800);
   };
  },
  stop(){cancelAnimationFrame(frame);frame=0;last=0;x=target=velocity=0;render();ghosts.forEach(node=>node.remove());ghosts.clear()}
 };
}

/** A deliberate chapter boundary: arm once, then pull and release to continue. */
export function collectionAutoLoad(sentinel:HTMLElement,canLoad:()=>boolean,loadNext:()=>Promise<void>){
 const threshold=90,reduced=matchMedia('(prefers-reduced-motion:reduce)');
 let frame=0,busy=false,active=true,gesture=0,armedAt=-1,lastWheel=-Infinity,touchY:number|undefined,touchLastY:number|undefined;
 let distance=0,pulling=false,wheelMoved=false,wheelCancelled=false;
 let input:'wheel'|'touch'|'key'|undefined,heldKey:string|undefined;
 const nativeEnd='onscrollend' in document;
 // A real scroll range lets the browser observe trackpad release at the page edge.
 // It remains after cancelled pulls, so reversing never collapses the page mid-gesture.
 const runway=document.createElement('div');
 runway.className='collection-scroll-runway';runway.hidden=true;runway.setAttribute('aria-hidden','true');
 document.body.append(runway);
 const motion=boundaryMotion(sentinel,reduced);
 const eligible=()=>active&&!busy&&!sentinel.hidden&&!document.hidden&&canLoad();
 const near=()=>{
  const boundary=sentinel.closest<HTMLElement>('.collection-bridge')||sentinel;
  const box=boundary.getBoundingClientRect(),page=document.scrollingElement;
  // The whole chapter boundary and the document bottom accept page-wide gestures.
  const bottom=!!page&&page.scrollHeight-page.scrollTop-page.clientHeight<=24;
  return box.top<=innerHeight+24&&(box.bottom>=-80||bottom);
 };
 function visual(value:number){motion.to(Math.min(1.2,Math.max(0,value/threshold)))}
 function resetGate(){armedAt=-1;delete sentinel.dataset.waiting}
 function rebound(){
  pulling=false;distance=0;
  delete sentinel.dataset.pulling;delete sentinel.dataset.ready;sentinel.ariaLabel=null;
  visual(0);motion.phase('idle');
 }
 function cancel(){resetGate();rebound();runway.hidden=true;runway.style.height='';wheelMoved=false;wheelCancelled=false;heldKey=undefined;input=undefined;}
 function reversePull(){
  if(!pulling)return false;
  rebound();armedAt=gesture;if(input==='wheel')wheelCancelled=true;
  sentinel.textContent='';
  return true;
 }
 function arm(){armedAt=gesture;if(nativeEnd)runway.hidden=false;sentinel.dataset.waiting='true';sentinel.textContent='';}
 function pull(amount:number,absolute=false){
  if(!eligible()||!near())return;
  if(armedAt<0){arm();return}
  if(armedAt===gesture)return;
  if(!pulling){pulling=true;sentinel.dataset.pulling='true';motion.phase('pulling')}
  distance=absolute?Math.max(0,amount):Math.max(0,Math.min(260,distance+amount));
  sentinel.dataset.ready=String(distance>=threshold);visual(distance);
  sentinel.textContent='';
  sentinel.ariaLabel=distance>=threshold&&input==='wheel'&&!nativeEnd?'按 Enter 展开，向上滑动取消':null;
 }
 function release(cancelled=false){
  if(!pulling)return;
  const commit=!cancelled&&touchY===undefined&&distance>=threshold&&eligible()&&near();
  rebound();
  if(!commit){if(eligible())sentinel.textContent='';return}
  resetGate();busy=true;motion.phase('loading');motion.to(.4);const handoff=motion.capture();
  void loadNext().catch(()=>{/* Collection owns the visible retry action. */}).finally(()=>{handoff();runway.hidden=true;runway.style.height='';busy=false;motion.phase('idle');motion.to(0);check()});
 }
 function check(){
  if(frame||!active)return;
  frame=requestAnimationFrame(()=>{
   frame=0;
   if(busy)return;
   if(!eligible()||!near()){
    if(armedAt>=0&&eligible())sentinel.textContent='';
    cancel();
   }
  });
 }
 function scroll(){if(input==='wheel'&&pulling)wheelMoved=true;if(eligible()&&near()&&armedAt<0)arm();check()}
 const blocked=(event:Event)=>!!document.querySelector('dialog[open]')||!!(event.target as Element|null)?.closest?.('dialog,input,textarea,select,[contenteditable=true]');
 window.addEventListener('wheel',event=>{
  if(blocked(event)||event.ctrlKey){release(true);return;}
  if(touchY!==undefined||heldKey)return;
  input='wheel';
  const now=performance.now(),fresh=now-lastWheel>240;lastWheel=now;
  if(fresh&&!pulling&&!wheelCancelled){gesture++;wheelMoved=false;}
  if(Math.abs(event.deltaY)>=Math.abs(event.deltaX)){
   const unit=event.deltaMode===1?16:event.deltaMode===2?innerHeight:1;
   if(event.deltaY<0&&reversePull())return;
   if(wheelCancelled)return;
   if(event.deltaY>0&&nativeEnd&&eligible()&&near()&&armedAt>=0&&armedAt!==gesture)runway.hidden=false;
   if(event.deltaY>0||pulling)pull(event.deltaY*unit);
  }
 },{passive:true,capture:true});
 document.addEventListener('scrollend',()=>{
  if(input!=='wheel')return;
  const page=document.scrollingElement;
  // The arriving gesture may consume the initial runway with inertia. Leave a
  // fresh native range for the next deliberate gesture without moving content.
  if(!pulling&&!wheelCancelled&&armedAt>=0&&eligible()&&near()&&page&&page.scrollHeight-page.scrollTop-page.clientHeight<1){
   runway.style.height=(runway.getBoundingClientRect().height+120)+'px';
  }
  // No timeout submits a pull. Only native completion after actual page movement.
  if(wheelMoved&&!wheelCancelled)release();
  wheelMoved=false;wheelCancelled=false;lastWheel=-Infinity;
 });
 window.addEventListener('touchstart',event=>{
  if(pulling)release(true);input='touch';
  touchLastY=touchY=event.touches.length===1&&!blocked(event)?event.touches[0].clientY:undefined;gesture++;
 },{passive:true,capture:true});
 window.addEventListener('touchmove',event=>{
  if(touchY===undefined)return;
  if(event.touches.length!==1){release(true);touchY=undefined;return}
  const y=event.touches[0].clientY,reverse=touchLastY!==undefined&&y>touchLastY;
  touchLastY=y;
  if(reverse&&reversePull())return;
  const movement=touchY-y;
  if(movement>12||pulling)pull(movement,true);
 },{passive:true,capture:true});
 window.addEventListener('touchend',()=>{touchLastY=touchY=undefined;release()},{passive:true,capture:true});
 window.addEventListener('touchcancel',()=>{touchLastY=touchY=undefined;release(true)},{passive:true,capture:true});
 window.addEventListener('keydown',event=>{
  if(blocked(event)||event.repeat||event.shiftKey||!['ArrowDown','PageDown','End',' ','Enter'].includes(event.key))return;
  if([' ','Enter'].includes(event.key)&&(event.target as Element|null)?.closest?.('button,a,summary'))return;
  if(event.key==='Enter'&&(!pulling||distance<threshold))return;
  input='key';heldKey=event.key;gesture++;pull(threshold);
 });
 window.addEventListener('keyup',event=>{
  if(event.key!==heldKey)return;heldKey=undefined;release();
 });
 window.addEventListener('blur',()=>{cancel();touchLastY=touchY=undefined});
 const observer=new IntersectionObserver(check,{rootMargin:'24px 0px'});observer.observe(sentinel);
 window.addEventListener('scroll',scroll,{passive:true});window.addEventListener('resize',check,{passive:true});
 document.addEventListener('visibilitychange',()=>{cancel();if(document.hidden)motion.stop();check()});
 window.addEventListener('pagehide',()=>{active=false;cancel();motion.stop();cancelAnimationFrame(frame);frame=0});
 window.addEventListener('pageshow',()=>{active=true;cancel();check()});
 return {check};
}
