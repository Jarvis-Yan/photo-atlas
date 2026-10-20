Component({
  properties:{photos:{type:Array,value:[],observer:'layout'},active:{type:Boolean,value:true,observer:'activity'}},
  data:{slides:[],index:0,position:0,counter:'',running:false},
  lifetimes:{
    attached(){this._attached=true;this._visible=false;this.layout();},
    ready(){
      this._observer=this.createIntersectionObserver({thresholds:[0,.01],nativeMode:true});
      this._observer.relativeToViewport().observe('.featured-frame',r=>{this._visible=r.intersectionRatio>0;this.activity();});
    },
    detached(){this._attached=false;this._observer?.disconnect();},
  },
  methods:{
    layout(){
      if(!this._attached)return;
      const photos=this.data.photos||[],length=photos.length;
      const slides=photos.map((photo,index)=>{
        const ratio=Number(photo.width)>0&&Number(photo.height)>0?photo.width/photo.height:1.5;
        const width=Math.min(502,420*ratio);
        return {id:photo.id,title:photo.title,width,height:width/ratio,side:index===0?'center':index===length-1?'before':'after',render:index===0||index===1||index===length-1};
      });
      this._dragging=false;this._animating=false;this._suppressUntil=0;
      this.setData({slides,index:0,position:0,counter:length?'1 / '+length:''});this.activity();
    },
    activity(){
      if(!this._attached)return;
      const running=!!(this.data.active&&this._visible&&!this._dragging&&this.data.slides.length>1);
      if(running!==this.data.running)this.setData({running});
    },
    change(event){
      const index=Number(event.detail.current),length=this.data.slides.length;
      if(!Number.isInteger(index)||index<0||index>=length||index===this.data.index)return;
      this._animating=true;this._suppressUntil=Date.now()+500;
      const patch={index,counter:String(index+1)+' / '+length};
      // Guard the source and changed value so updating current cannot feed a change loop.
      if((event.detail.source==='touch'||event.detail.source==='autoplay')&&this.data.position!==index)patch.position=index;
      this.data.slides.forEach((slide,i)=>{const distance=(i-index+length)%length;const render=distance<=1||distance===length-1;if(render!==slide.render)patch['slides['+i+'].render']=render;const side=distance===0?'center':distance===length-1?'before':'after';if(side!==slide.side)patch['slides['+i+'].side']=side;});
      this.setData(patch);
    },
    finish(){this._animating=false;},
    previous(){this.go(-1);},next(){this.go(1);},
    go(step){const length=this.data.slides.length;if(length>1)this.setData({position:(this.data.index+step+length)%length});},
    start(event){const t=event.touches?.[0];if(!t)return;this._startX=t.clientX;this._startY=t.clientY;this._moved=false;this._dragging=true;this.activity();},
    move(event){const t=event.touches?.[0];if(t&&Math.max(Math.abs(t.clientX-this._startX),Math.abs(t.clientY-this._startY))>8)this._moved=true;},
    end(){if(this._moved)this._suppressUntil=Date.now()+500;this._dragging=false;this.activity();},
    open(event){
      const index=Number(event.currentTarget.dataset.index);
      if(this._moved||this._animating||Date.now()<this._suppressUntil||index!==this.data.index)return;
      const photo=this.data.photos[index];if(photo)this.triggerEvent('open',{photo});
    },
  },
});
