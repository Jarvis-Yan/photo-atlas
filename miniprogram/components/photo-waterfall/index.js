const {homeGallery}=require('../../utils/home-gallery');
const {photoWall}=require('../../utils/photo-wall');
const {columns}=require('../../utils/waterfall');
Component({
  properties:{flip:{type:Boolean,value:false,observer:'layout'},layoutMode:{type:String,value:'legacy',observer:'layout'},flow:{type:Boolean,value:false,observer:'activity'},showControls:{type:Boolean,value:true},photos:{type:Array,value:[],observer:'layout'},active:{type:Boolean,value:true,observer:'activity'}},
  data:{wall:[],wallHeight:0,columns:[],eligible:false,running:false,scale:2,revision:0},
  lifetimes:{
    attached(){this._wallSeed=Math.floor(Math.random()*4294967296);this._attached=true;this._visible=false;const info=typeof wx.getWindowInfo==='function'?wx.getWindowInfo():wx.getSystemInfoSync();this.setData({scale:750/info.windowWidth});this.layout();},
    ready(){
      this._observer=this.createIntersectionObserver({thresholds:[0,.01],nativeMode:true});
      this._observer.relativeToViewport().observe('.gallery-observer',r=>{this._visible=r.intersectionRatio>0;this.updateMotion();});
    },
    detached(){this._attached=false;this._observer?.disconnect();},
  },
  methods:{
    revealPhoto(id,scrollTop){const query=this.createSelectorQuery();query.select('#gallery-photo-'+id).boundingClientRect();query.exec(result=>{if(result&&result[0])wx.pageScrollTo({scrollTop:Math.max(0,scrollTop+result[0].top-16),duration:420});});},
    layout(){if(!this._attached)return;
      if(this.data.layoutMode!=='legacy'){
       const photos=this.data.photos,mode=this.data.layoutMode,layout=homeGallery(photos,mode,686,20,this.data.flip,this._expanded||{});
       const ids=photos.map(p=>p.id),previous=this._galleryIDs||[];
       const append=!this._relayout&&mode==='masonry'&&this._galleryMode===mode&&previous.length>0&&previous.every((id,i)=>id===ids[i]);
       const wall=layout.items.map(item=>({photo:photos[item.index],id:photos[item.index].id,x:item.x,y:item.y,wallWidth:item.width,cardHeight:item.height}));
       const patch={wallHeight:layout.height,eligible:false,running:false};
       if(this._relayout&&previous.length===ids.length&&previous.every((id,i)=>id===ids[i])){wall.forEach((item,i)=>{patch['wall['+i+'].y']=item.y;patch['wall['+i+'].cardHeight']=item.cardHeight;});}else if(append){for(let i=previous.length;i<wall.length;i++)patch['wall['+i+']']=wall[i];}else patch.wall=wall;
       this._relayout=false;this._galleryIDs=ids;this._galleryMode=mode;this.setData(patch);return;
      }
      this._galleryMode='legacy';const packed=columns(this.data.photos);const layout=photoWall(this.data.photos,686,14,100,this._wallSeed);const wall=layout.items.map(item=>Object.assign({},this.data.photos[item.index],{x:item.x,y:item.y,wallWidth:item.width,cardHeight:item.height}));this.setData({wall,wallHeight:layout.height,columns:packed,eligible:packed.every(c=>c.height>=1050),revision:this.data.revision+1});this.updateMotion();},
    activity(){this.updateMotion();},
    updateMotion(){if(!this._attached)return;const running=!!(this.data.active&&this._visible&&this.data.flow&&this.data.eligible);if(running!==this.data.running)this.setData({running});},
    toggle(){this.setData({flow:!this.data.flow});this.updateMotion();},
    flipResize(event){const {id,height}=event.detail;this._expanded=this._expanded||{};if((this._expanded[id]||0)===height)return;this._expanded[id]=height;this._relayout=true;this.layout();},
    flipOpen(event){this.triggerEvent('open',event.detail);},
    openRow(event){this.openById(event.currentTarget.dataset);},
    openById(data){const photo=this.data.photos.find(p=>p.id===data.id);if(photo)this.triggerEvent('open',{photo});},
  },
});
