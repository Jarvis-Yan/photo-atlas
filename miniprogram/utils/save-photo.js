/** Save the public full-resolution, watermarked JPEG; never the browsing thumbnail. */
function savePhoto(photo){
 if(!photo||!photo.download)return Promise.reject(new Error('原尺寸文件暂不可用'));
 return new Promise((resolve,reject)=>wx.downloadFile({url:photo.download,timeout:120000,
  success(result){if(result.statusCode!==200||!result.tempFilePath){reject(new Error('下载失败'));return;}
   wx.getImageInfo({src:result.tempFilePath,success(info){wx.saveImageToPhotosAlbum({filePath:info.path,success:resolve,fail:reject});},fail:reject});
  },fail:reject}));
}
function saveError(error){
 const message=String(error&&error.errMsg||'');
 if(/auth deny|auth denied|authorize.*fail/i.test(message))wx.showModal({title:'需要相册权限',content:'只在你点击保存时写入这张原尺寸带水印 JPEG，可在设置中重新授权。',confirmText:'打开设置',success:result=>{if(result.confirm)wx.openSetting();}});
 else wx.showToast({title:'保存失败，请稍后重试',icon:'none'});
}
module.exports={savePhoto,saveError};
