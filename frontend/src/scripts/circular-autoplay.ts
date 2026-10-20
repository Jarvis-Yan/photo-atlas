/** Restart the full dwell time after an interaction or a pause. */
export function galleryAutoplay(advance:()=>void,interval=5000){
 const reasons=new Set<string>();
 let timer:ReturnType<typeof setTimeout>|undefined,disposed=false;
 function reset(){
  clearTimeout(timer);
  if(!disposed&&!reasons.size)timer=setTimeout(()=>{advance();reset()},interval);
 }
 reset();
 return {
  reset,
  pause(reason:string,paused:boolean){
   if(reasons.has(reason)===paused)return;
   if(paused)reasons.add(reason);else reasons.delete(reason);
   reset();
  },
  destroy(){disposed=true;clearTimeout(timer)}
 };
}
