/** Native column scrolling keeps touch tracking and momentum in the browser. */
export function bindTouchScroll(column:HTMLElement,track:HTMLElement,enabled:()=>boolean){
 let fingers=0,moved=false,start=0,suppressUntil=0;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const pause=()=>{clearTimeout(timer);column.dataset.manual='true'};
 const settle=()=>{
  if(!enabled()||fingers)return;
  const height=Number(column.dataset.cycleHeight);
  const duration=Number(column.dataset.duration);
  const animation=track.getAnimations()[0];
  // Fold the native offset into the motor only after scrolling has stopped.
  // The same repeated frame stays in place while the scroll range is re-centred.
  if(animation&&height&&duration){
   const direction=column.dataset.reverse==='true'?-1:1;
   const next=Number(animation.currentTime||0)+direction*(column.scrollTop-height)*duration/height;
   animation.currentTime=((next%duration)+duration)%duration;
   column.scrollTop=height;
  }
  column.dataset.manual='false';
 };
 const schedule=()=>{clearTimeout(timer);if(!fingers)timer=setTimeout(settle,180)};
 const down=(event:TouchEvent)=>{
  if(!enabled())return;
  fingers=event.touches.length;start=column.scrollTop;moved=false;pause();
 };
 const scroll=()=>{
  if(!enabled())return;
  // Ignore the single scroll event caused by our own re-centering.
  if(!fingers&&column.dataset.manual!=='true'&&Math.abs(column.scrollTop-Number(column.dataset.cycleHeight))<1)return;
  if(Math.abs(column.scrollTop-start)>4){moved=true;suppressUntil=Date.now()+500}
  pause();schedule();
 };
 const up=(event:TouchEvent)=>{
  if(!enabled())return;
  fingers=event.touches.length;
  if(moved)suppressUntil=Date.now()+500;
  schedule();
 };
 const click=(event:MouseEvent)=>{
  if(enabled()&&(fingers>0||Date.now()<suppressUntil)){
   event.preventDefault();event.stopImmediatePropagation();
  }
 };
 const end=()=>{if(enabled()&&!fingers&&column.dataset.manual==='true'){clearTimeout(timer);settle()}};
 column.addEventListener('touchstart',down,{passive:true});
 column.addEventListener('touchend',up,{passive:true});
 column.addEventListener('touchcancel',up,{passive:true});
 column.addEventListener('scroll',scroll,{passive:true});
 column.addEventListener('scrollend',end);
 column.addEventListener('click',click,true);
 return ()=>{
  clearTimeout(timer);fingers=0;
  column.removeEventListener('touchstart',down);
  column.removeEventListener('touchend',up);
  column.removeEventListener('touchcancel',up);
  column.removeEventListener('scroll',scroll);
  column.removeEventListener('scrollend',end);
  column.removeEventListener('click',click,true);
 };
}
