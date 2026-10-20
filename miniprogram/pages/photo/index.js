const {previewScroll}=require('../../utils/image-queue');
const api = require('../../utils/api');
const theme = require('../../utils/theme');

function saveLocalImage(path) {
  return new Promise((resolve, reject) => wx.getImageInfo({src:path, success(info){
    wx.saveImageToPhotosAlbum({filePath:info.path, success:resolve, fail:reject});
  }, fail:reject}));
}

Page({onPageScroll:previewScroll,
  data:{viewer:false,theme:'light',id:'',photo:null,loading:true,saving:false,error:''},
  onLoad(options){this.setData({id:decodeURIComponent(options.id||''),viewer:options.viewer==='1'});this.load();},
  onShow(){theme.pageTheme(this);},
  onPullDownRefresh(){this.load(true).finally(()=>wx.stopPullDownRefresh());},
  async load(force){this.setData({loading:true,error:''});try{const photo=await api.onePhoto(this.data.id,force);this.setData({photo,loading:false});wx.setNavigationBarTitle({title:photo.title});}catch(error){this.setData({loading:false,error:api.message(error)});}},
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
  onShareAppMessage(){const p=this.data.photo||{};return{title:p.title||'PixelCore 作品',path:'/pages/photo/index?id='+encodeURIComponent(this.data.id),imageUrl:p.src||''};},
  onShareTimeline(){const p=this.data.photo||{};return{title:p.title||'PixelCore 作品',query:'id='+encodeURIComponent(this.data.id),imageUrl:p.src||''};},
});
