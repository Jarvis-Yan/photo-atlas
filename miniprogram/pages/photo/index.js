const {viewerPhotos,rememberViewer}=require('../../utils/viewer-session');
const {previewCache}=require('../../utils/preview-cache');
const {previewScroll}=require('../../utils/image-queue');
const api = require('../../utils/api');
const theme = require('../../utils/theme');

function saveLocalImage(path) {
  return new Promise((resolve, reject) => wx.getImageInfo({src:path, success(info){
    wx.saveImageToPhotosAlbum({filePath:info.path, success:resolve, fail:reject});
  }, fail:reject}));
}

Page({onPageScroll:previewScroll,
  data:{viewer:false,theme:'light',id:'',photo:null,viewerCount:0,viewerIndex:0,viewerHeight:300,loading:true,saving:false,error:''},
  onLoad(options){const id=decodeURIComponent(options.id||'');this.setData({id,viewer:options.viewer==='1'});this._viewerPhotos=this.data.viewer?viewerPhotos(id):[];const index=this._viewerPhotos.findIndex(p=>p.id===id);if(index>=0)this.selectViewer(index);else this.load();},
  onUnload(){this._loadRevision=(this._loadRevision||0)+1;},
  onResize(){if(this.data.viewer&&this.data.photo)this.resizeViewer(this.data.photo);},
  resizeViewer(photo){const info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();this.setData({viewerHeight:Math.max(120,Math.min((info.windowWidth-120)*photo.height/photo.width,info.windowHeight*.76))});},
  selectViewer(index){const list=this._viewerPhotos||[];if(!list.length)return;this._loadRevision=(this._loadRevision||0)+1;index=(index+list.length)%list.length;const original=list[index],photo=Object.assign({},original,{viewerPreview:previewCache.peek(original.id)||''});rememberViewer(photo.id);this.setData({id:photo.id,photo,viewerCount:list.length,viewerIndex:index,loading:false,error:''});this.resizeViewer(photo);wx.setNavigationBarTitle({title:photo.title});previewCache.prime([list[(index+1)%list.length],list[(index+list.length-1)%list.length]]);},
  previous(){this.switchViewer(-1);},next(){this.switchViewer(1);},
  switchViewer(step){if((this._viewerPhotos||[]).length<2)return;this.selectViewer(this.data.viewerIndex+step);wx.pageScrollTo({scrollTop:0,duration:0});},
  onShow(){theme.pageTheme(this);},
  onPullDownRefresh(){this.load(true).finally(()=>wx.stopPullDownRefresh());},
  async load(force){const revision=this._loadRevision=(this._loadRevision||0)+1;this.setData({loading:true,error:''});try{const photo=await api.onePhoto(this.data.id,force);if(revision!==this._loadRevision)return;this.setData({photo,loading:false});if(this.data.viewer)this.resizeViewer(photo);wx.setNavigationBarTitle({title:photo.title});}catch(error){if(revision===this._loadRevision)this.setData({loading:false,error:api.message(error)});}},
  preview(){const p=this.data.photo;if(p)wx.previewImage({current:p.preview,urls:[p.preview],showmenu:true});},
  async save(){
    const p=this.data.photo;if(!p||!p.download||this.data.saving)return;
    this.setData({saving:true});wx.showLoading({title:'准备预览图'});
    try{
      const downloaded=await new Promise((resolve,reject)=>wx.downloadFile({url:p.download,timeout:120000,success:r=>r.statusCode===200?resolve(r):reject(new Error('下载失败')),fail:reject}));
      await saveLocalImage(downloaded.tempFilePath);wx.showToast({title:'已保存到相册',icon:'success'});
    }catch(error){
      const denied=String(error&&error.errMsg||'').includes('auth deny')||String(error&&error.errMsg||'').includes('auth denied');
      if(denied)wx.showModal({title:'需要相册权限',content:'只在你点击保存时写入这张带水印作品，可在设置中重新授权。',confirmText:'打开设置',success:r=>{if(r.confirm)wx.openSetting();}});
      else wx.showToast({title:'保存失败，请稍后重试',icon:'none'});
    }finally{wx.hideLoading();this.setData({saving:false});}
  },
  onShareAppMessage(){const p=this.data.photo||{};return{title:p.title||'Photo Atlas 作品',path:'/pages/photo/index?id='+encodeURIComponent(this.data.id),imageUrl:p.src||''};},
  onShareTimeline(){const p=this.data.photo||{};return{title:p.title||'Photo Atlas 作品',query:'id='+encodeURIComponent(this.data.id),imageUrl:p.src||''};},
});
