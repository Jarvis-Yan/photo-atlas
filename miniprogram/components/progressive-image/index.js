const {imageQueue}=require('../../utils/image-queue');
const {absolute}=require('../../utils/format');
Component({
 properties:{background:{type:String,value:'var(--soft, transparent)'},photo:{type:Object,value:{},observer:'reset'},height:{type:String,value:'400rpx'},clearSize:{type:Number,value:1600,observer:'reset'},priority:{type:Boolean,value:false,observer:'sync'},active:{type:Boolean,value:true,observer:'sync'},upgrade:{type:Boolean,value:true,observer:'sync'},interactive:{type:Boolean,value:false}},
 data:{frames:[],quality:'none',retryLabel:''},
 lifetimes:{
  attached(){this._mounted=true;this._pageVisible=true;this._visible=false;this._near=false;this._revision=0;this._jobs={};this.reset();},
  ready(){this._nearObserver=this.createIntersectionObserver({thresholds:[0,.01],nativeMode:true});this._nearObserver.relativeToViewport({top:900,bottom:900}).observe('.progressive-frame',result=>{this._near=result.intersectionRatio>0;this.sync();});this._observer=this.createIntersectionObserver({thresholds:[0,.01],nativeMode:true});this._observer.relativeToViewport({top:180,bottom:180}).observe('.progressive-frame',result=>{this._visible=result.intersectionRatio>0;this.sync();});},
  detached(){this._mounted=false;this._revision++;this.cancel('small');this.cancel('clear');clearTimeout(this._retryTimer);this._observer?.disconnect();this._nearObserver?.disconnect();},
 },
 pageLifetimes:{show(){this._pageVisible=true;this.sync();},hide(){this._pageVisible=false;this.sync();}},
 methods:{
  reset(){if(!this._mounted)return;this._revision++;this.cancel('small');this.cancel('clear');clearTimeout(this._retryTimer);this._retryAt=false;this._smallAttempt=0;this._clearAttempt=0;this._smallDone=false;this._clearDone=false;this._blocked=false;this.setData({frames:[],quality:'none',retryLabel:''},()=>this.sync());},
  sync(){
   if(!this._mounted)return;
   if(!this._pageVisible||!this.data.active||(!this.data.priority&&!this._visible&&!this._near)){this.cancel('small');this.cancel('clear');clearTimeout(this._retryTimer);this._retryAt=false;return;}
   if(!this.data.upgrade||(!this.data.priority&&!this._visible)){this.cancel('clear');clearTimeout(this._retryTimer);this._retryAt=false;}
   if(this._blocked)return;
   if(!this._smallDone&&!this._jobs.small)this.begin('small');
   else if(this._smallDone&&!this._clearDone&&this.data.upgrade&&(this.data.priority||this._visible)&&!this._jobs.clear&&!this._retryAt)this.begin('clear');
  },
  cancel(stage){const job=this._jobs&&this._jobs[stage];if(!job)return;delete this._jobs[stage];clearTimeout(job.timer);job.task?.abort();job.cancel?.();if(this._mounted&&this.data.frames.some(frame=>frame.key===job.key))this.setData({frames:this.data.frames.filter(frame=>frame.key!==job.key)});},
  begin(stage){
   const photo=this.data.photo;if(!photo||!photo.id)return;
   const size=this.data.clearSize||1600;
   const small=[photo.mapThumbnail||photo.thumbnail||photo.src,photo.thumbnail||photo.src,photo.fallbackThumbnail||absolute('/media/'+photo.id+'/480.webp')].filter((src,i,list)=>src&&list.indexOf(src)===i);
   const clear=[absolute('/media/'+photo.id+'/'+size+'.webp'),absolute('/media/'+photo.id+'/thumb-v1-'+(size>=1600?1280:768)+'.webp'),absolute('/media/'+photo.id+'/'+size+'.webp?retry=1')];
   const attempt=stage==='small'?this._smallAttempt:this._clearAttempt,source=(stage==='small'?small:clear)[attempt];
   if(!source){if(stage==='small'){this._smallDone=true;this.sync()}else this.failedAll();return;}
   const revision=this._revision,key=revision+'-'+stage+'-'+attempt;const job={key,stage,revision};this._jobs[stage]=job;
   job.cancel=imageQueue.enqueue(stage,finish=>{
    if(!this._mounted||this._revision!==revision||this._jobs[stage]!==job){finish();return;}
    const timeout=stage==='small'?12000:20000;
    job.finish=finish;job.timer=setTimeout(()=>this.failure(job),timeout);
    // Abortable transport keeps obsolete downloads from occupying connections after a seek.
    // Only a complete successful file reaches <image>; bindload still gates the visible swap.
    job.task=wx.downloadFile({url:absolute(source),timeout,success:result=>{
     if(this._jobs[stage]!==job||this._revision!==revision)return;
     if(result.statusCode!==200||!result.tempFilePath){this.failure(job);return;}
     this.setData({frames:[...this.data.frames.filter(frame=>frame.ready),{key,src:result.tempFilePath,ready:false,stage}]});
    },fail:()=>this.failure(job)});
   });
  },
  frameLoaded(event){
   const key=event.currentTarget.dataset.key;const job=Object.values(this._jobs).find(value=>value.key===key);if(!job||job.revision!==this._revision)return;
   const frame=this.data.frames.find(value=>value.key===key);if(!frame)return;
   clearTimeout(job.timer);delete this._jobs[job.stage];job.finish?.();
   if(job.stage==='small')this._smallDone=true;else this._clearDone=true;
   this.setData({frames:[Object.assign({},frame,{ready:true})],quality:job.stage==='small'?'preview':'clear',retryLabel:''},()=>{this.triggerEvent('qualitychange',{quality:this.data.quality,src:frame.src});this.sync();});
  },
  frameFailed(event){const key=event.currentTarget.dataset.key;const job=Object.values(this._jobs).find(value=>value.key===key);if(job)this.failure(job);},
  failure(job){
   if(this._jobs[job.stage]!==job||job.revision!==this._revision)return;
   clearTimeout(job.timer);delete this._jobs[job.stage];job.task?.abort();job.finish?.();
   this.setData({frames:this.data.frames.filter(frame=>frame.key!==job.key)},()=>{
    if(job.stage==='small'){this._smallAttempt++;this.sync();return;}
    this._clearAttempt++;if(this._clearAttempt>=3){this.failedAll();return;}
    this._retryAt=true;this._retryTimer=setTimeout(()=>{this._retryAt=false;this.sync()},this._clearAttempt===1?1500:5000);
   });
  },
  failedAll(){this._blocked=true;this.setData({retryLabel:this.data.quality==='preview'?'重试清晰预览':'图片未加载，重试'});},
  retry(){this._blocked=false;this._clearAttempt=0;this._retryAt=false;clearTimeout(this._retryTimer);if(this.data.quality!=='preview'){this._smallDone=false;this._smallAttempt=0}this.setData({retryLabel:''});this.sync();},
 },
});
