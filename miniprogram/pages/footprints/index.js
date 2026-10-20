const {placeReference}=require('../../utils/place-reference');
const {createMapCamera,cameraBounds}=require('../../utils/map-camera');
const {imageFailed}=require('../../utils/image-fallback');
const api=require('../../utils/api');const theme=require('../../utils/theme');const fp=require('../../utils/footprints');
Page({imageFailed,
 data:{previewUpgrade:true,theme:'light',photos:[],shown:[],groups:[],placeLabels:['全部地点'],placeIndex:0,activePlace:'',category:'',categoryIndex:0,categories:['全部题材','人像','自然','城市','星空'],query:'',includeUndated:true,minYear:0,maxYear:0,from:0,to:0,advanced:false,loading:true,error:'',mapError:'',mapArea:false,mapUnavailable:false,mapUpdating:false,mapMounted:true,mapLatitude:32,mapLongitude:112,mapScale:3,markers:[],includePoints:[],latitude:32,longitude:112,scale:3,mapTitle:'全部足迹',mapDescription:'',ticks:[],timeLabel:'全部足迹',timeOffset:0,scrollTop:0,windowHeight:600,storyHeight:400,mapHeight:180,fixedHeight:296,railTop:200,railHeight:180,timelineTail:0},
 onLoad(){this.resize();this.load();},onReady(){if(wx.createMapContext)this._mapContext=wx.createMapContext('footprints-map',this);this._mapSelection=undefined;this.resize();this.bindScrollContext();if(!this.data.loading)this.commitMap();},onShow(){this._hidden=false;if(!this.data.mapMounted)this.remountMap();this._mapSelection=undefined;theme.pageTheme(this);if(!this.data.previewUpgrade)this.setData({previewUpgrade:true});this.scheduleMap();const place=getApp().globalData.footprintsPlace;if(place){delete getApp().globalData.footprintsPlace;this.setData({activePlace:place});if(!this.data.loading)this.render();}},onHide(){this._mapMountRevision=(this._mapMountRevision||0)+1;this._hidden=true;if(this._mapCamera)this._mapCamera.invalidate();clearTimeout(this._settleTimer);this.cancelSeek();},
 onUnload(){this._mapMountRevision=(this._mapMountRevision||0)+1;this._hidden=true;if(this._mapCamera)this._mapCamera.dispose();this.cancelSeek();clearTimeout(this._settleTimer);clearTimeout(this.searchTimer);this._loadRevision=(this._loadRevision||0)+1;},
 onResize(){this.resize();},
 resize(){const info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();const unit=info.windowWidth/750;this._mapWidth=info.windowWidth-120*unit;const mapHeight=Math.max(120,Math.min(240,info.windowHeight*.31,info.windowHeight-190-160*unit));const fixedHeight=mapHeight+160*unit;const railHeight=Math.min(360,Math.max(180,info.windowHeight*.44));this.setData({windowHeight:info.windowHeight,mapHeight,fixedHeight,storyHeight:info.windowHeight-fixedHeight,railHeight,railTop:(info.windowHeight-railHeight)/2},()=>{this._mapSelection=undefined;this.measure();this.scheduleMap();});},
 bindScrollContext(){if(!wx.createSelectorQuery)return;const node=wx.createSelectorQuery().in(this).select('.timeline-scroll');if(node.node)node.node(result=>{this._scrollContext=result&&result.node;}).exec();},
 cancelSeek(){clearTimeout(this._seekTimer);this._seekTimer=null;this._pendingSeek=undefined;this._dragging=false;},
 onPullDownRefresh(){this.load(true).finally(()=>wx.stopPullDownRefresh());},
 async load(force){const revision=this._loadRevision=(this._loadRevision||0)+1;this.setData({loading:true,error:''});try{const data=await api.footprints({limit:500},force);const photos=data.photos.slice();while(photos.length<data.total){const next=await api.footprints({limit:500,offset:photos.length},force);if(!next.photos.length)throw new Error('作品未加载完整，请重试。');photos.push(...next.photos);}if(revision!==this._loadRevision)return;const years=photos.map(p=>p.year).filter(Boolean),minYear=years.length?Math.min(...years):0,maxYear=years.length?Math.max(...years):0;this.setData({photos,minYear,maxYear,from:minYear,to:maxYear,loading:false});this.render();}catch(error){if(revision===this._loadRevision)this.setData({loading:false,error:api.message(error)});}},
 render(){if(this._mapCamera)this._mapCamera.invalidate();this._mapSelection=undefined;this.cancelSeek();clearTimeout(this._settleTimer);this._scrollY=0;this._dragging=false;this._activeTick=undefined;const base=fp.filterPhotos(this.data.photos,{from:this.data.from,to:this.data.to,includeUndated:this.data.includeUndated,category:this.data.category,query:this.data.query});const places=fp.places(base);const shown=this.data.activePlace?base.filter(p=>p.geo&&p.geo.label===this.data.activePlace):base;const groups=fp.groups(shown).map((g,i)=>Object.assign({},g,{anchor:'day-'+i}));this.setData({shown,groups,placeLabels:['全部地点（'+places.length+'）',...places.map(p=>p.label+' · '+p.count+' 张')],placeIndex:this.data.activePlace?places.findIndex(p=>p.label===this.data.activePlace)+1:0,scrollTop:0,timelineTail:0},()=>{this._places=places;if(this._scrollContext&&this._scrollContext.scrollTo)this._scrollContext.scrollTo({top:0,animated:false});this.measure();this.commitMap();});},
 measure(){if(this.data.loading||typeof wx==='undefined'||!wx.createSelectorQuery)return;const query=wx.createSelectorQuery().in(this);query.select('.timeline-scroll').boundingClientRect();query.selectAll('.calendar-heading').boundingClientRect();query.selectAll('.timeline-photo').boundingClientRect();query.select('.story-content').boundingClientRect();query.exec(result=>{if(!result||!result[0]||!result[3])return;const y=this._scrollY||0,top=result[0].top,layout=fp.dateTimeline(result[1].map(r=>r.top-top+y),result[3].height,result[0].height,this.data.timelineTail);if(Math.abs(layout.tail-this.data.timelineTail)>1){this.setData({timelineTail:layout.tail},()=>this.measure());return;}this._maxScroll=layout.max;this._stops=layout.stops;this._photoStops=result[2].map(r=>({id:r.dataset.id,top:r.top-top+y,left:r.left})).sort((a,b)=>a.top-b.top||b.left-a.left);this.updateTracking();});},
 onScroll(event){if(this._dragging)return;this._scrollY=event.detail.scrollTop;this.updateTracking();this.scheduleMap();},
 track(){
  const stops=this._stops||[];if(stops.length<2)return;
  const y=this._scrollY||0;
  let day=0;for(let i=0;i<this.data.groups.length;i++){if(stops[i+1]<=y+1)day=i;else break;}
  this._currentDay=day;
  const group=this.data.groups[day];
  const ids=new Set((group&&group.items||[]).map(photo=>photo.id));
  const points=(this._photoStops||[]).filter(point=>ids.has(point.id));
  let current=points[0];for(const point of points){if(point.top<=y+12)current=point;else break;}
  this._currentPhoto=current?current.id:group&&group.items[0]&&group.items[0].id;
  const active=y<=2?0:y>=stops[stops.length-1]-1?stops.length-1:day+1;
  const timeLabel=y<=2?'全部足迹':group?fp.dateLabel(group.key):'拍摄记录';
  const timeOffset=active/(stops.length-1)*this.data.railHeight;
  const patch={};
  if(this._activeTick!==active||this.data.ticks.length!==stops.length){
   this._activeTick=active;patch.ticks=stops.map((_,i)=>({id:i,top:i/(stops.length-1)*100,width:[50,29,17][Math.abs(i-active)]||7,opacity:[1,.54,.34][Math.abs(i-active)]||.24,active:i===active}));
  }
  if(this.data.timeLabel!==timeLabel)patch.timeLabel=timeLabel;
  if(this.data.timeOffset!==timeOffset)patch.timeOffset=timeOffset;
  return patch;
 },
 updateTracking(){const patch=this.track();if(patch&&Object.keys(patch).length)this.setData(patch);},
 scheduleMap(){clearTimeout(this._settleTimer);if(!this._dragging)this._settleTimer=setTimeout(()=>this.commitMap(),320);},
 commitMap(){if(this._dragging||this._hidden||this.data.loading)return;if(!this.data.previewUpgrade)this.setData({previewUpgrade:true});const overview=(this._scrollY||0)<=2;const items=overview?this.data.shown:((this.data.groups[this._currentDay||0]||{}).items||[]);const photo=items.find(p=>p.id===this._currentPhoto)||items[0];const reference=overview?null:placeReference(photo);const selection=overview?'overview':((this.data.groups[this._currentDay||0]||{}).key||'')+'|'+(photo&&photo.id||'');if(this._mapSelection===selection)return;this._mapSelection=selection;const unique=[...new Map(items.filter(fp.located).map(p=>[p.geo.label||p.id,p])).values()];const markers=fp.markers(unique);const revision=this._mapRevision=(this._mapRevision||0)+1;const patch={markers,mapError:'',mapArea:!!reference,mapUnavailable:false,mapUpdating:true,mapTitle:overview?(this.data.activePlace||'全部足迹'):(this.data.groups[this._currentDay||0]||{}).title||'拍摄记录',mapDescription:overview?fp.places(this.data.shown).length+' 个地点 · '+this.data.shown.length+' 张作品':photo&&photo.locationText||'地点待补充'};if(overview){const locations=[...new Map(items.map(p=>fp.located(p)?p.geo:placeReference(p)).filter(Boolean).map(g=>[g.label,g])).values()];patch.includePoints=locations.map(g=>({latitude:g.latitude,longitude:g.longitude}));if(locations.length===1&&locations[0].kind==='place-area'){patch.mapArea=true;patch.scale=locations[0].scale;}}else if(fp.located(photo)){patch.includePoints=[];patch.latitude=photo.geo.latitude;patch.longitude=photo.geo.longitude;patch.scale=photo.geo.precision==='city'?8:10;}else if(reference){patch.includePoints=[];patch.markers=[];patch.latitude=reference.latitude;patch.longitude=reference.longitude;patch.scale=reference.scale;patch.mapDescription=(photo.locationText||reference.label)+' · 地点范围';}
 else{patch.markers=[];patch.mapUnavailable=true;patch.includePoints=this.data.shown.filter(fp.located).map(p=>({latitude:p.geo.latitude,longitude:p.geo.longitude}));patch.latitude=32;patch.longitude=112;patch.scale=3;patch.mapDescription=(photo&&(photo.locationText||photo.geo&&photo.geo.label)||'地点待补充')+' · 坐标待补充';}if(overview&&patch.includePoints.length<2){const point=patch.includePoints[0];patch.latitude=point?point.latitude:32;patch.longitude=point?point.longitude:112;patch.scale=point?(patch.scale||8):3;}this.setData(patch,()=>{
  if(this._dragging||this._hidden||this._mapSelection!==selection||this._mapRevision!==revision)return;
  if(!this._mapCamera)this._mapCamera=createMapCamera({getContext:()=>this._mapContext,isPaused:()=>this._dragging||this._hidden||this.data.loading||!this.data.mapMounted,setTimer:setTimeout,clearTimer:clearTimeout,
   onSuccess:plan=>{this._mapRecoveryKey=undefined;this.setData({mapError:'',mapUpdating:false});console.info('[footprints-map] viewport verified',plan.key.split('|')[0]);},
   onError:(error,plan)=>{console.warn('[footprints-map] viewport not reached',error&&error.errMsg||error&&error.message||'unknown');
    if(this._mapRecoveryKey!==plan.key){this._mapRecoveryKey=plan.key;this.remountMap();}
    else {this._mapSelection=undefined;this.setData({mapUpdating:false,mapError:'地图定位未完成，点此重试。'});}}
  });
  const latitude=patch.latitude===undefined?this.data.latitude:patch.latitude,longitude=patch.longitude===undefined?this.data.longitude:patch.longitude;
  const points=patch.includePoints&&patch.includePoints.length>1?patch.includePoints:cameraBounds(latitude,longitude,patch.scale||this.data.scale,this._mapWidth||320,this.data.mapHeight);
  this._mapCamera.submit({key:selection+'|'+JSON.stringify(points),points});
 });},
 mapRegionChanged(event){if(this._mapCamera)this._mapCamera.regionChanged(event);},
 remountMap(){
  if(this._hidden)return;const revision=this._mapMountRevision=(this._mapMountRevision||0)+1;
  if(this._mapCamera)this._mapCamera.dispose();this._mapCamera=null;this._mapContext=null;this._mapSelection=undefined;
  this.setData({mapMounted:false,mapUpdating:true},()=>{if(this._hidden||revision!==this._mapMountRevision)return;
   this.setData({mapMounted:true,mapLatitude:this.data.latitude,mapLongitude:this.data.longitude,mapScale:this.data.scale},()=>{
    const ready=()=>{if(this._hidden||revision!==this._mapMountRevision)return;this._mapContext=wx.createMapContext('footprints-map',this);this._mapSelection=undefined;this.commitMap();};
    if(wx.nextTick)wx.nextTick(ready);else ready();
   });
  });
 },
 retryMap(){this._mapRecoveryKey=undefined;this._mapSelection=undefined;if(this._mapCamera)this._mapCamera.invalidate();this.scheduleMap();},
 seek(event){if(this.data.previewUpgrade)this.setData({previewUpgrade:false});const touch=(event.touches&&event.touches[0])||(event.changedTouches&&event.changedTouches[0]);if(!touch)return;const value=Math.max(0,Math.min(1,(touch.clientY-this.data.railTop)/this.data.railHeight));this._pendingSeek=fp.snapTimeline(this._stops||[],value);if(this._seekTimer)return;const delay=Math.max(0,32-(Date.now()-(this._lastSeekAt||0)));if(!delay)this.flushSeek();else this._seekTimer=setTimeout(()=>{this._seekTimer=null;this.flushSeek();},delay);},
 flushSeek(){if(this._pendingSeek===undefined)return;this._lastSeekAt=Date.now();const top=this._pendingSeek;this._pendingSeek=undefined;if(Math.abs((this._scrollY||0)-top)<.5)return;this._scrollY=top;const patch=this.track()||{};if(this._scrollContext&&this._scrollContext.scrollTo){this._scrollContext.scrollTo({top,animated:false});}else patch.scrollTop=top;if(Object.keys(patch).length)this.setData(patch);},
 tapSeek(event){if(Date.now()<(this._suppressTapUntil||0))return;const y=event.detail&&event.detail.y;if(typeof y!=='number')return;this.seek({changedTouches:[{clientY:y}]});this.scheduleMap();},
 startSeek(event){this._mapSelection=undefined;if(this._mapCamera)this._mapCamera.invalidate();this._dragging=true;clearTimeout(this._settleTimer);this.seek(event);},moveSeek(event){if(this._dragging)this.seek(event);},endSeek(){clearTimeout(this._seekTimer);this._seekTimer=null;this.flushSeek();this._dragging=false;this._suppressTapUntil=Date.now()+400;this.scheduleMap();},
 top(){const force=!(this._scrollContext&&this._scrollContext.scrollTo)&&this.data.scrollTop===0&&(this._scrollY||0)>0;this.cancelSeek();const reset=()=>{this._pendingSeek=0;this.flushSeek();this.scheduleMap();};if(force)this.setData({scrollTop:1},reset);else reset();},
 chooseCategory(event){const i=Number(event.detail.value);this.setData({categoryIndex:i,category:i?this.data.categories[i]:''});this.render();},
 choosePlace(event){const i=Number(event.detail.value);this.setData({activePlace:i&&this._places[i-1]?this._places[i-1].label:''});this.render();},
 onSearch(event){clearTimeout(this.searchTimer);this.setData({query:event.detail.value.trim()});this.searchTimer=setTimeout(()=>this.render(),250);},
 toggleAdvanced(){this.setData({advanced:!this.data.advanced});},toggleUndated(event){this.setData({includeUndated:event.detail.value});this.render();},
 fromChange(event){this.setData({from:Math.min(Number(event.detail.value),this.data.to)});this.render();},toChange(event){this.setData({to:Math.max(Number(event.detail.value),this.data.from)});this.render();},
 reset(){clearTimeout(this.searchTimer);this.setData({category:'',categoryIndex:0,query:'',activePlace:'',includeUndated:true,from:this.data.minYear,to:this.data.maxYear});this.render();},
 markerTap(event){const marker=this.data.markers.find(m=>m.id===event.detail.markerId);const photo=marker&&this.data.photos.find(p=>p.id===marker.photoId);if(photo){this.setData({activePlace:photo.geo.label||''});this.render();}},
 mapFailed(){this._mapSelection=undefined;if(this._mapCamera)this._mapCamera.invalidate();this.setData({mapError:'地图暂未加载，点此重试；仍可沿时间浏览照片。'});},
 cardResize(){this.measure();this.scheduleMap();},
 openPhoto(event){if(event.detail.pure){const p=event.detail.photo;if(p&&p.id)wx.navigateTo({url:'/pages/photo/index?id='+encodeURIComponent(p.id)+'&viewer=1'});return;}wx.navigateTo({url:'/pages/photo/index?id='+encodeURIComponent(event.currentTarget.dataset.id)});},
 onShareAppMessage(){return{title:'Photo Atlas 摄影足迹',path:'/pages/footprints/index'};},onShareTimeline(){return{title:'Photo Atlas 摄影足迹'};}
});
