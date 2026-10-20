const {savePhoto,saveError}=require('../../utils/save-photo');
Component({
 properties:{autoSize:{type:Boolean,value:false},upgrade:{type:Boolean,value:true},photo:{type:Object,value:{}},height:{type:Number,value:400},active:{type:Boolean,value:true}},
 data:{flipped:false,turning:false,saving:false,backgroundSrc:'',backHeight:0},
 lifetimes:{detached(){clearTimeout(this._turnTimer);}},
 methods:{
  quality(event){if(event.detail.src)this.setData({backgroundSrc:event.detail.src});},
  flip(){
   if(this.data.turning)return;
   const flipped=!this.data.flipped;
   this.setData({flipped,turning:true});
   clearTimeout(this._turnTimer);this._turnTimer=setTimeout(()=>this.setData({turning:false}),540);
  },
  async save(){
   if(this.data.turning||this.data.saving||!this.data.photo.download)return;
   this.setData({saving:true});wx.showLoading({title:'下载原尺寸照片'});
   let error;
   try{await savePhoto(this.data.photo);}catch(value){error=value;}
   finally{wx.hideLoading();this.setData({saving:false});}
   if(error)saveError(error);else wx.showToast({title:'已保存到相册',icon:'success'});
  },
  preview(){if(!this.data.turning)this.triggerEvent('open',{photo:this.data.photo,pure:true});},
 }
});
