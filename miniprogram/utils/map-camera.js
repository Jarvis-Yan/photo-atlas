// includePoints success only acknowledges a native command. Read the rendered
// viewport before accepting it, and keep only the latest requested selection.
function createMapCamera({getContext,isPaused,onError,onSuccess,setTimer=setTimeout,clearTimer=clearTimeout}) {
 let desired=null,applied=null,active=null,retry=null,disposed=false;
 const clearRetry=()=>{if(retry!==null)clearTimer(retry);retry=null;};
 function clearAttempt(attempt){clearTimer(attempt.timer);clearTimer(attempt.poll);attempt.query++;}
 function finish(attempt,ok,error){
  if(disposed||active!==attempt)return;
  clearAttempt(attempt);active=null;
  if(desired!==attempt.plan){pump();return;}
  if(ok){applied=attempt.plan.key;onSuccess(attempt.plan);return;}
  if(attempt.plan.retries++<2){retry=setTimer(()=>{retry=null;pump();},250*attempt.plan.retries);}
  else onError(error,attempt.plan);
 }
 function verify(attempt){
  if(disposed||active!==attempt||attempt.reading)return;
  const context=getContext(),query=++attempt.query;attempt.reading=true;
  const received=region=>{
   if(disposed||active!==attempt||query!==attempt.query)return;
   attempt.reading=false;
   if(regionMatches(attempt.plan.points,region)){finish(attempt,true);return;}
   // Native animations and view updates can complete after their success callback.
   attempt.poll=setTimer(()=>verify(attempt),150);
  };
  try{context.getRegion({success:received,fail:error=>finish(attempt,false,error)});}
  catch(error){finish(attempt,false,error);}
 }
 function reconcile(){
  if(disposed||isPaused()||!desired)return;
  if(active){if(active.accepted)verify(active);return;}
  const plan=desired,context=getContext();if(!context)return;
  try{context.getRegion({success:region=>{
   if(disposed||isPaused()||desired!==plan||active)return;
   if(!regionMatches(plan.points,region)){applied=null;pump();}
  },fail:()=>{if(!disposed&&desired===plan){applied=null;pump();}}});}
  catch(_){applied=null;pump();}
 }
 function pump(){
  if(disposed||active||retry!==null||!desired||isPaused()||applied===desired.key)return;
  const context=getContext();if(!context)return;
  const attempt={plan:desired,query:0,reading:false,accepted:false};active=attempt;
  attempt.timer=setTimer(()=>finish(attempt,false,{errMsg:'native map viewport did not reach the selected date'}),2500);
  try{context.includePoints({points:attempt.plan.points,padding:[20,20,20,20],
   success:()=>{if(active!==attempt){reconcile();return;}attempt.accepted=true;verify(attempt);},
   fail:error=>finish(attempt,false,error)});
  }catch(error){finish(attempt,false,error);}
 }
 return {
  submit(plan){if(disposed)return;if(!desired||desired.key!==plan.key){clearRetry();desired=Object.assign({retries:0},plan);}pump();},
  regionChanged(event){const detail=event.detail||{},type=detail.type||event.type;
   if(type==='end'&&!['gesture','drag','scale'].includes(detail.causedBy||event.causedBy))reconcile();},
  invalidate(){clearRetry();desired=null;applied=null;},
  dispose(){disposed=true;clearRetry();if(active)clearAttempt(active);active=null;desired=null;},
 };
}
const mercator=latitude=>Math.log(Math.tan(Math.PI/4+Math.max(-85,Math.min(85,latitude))*Math.PI/360));
function regionMatches(points,region){
 if(!points||points.length<2||!region||!region.northeast||!region.southwest)return false;
 const coords=[...points,region.northeast,region.southwest];
 if(coords.some(p=>!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)))return false;
 const xs=points.map(p=>p.longitude),ys=points.map(p=>mercator(p.latitude));
 const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
 const ax0=region.southwest.longitude,ax1=region.northeast.longitude,ay0=mercator(region.southwest.latitude),ay1=mercator(region.northeast.latitude);
 const dx=Math.max(.0001,x1-x0),dy=Math.max(.000001,y1-y0),aw=ax1-ax0,ah=ay1-ay0;
 return aw>0&&ah>0&&ax0<=x0+dx*.12&&ax1>=x1-dx*.12&&ay0<=y0+dy*.12&&ay1>=y1-dy*.12
  &&Math.abs((ax0+ax1-x0-x1)/2)<=dx*.35&&Math.abs((ay0+ay1-y0-y1)/2)<=dy*.35
  &&Math.min(aw/dx,ah/dy)<3;
}
// Fit a small Mercator rectangle without accessing the phone's location.
function cameraBounds(latitude,longitude,scale,width,height){
 const y=(1-mercator(latitude)/Math.PI)/2;
 const world=256*Math.pow(2,scale),dx=Math.max(1,width-40)/world/2,dy=Math.max(1,height-40)/world/2;
 const inverse=value=>Math.atan(Math.sinh(Math.PI*(1-2*value)))*180/Math.PI;
 return [{latitude:inverse(y+dy),longitude:Math.max(-180,longitude-dx*360)},{latitude:inverse(y-dy),longitude:Math.min(180,longitude+dx*360)}];
}
module.exports={createMapCamera,cameraBounds,regionMatches};
