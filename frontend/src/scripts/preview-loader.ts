const EMPTY='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
type Stage='small'|'clear';
interface RecordState {key:string;smallAttempt:number;clearAttempt:number;smallDone:boolean;clearDone:boolean;blocked:boolean;retryAt:number;timer?:ReturnType<typeof setTimeout>;button?:HTMLButtonElement}

/** A decoded small image stays visible until a decoded clear image can replace it. */
export class PreviewLoader {
 private observer:IntersectionObserver;
 private visible=new Set<HTMLImageElement>();
 private records=new Map<HTMLImageElement,RecordState>();
 private active=new Map<HTMLImageElement,{stage:Stage;cancel:()=>void}>();
 private held=false;
 private scrollRoot:HTMLElement|null;
 constructor(private root:HTMLElement,private limit=4,private clearLimit=2,private callbacks:{selector?:string;ready?:(image:HTMLImageElement,quality:string)=>void;error?:(image:HTMLImageElement)=>boolean|void}={}){
  this.scrollRoot=root.closest?.<HTMLElement>('#atlas-story')||null;
  this.observer=new IntersectionObserver(entries=>{
   for(const entry of entries){const img=entry.target as HTMLImageElement;if(entry.isIntersecting)this.visible.add(img);else this.visible.delete(img)}
   this.pump();
  },{root:this.scrollRoot,rootMargin:'900px 0px'});
 }
 watch(){
  const images=new Set(this.root.querySelectorAll<HTMLImageElement>(this.callbacks.selector||'img[data-preview-src]'));
  for(const [img,record] of this.records){
   const key=[img.dataset.previewSmall,img.dataset.previewSrc,img.dataset.previewSrcset].join('|');
   if(images.has(img)&&record.key===key)continue;
   this.active.get(img)?.cancel();this.active.delete(img);clearTimeout(record.timer);record.button?.remove();this.records.delete(img);this.visible.delete(img);this.observer.unobserve?.(img);
   if(images.has(img)){img.dataset.previewQuality='';img.dataset.previewState='idle'}
  }
  for(const img of images){
   if(this.records.has(img))continue;
   const quality=img.complete&&img.naturalWidth>1?img.dataset.previewQuality:'';
   this.records.set(img,{key:[img.dataset.previewSmall,img.dataset.previewSrc,img.dataset.previewSrcset].join('|'),smallAttempt:0,clearAttempt:0,smallDone:quality==='preview'||quality==='clear',clearDone:quality==='clear',blocked:false,retryAt:0});
   this.observer.observe(img);
  }
  this.pump();
 }
 pause(){this.held=true;for(const [img,job] of this.active){if(job.stage==='clear'){job.cancel();this.active.delete(img);img.dataset.previewState='preview'}}this.pump()}
 resume(){
  this.held=false;
  for(const [img,job] of this.active){if(!this.near(img)){job.cancel();this.active.delete(img);img.dataset.previewState=this.records.get(img)?.smallDone?'preview':'idle'}}
  this.pump();
 }
 private near(img:HTMLImageElement,margin=900){const r=img.getBoundingClientRect(),bounds=this.scrollRoot?.getBoundingClientRect();return img.isConnected&&r.bottom>(bounds?.top||0)-margin&&r.top<(bounds?.bottom||innerHeight)+margin}
 private pump(){
  for(const [img,job] of this.active){if(!this.near(img)){job.cancel();this.active.delete(img);img.dataset.previewState=this.records.get(img)?.smallDone?'preview':'idle'}}
  const candidates=[...this.visible].filter(img=>this.near(img)&&!this.active.has(img)).sort((a,b)=>Math.abs(a.getBoundingClientRect().top)-Math.abs(b.getBoundingClientRect().top));
  // Small previews get first claim on the connection budget. Clear upgrades use at most two slots.
  for(const img of candidates){const record=this.records.get(img);if(this.active.size>=this.limit)break;if(record&&!record.smallDone&&!record.blocked)this.start(img,record,'small')}
  if(this.held)return;
  let upgrades=[...this.active.values()].filter(job=>job.stage==='clear').length;
  for(const img of candidates){
   if(this.active.size>=this.limit||upgrades>=this.clearLimit)break;
   const record=this.records.get(img);
   if(record&&record.smallDone&&!record.clearDone&&!record.blocked&&!this.active.has(img)&&this.near(img,0)&&record.retryAt<=Date.now()){this.start(img,record,'clear');upgrades++}
  }
 }
 private start(img:HTMLImageElement,record:RecordState,stage:Stage){
  const attempt=stage==='small'?record.smallAttempt:record.clearAttempt;
  const options=stage==='small'?[img.dataset.previewSmall,img.dataset.previewLite,img.dataset.previewFallback]:[img.dataset.previewSrc,img.dataset.previewClearFallback,img.dataset.previewSrc];
  const source=options[attempt];
  if(!source){record.blocked=true;this.retryButton(img,record);return}
  const probe=new Image();probe.decoding='async';probe.fetchPriority=stage==='clear'?'low':'high';
  let alive=true,timer:ReturnType<typeof setTimeout>;
  const cancel=()=>{alive=false;clearTimeout(timer);probe.onload=null;probe.onerror=null;probe.removeAttribute('srcset');probe.src=EMPTY};
  const finish=()=>{alive=false;clearTimeout(timer);probe.onload=null;probe.onerror=null;this.active.delete(img)};
  const failed=()=>{
   if(!alive)return;
   finish();probe.removeAttribute('srcset');probe.src=EMPTY;
   if(stage==='small'){
    record.smallAttempt++;
    if(record.smallAttempt>=options.length){record.smallDone=true;img.dataset.previewState='idle'}
   }else{
    record.clearAttempt++;img.dataset.previewState=img.dataset.previewQuality==='preview'?'preview':'idle';
    if(record.clearAttempt>=options.length){record.blocked=true;this.retryButton(img,record)}
    else{const delay=record.clearAttempt===1?1500:5000;record.retryAt=Date.now()+delay;record.timer=setTimeout(()=>{record.retryAt=0;this.pump()},delay)}
   }
   this.pump();
  };
  probe.onerror=failed;
  probe.onload=()=>{void (async()=>{
   try{await probe.decode()}catch{failed();return}
   if(!alive||this.records.get(img)!==record||!img.isConnected)return;
   // Never assign an unverified source to the visible image or clear its existing preview.
   img.removeAttribute('srcset');img.src=probe.currentSrc||source;
   img.dataset.previewQuality=stage==='small'?'preview':'clear';img.dataset.previewState=stage==='small'?'preview':'loaded';
   if(stage==='small')record.smallDone=true;else record.clearDone=true;
   record.button?.remove();record.button=undefined;finish();this.callbacks.ready?.(img,stage==='small'?'preview':'clear');this.pump();
  })()};
  this.active.set(img,{stage,cancel});img.dataset.previewState=stage==='small'?'loading':'upgrading';
  if(stage==='clear'&&attempt!==1&&img.dataset.previewSrcset){probe.sizes=img.sizes;probe.srcset=img.dataset.previewSrcset}
  probe.src=source;timer=setTimeout(failed,stage==='small'?8000:15000);
 }
 private retryButton(img:HTMLImageElement,record:RecordState){
  if(record.button)return;if(this.callbacks.error?.(img)===false)return;
  const button=document.createElement('button');button.type='button';button.className='preview-retry';button.textContent=img.dataset.previewQuality==='preview'?'重试清晰预览':'图片未加载，重试';
  button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();button.remove();record.button=undefined;record.blocked=false;record.retryAt=0;record.clearAttempt=0;if(img.dataset.previewQuality!=='preview'){record.smallDone=false;record.smallAttempt=0}this.pump()});
  record.button=button;img.after(button);
 }
}
