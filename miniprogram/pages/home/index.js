const {previewScroll}=require('../../utils/image-queue');
const api=require('../../utils/api');
const theme=require('../../utils/theme');
const {journeySelection}=require('../../utils/home-journey');
const {imageFailed}=require('../../utils/image-fallback');
Page({imageFailed,
 onPageScroll(event){previewScroll(event);this.scheduleMore();},
 onReachBottom(){if(this.canLoadMore())this.setData({pullNear:true});},
 scheduleMore(){if(this._moreTimer||this._unloaded)return;this._moreTimer=setTimeout(()=>{this._moreTimer=null;this.checkMore();},100);},
 checkMore(){
  if(this._unloaded||!this.data.galleryActive||this.data.loading||this.data.loadingMore||this.data.error||this.data.mode!=='all'||!this.data.photos.length||this.data.photos.length>=this.data.total||!wx.createSelectorQuery)return;
  const info=typeof wx.getWindowInfo==='function'?wx.getWindowInfo():wx.getSystemInfoSync();
  wx.createSelectorQuery().select('.collection-bridge').boundingClientRect(rect=>{const near=!!rect&&rect.top<=info.windowHeight&&rect.bottom>=0;if(near!==this.data.pullNear)this.setData({pullNear:near});}).exec();
 },
 data:{pullNear:false,searchOpen:false,browseOpen:false,flow:false,journey:null,galleryActive:false,theme:'light',settings:{},photos:[],daily:[],posts:[],total:0,mode:'daily',sectionTitle:'作品',sectionDescription:'',category:'',query:'',loading:true,loadingMore:false,error:'',categories:[{label:'全部题材',value:''},{label:'人像',value:'人像'},{label:'自然',value:'自然'},{label:'城市',value:'城市'},{label:'星空',value:'星空'}]},
 onLoad(options){const value=options||{};this.setData({mode:value.view==='all'?'all':'daily',category:['人像','自然','城市','星空'].includes(value.category)?value.category:'',query:String(value.q||'').slice(0,240)});this.loadHome();},
 onShow(){theme.pageTheme(this);this.setData({galleryActive:true});this.scheduleMore();const day=new Date(Date.now()+8*3600000).toISOString().slice(0,10);if(this._homeLoaded&&this._dailyDate!==day&&!this.data.loading)this.loadHome(true);},onHide(){this.setData({galleryActive:false});},
 onUnload(){this._unloaded=true;clearTimeout(this.searchTimer);clearTimeout(this._moreTimer);this._catalogRevision=(this._catalogRevision||0)+1;},
 onPullDownRefresh(){this.loadHome(true).finally(()=>wx.stopPullDownRefresh());},
 async loadHome(force){this.setData({loading:true,error:''});try{const data=await api.home(force);this._homeLoaded=true;this._dailyDate=data.daily_date||new Date(Date.now()+8*3600000).toISOString().slice(0,10);this.setData({settings:data.settings,daily:data.photos,posts:(data.posts||[]).slice(0,3),journey:journeySelection(data.photos),loading:false});wx.setNavigationBarTitle({title:data.settings.site_name||'PixelCore'});await this.loadCatalog(true);this.loadJourney(data);}catch(error){this.setData({loading:false,error:api.message(error)});}},
 async loadJourney(data){if(this.data.journey)return;const album=(data.albums||[]).find(item=>item.kind==='travel'&&item.count>=2);if(!album)return;try{const result=await api.oneAlbum(album.slug,{limit:12});if(!this._unloaded)this.setData({journey:journeySelection(result.photos)});}catch(_){}},
 explore(){wx.pageScrollTo({selector:'#collection',duration:220});},
 toggleSearch(){this.setData({searchOpen:!this.data.searchOpen});},toggleBrowse(){this.setData({browseOpen:!this.data.browseOpen});},toggleFlow(){this.setData({flow:!this.data.flow});},
 openJourney(){getApp().globalData.footprintsPlace=this.data.journey.place;this.openFootprints();},
 openJourneyPhoto(event){wx.navigateTo({url:'/pages/photo/index?id='+encodeURIComponent(event.currentTarget.dataset.id)});},
 updateHeading(){const {query,category}=this.data;this.setData({sectionTitle:'作品',sectionDescription:query?'搜索“'+query+'”'+(category?' · '+category:''):category?category+'作品':''});},
 onSearch(event){clearTimeout(this.searchTimer);this.setData({query:event.detail.value.trim()});this._catalogRevision=(this._catalogRevision||0)+1;this.searchTimer=setTimeout(()=>this.loadCatalog(true),300);},
 chooseCategory(event){clearTimeout(this.searchTimer);this.setData({category:event.currentTarget.dataset.value||''});this.loadCatalog(true);},
 chooseMode(event){clearTimeout(this.searchTimer);const mode=event.currentTarget.dataset.mode==='all'?'all':'daily';this.setData({mode});this.loadCatalog(true);},
 clearFilters(){clearTimeout(this.searchTimer);this.setData({query:'',category:''});this.loadCatalog(true);},
 async loadCatalog(reset){
  this.setData({pullNear:false});this.updateHeading();const token=this._catalogRevision=(this._catalogRevision||0)+1;
  const {mode,query,category,photos,daily}=this.data;
  if(!this._homeLoaded)return this.loadHome(true);
  if(mode==='daily'){
   const keyword=query.toLocaleLowerCase();const selected=daily.filter(photo=>(!category||photo.category===category)&&(!keyword||[photo.title,photo.geo&&photo.geo.label,photo.captured&&photo.captured.value,...(photo.tags||[])].some(value=>String(value||'').toLocaleLowerCase().includes(keyword))));
   this.setData({photos:selected,total:selected.length,error:'',loadingMore:false});return;
  }
  this._failedReset=reset;this.setData({loadingMore:true,error:'',...(reset?{photos:[],total:0}:{})});
  try{const data=await api.catalog({limit:36,offset:reset?0:photos.length,search:query,category});if(token!==this._catalogRevision)return;if(!reset&&!data.photos.length&&photos.length<data.total)throw new Error('未能取得更多作品，请重试。');this.setData({photos:reset?data.photos:photos.concat(data.photos),total:data.total});}
  catch(error){if(token===this._catalogRevision)this.setData({error:api.message(error)});}
  finally{if(token===this._catalogRevision)this.setData({loadingMore:false},()=>this.scheduleMore());}
 },
 retry(){return this._homeLoaded?this.loadCatalog(this._failedReset!==false):this.loadHome(true);},
 canLoadMore(){return !this._unloaded&&this.data.galleryActive&&!this.data.loading&&!this.data.loadingMore&&!this.data.error&&this.data.mode==='all'&&this.data.photos.length>0&&this.data.photos.length<this.data.total;},
 commitPull(value){if(value.count===this.data.photos.length&&this.data.pullNear&&this.canLoadMore())return this.loadMore();},
 loadMore(){if(this.canLoadMore())return this.loadCatalog(false);},
 openPhoto(event){if(event.detail.pure){const p=event.detail.photo;if(p&&p.id)wx.navigateTo({url:'/pages/photo/index?id='+encodeURIComponent(p.id)+'&viewer=1'});return;}wx.navigateTo({url:'/pages/photo/index?id='+encodeURIComponent(event.detail.photo.id)});},
 openAlbums(){wx.switchTab({url:'/pages/albums/index'});},openFootprints(){wx.switchTab({url:'/pages/footprints/index'});},openJournal(){wx.switchTab({url:'/pages/journal/index'});},
 openPost(event){wx.navigateTo({url:'/pages/post/index?id='+encodeURIComponent(event.currentTarget.dataset.id)});},
 onShareAppMessage(){const {settings,mode,category,query}=this.data;return{title:(settings.site_name||'PixelCore')+' · 摄影与记录',path:'/pages/home/index?'+api.query({view:mode==='all'?'all':'',category,q:query})};},
 onShareTimeline(){return{title:(this.data.settings.site_name||'PixelCore')+' · 摄影与记录'};}
});
