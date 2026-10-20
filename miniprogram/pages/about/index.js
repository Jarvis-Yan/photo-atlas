const {previewScroll}=require('../../utils/image-queue');
const {imageFailed}=require('../../utils/image-fallback');
const api = require('../../utils/api');
const theme = require('../../utils/theme');
Page({onPageScroll:previewScroll,imageFailed,
  data:{theme:'light',settings:{},album:null,loading:true,error:''},
  onLoad(){this.load();},onShow(){theme.pageTheme(this);},
  onPullDownRefresh(){this.load(true).finally(()=>wx.stopPullDownRefresh());},
  async load(force){this.setData({loading:true,error:''});try{const data=await api.site(force);this.setData({settings:data.settings,album:data.albums.find(a=>a.kind==='travel'&&a.cover)||data.albums.find(a=>a.cover)||null,loading:false});}catch(error){this.setData({loading:false,error:api.message(error)});}},
  openAlbums(){wx.switchTab({url:'/pages/albums/index'});},
  openFootprints(){wx.switchTab({url:'/pages/footprints/index'});},
  openWork(){if(this.data.album&&this.data.album.cover)wx.navigateTo({url:'/pages/photo/index?id='+encodeURIComponent(this.data.album.cover.id)});},
  toggleTheme(){const next=this.data.theme==='dark'?'light':'dark';getApp().setTheme(next);theme.pageTheme(this);},
  copyContact(){if(this.data.settings.contact)wx.setClipboardData({data:this.data.settings.contact});},
  onShareAppMessage(){return{title:'关于 '+(this.data.settings.site_name||'PixelCore'),path:'/pages/about/index'};},
  onShareTimeline(){return{title:'关于 '+(this.data.settings.site_name||'PixelCore')};},
});
