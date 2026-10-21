import {flipMarkup,photoFacts} from './photo-flip';
import {homeCollection,collectionFilter,type CollectionState} from './home-collection';
import {albumFacts,contactDestination} from './collection-details';
import {progressiveMarkup} from './progressive-markup';
import {PreviewLoader} from './preview-loader';
import {api,escaped,notice,errorText,initTheme,type Photo,type Album,type Post,type Catalog} from './api';
import {PhotoConveyor} from './conveyor';
import {PhotoMasonry} from './photo-masonry';
import {collectionAutoLoad} from './collection-scroll';
import {circularFeatured} from './circular-featured';
import {homeJourney} from './home-journey';
import {viewerImage} from './viewer-image';
import {viewerKeyStep} from './viewer-navigation';
import {publicNavigation} from './public-navigation';
initTheme();
const page=document.body.dataset.page||'home';
if(page!=='footprints'){
 const root=document.getElementById('public-main')!;const loader=new PreviewLoader(root,4,2,{selector:'img[data-preview-src]:not([data-preview-owner=cover])'});let queued=false;
 let settleTimer:ReturnType<typeof setTimeout>;
 const scrolling=()=>{loader.pause();clearTimeout(settleTimer);settleTimer=setTimeout(()=>loader.resume(),160)};
 document.addEventListener('scroll',scrolling,{capture:true,passive:true});
 window.addEventListener('pagehide',()=>{clearTimeout(settleTimer);loader.pause()});
 window.addEventListener('pageshow',()=>loader.resume());
 new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;loader.watch()})}}).observe(root,{subtree:true,childList:true});loader.watch();
}
const activeNav=document.querySelector('[data-nav="'+(page==='photos'?'home':page)+'"]');activeNav?.classList.add('active');activeNav?.setAttribute('aria-current','page');
let visiblePhotos:Photo[]=[];let viewerPhotos:Photo[]=[];let currentIndex=0;let viewerPure=false;
function image(photo:Photo,eager=false,detail=false,grid=false,slot=''){
 const sizes=slot||(detail?'(max-width:700px) calc(100vw - 40px), 65vw':grid?'(max-width:700px) calc((100vw - 54px)/2), (max-width:1099px) calc(45vw - 14px), (max-width:1512px) calc(30vw - 19px), 432px':'(max-width:700px) calc((100vw - 54px)/2), (max-width:1512px) calc(45vw - 18px), 658px');
 return progressiveMarkup(photo,sizes,detail?2400:1600);
}
const conveyors=new WeakMap<HTMLElement,PhotoConveyor|PhotoMasonry>();
function photoGrid(photos:Photo[],element:HTMLElement,bounded=false){
 visiblePhotos=photos;
 let conveyor=conveyors.get(element);
 if(!conveyor){conveyor=new PhotoMasonry(element);conveyors.set(element,conveyor);element.addEventListener('click',event=>{const link=(event.target as Element).closest<HTMLAnchorElement>('[data-photo-index]');if(link){event.preventDefault();openViewer(Number(link.dataset.photoIndex),visiblePhotos,true)}})}
 const frames=photos.map((photo,index)=>({id:photo.id,width:photo.width,height:photo.height,markup:flipMarkup(photo,index,image(photo,index<2,false,true))}));
 if(conveyor instanceof PhotoMasonry)conveyor.render(frames,bounded);else conveyor.render(frames);
}
document.addEventListener('photo-atlas:open-photo',((event:CustomEvent<{photos:Photo[],index:number,pure?:boolean}>)=>{openViewer(event.detail.index,event.detail.photos,event.detail.pure===true)}) as EventListener);
function exifMarkup(photo:Photo){const labels:Record<string,string>={camera:'相机',lens:'镜头',date:'拍摄时间',iso:'ISO',fnumber:'光圈',exposure:'快门',focal_length:'焦距'};const entries=Object.entries(photo.exif||{}).filter(([key])=>labels[key]);return '<p class="photo-location">'+escaped(photo.geo?.label||'')+(photo.geo?.status==='approximate'?' · 地点推测':'')+(photo.captured?.value?' · '+escaped(photo.captured.value):'')+'</p><dl class="photo-exif">'+entries.map(([key,value])=>'<div><dt>'+labels[key]+'</dt><dd>'+escaped(value)+'</dd></div>').join('')+'</dl>'}
const viewer=document.getElementById('photo-viewer') as HTMLDialogElement;
const viewerLoader=viewerImage(document.getElementById('viewer-image') as HTMLImageElement,document.getElementById('viewer-status')!,document.getElementById('viewer-retry') as HTMLButtonElement);
function openViewer(index:number,photos=visiblePhotos,pure=false){if(!photos.length)return;viewerPure=pure;viewer.classList.toggle('is-image-only',pure);viewer.querySelector('aside')!.hidden=pure;if(pure){viewer.removeAttribute('aria-labelledby');viewer.setAttribute('aria-label','照片大图')}else{viewer.setAttribute('aria-labelledby','viewer-title');viewer.removeAttribute('aria-label')}viewerPhotos=photos;currentIndex=(index+photos.length)%photos.length;const photo=photos[currentIndex];viewerLoader.show(photo);viewerLoader.prime([photos[(currentIndex+1)%photos.length],photos[(currentIndex+photos.length-1)%photos.length]]);const camera=document.getElementById('viewer-camera')!;camera.innerHTML=photoFacts(photo);camera.hidden=!pure||!Object.values(photo.exif||{}).some(Boolean);document.documentElement.classList.add('viewer-open');for(const id of ['viewer-prev','viewer-next'])(document.getElementById(id) as HTMLButtonElement).disabled=photos.length<2;document.getElementById('viewer-title')!.textContent=photo.title;document.getElementById('viewer-caption')!.textContent=photo.caption;document.getElementById('viewer-exif')!.innerHTML=exifMarkup(photo)+(photo.full?'<p><a class="button subtle" href="'+escaped(photo.full)+'" target="_blank" rel="noopener">查看高清带水印预览 JPEG ↗</a></p>':'')+(photo.download?'<p><a class="button primary" href="'+escaped(photo.download)+'">下载原尺寸 JPEG（带水印） ↓</a></p>':'');(document.getElementById('viewer-link') as HTMLAnchorElement).href='/photos/'+photo.slug;if(!viewer.open)viewer.showModal();document.dispatchEvent(new Event('photo-atlas:viewer'))}
viewer?.addEventListener('close',()=>{viewerLoader.cancel();document.documentElement.classList.remove('viewer-open');document.dispatchEvent(new Event('photo-atlas:viewer'))});
viewer?.querySelector('.viewer-close')?.addEventListener('click',()=>viewer.close());
document.getElementById('viewer-prev')?.addEventListener('click',()=>openViewer(currentIndex-1,viewerPhotos,viewerPure));
document.getElementById('viewer-next')?.addEventListener('click',()=>openViewer(currentIndex+1,viewerPhotos,viewerPure));
viewer?.addEventListener('click',event=>{if(event.target===viewer)viewer.close()});
document.addEventListener('keydown',event=>{if(!viewer?.open)return;const step=viewerKeyStep(event);if(!step)return;event.preventDefault();if(viewerPhotos.length>1)openViewer(currentIndex+step,viewerPhotos,viewerPure)});
const albumSlot='(max-width:700px) calc(100vw - 40px), (max-width:1512px) calc(45vw - 20px), 656px';
function albumCards(albums:Album[]){return albums.map((album,index)=>{
 const facts=albumFacts(album);
 return '<a class="album-card" href="/albums/'+escaped(album.slug)+'">'+(album.cover?image(album.cover,index<2,false,false,albumSlot):'')+'<div class="album-copy"><div class="album-title"><h2>'+escaped(album.title)+'</h2><span aria-hidden="true">↗</span></div>'+(facts.places?'<p class="album-locations">'+escaped(facts.places)+'</p>':'')+'<p class="album-facts">'+(facts.year?'<span>'+facts.year+'</span>':'')+'<span>'+(album.count?album.count+' 张作品':'暂无公开作品')+'</span></p>'+(facts.description?'<p class="album-description">'+escaped(facts.description)+'</p>':'')+'</div></a>';
 }).join('')}
function representative(albums:Album[]):Album|undefined {return albums.find(album=>album.kind==='travel'&&album.cover)||albums.find(album=>album.cover)}
function emptyJournal(albums:Album[]):string {
 const album=representative(albums);
 const work=album?.cover?'<a class="journal-empty-work" href="/albums/'+escaped(album.slug)+'"><figure>'+image(album.cover,true,false,false,albumSlot)+'<figcaption>'+escaped(album.title)+'<span>'+album.count+' 张作品 · 浏览相册 →</span></figcaption></figure></a>':'';
 return '<section class="journal-empty" aria-labelledby="journal-empty-title"><div class="journal-empty-copy"><h2 id="journal-empty-title">文字还在整理</h2><p>拍摄时的观察与记忆，会陆续写在这里。现在可以先从相册，看看已经留下的影像。</p><a class="button" href="/albums/">先浏览相册 →</a></div>'+work+'</section>';
}
function postCards(posts:Post[]){return posts.map(post=>'<a class="glass post-card" href="/journal/'+escaped(post.slug)+'"><h2>'+escaped(post.title)+'</h2><p>'+escaped(post.excerpt)+'</p><span class="post-meta">'+new Date(post.updated*1000).toLocaleDateString('zh-CN')+' · 阅读随笔 →</span></a>').join('')}
async function start(){
 try{
  const segment=decodeURIComponent(location.pathname.split('/').filter(Boolean)[1]||'');
  const detailPath=segment&&['photos','albums','journal'].includes(page)?'/public/'+(page==='journal'?'posts':page)+'/'+encodeURIComponent(segment)+(page==='albums'?'?limit=36':''):'';
  const [catalog,detail]=await Promise.all([api<Catalog>(page==='home'?'/public/home':'/public/site'),detailPath?api<any>(detailPath):Promise.resolve(null)]);const settings=catalog.settings;
  const brand=document.querySelector('.brand');if(brand?.firstChild)brand.firstChild.textContent=settings.site_name;document.title=settings.site_name;
  const subtitle=settings.subtitle==='摄影作品与旅行记录'?'摄影与旅行记录':settings.subtitle;
  document.querySelector('[data-site-title]')?.replaceChildren(document.createTextNode(subtitle));
  document.querySelector('[data-site-description]')?.replaceChildren(document.createTextNode(settings.description));
  document.querySelector('[data-copyright]')?.replaceChildren(document.createTextNode(settings.copyright));
  if(page==='home'){
   const grid=document.getElementById('photo-grid')!;
   const cover=document.getElementById('featured-cover');
   if(cover)circularFeatured(cover,catalog.photos,index=>openViewer(index,catalog.photos));
   const initial=collectionFilter(new URLSearchParams(location.search));
   const search=document.getElementById('photo-search') as HTMLInputElement;search.value=initial.query;
   const more=document.getElementById('collection-load-status')!;
   let autoLoad:ReturnType<typeof collectionAutoLoad>|undefined,restoring=true;
   const result=document.getElementById('collection-results')!;
   let state:CollectionState={...initial,photos:[],total:0,loading:true,error:''},timer:ReturnType<typeof setTimeout>;
   let drawn:Photo[]|undefined,initialAnchorHandled=false;
   const collection=homeCollection(catalog.photos,async(filter,offset)=>{
    try{return await api<Catalog>('/public/catalog?limit=36&offset='+offset+'&search='+encodeURIComponent(filter.query)+'&category='+encodeURIComponent(filter.category))}
    catch(error){throw new Error(errorText(error))}
   },next=>{
    state=next;publicNavigation.rememberCount(state.photos.length);
    const filtered=Boolean(state.category||state.query),dailyView=state.mode==='daily';
    const edition=document.getElementById('edition-date')!;edition.hidden=!dailyView;edition.textContent=catalog.daily_date||new Date().toLocaleDateString('zh-CN');
    const description=document.getElementById('collection-description')!;
    description.textContent=state.query?'搜索“'+state.query+'”'+(state.category?' · '+state.category:''):(state.category?state.category+'作品':'');description.hidden=!filtered;
    const status=document.getElementById('collection-status')!;
    status.textContent=state.loading?(state.photos.length?'正在加载更多作品…':'正在加载全部作品…'):state.error?'作品暂未加载完成':dailyView?state.total+' 张作品':state.total?'已显示 '+state.photos.length+' / '+state.total+' 张作品':'0 张作品';
    result.setAttribute('aria-busy',String(state.loading));
    grid.hidden=!state.photos.length;
    if(drawn!==state.photos){photoGrid(state.photos,grid,dailyView||state.total<=12);drawn=state.photos;}
    more.hidden=dailyView||!state.photos.length||Boolean(state.error);
    const bridge=document.getElementById('collection-bridge')!;bridge.hidden=more.hidden;bridge.dataset.complete=String(state.photos.length>=state.total);
    document.getElementById('bridge-count')!.textContent=String(state.photos.length).padStart(3,'0')+' / '+state.total;
    more.textContent=state.loading?'正在加载更多作品…':state.photos.length>=state.total?'已显示全部 '+state.total+' 张作品':'';
    more.classList.toggle('is-loading',state.loading);autoLoad?.check();
    const empty=document.getElementById('collection-empty')!;empty.hidden=state.loading||Boolean(state.error)||state.photos.length>0;
    document.getElementById('collection-empty-message')!.textContent=dailyView?'今天的精选中没有符合条件的作品，可以到全部作品中继续查找。':'没有符合条件的作品，可以调整题材或关键词。';
    document.getElementById('collection-empty-all')!.hidden=!dailyView;
    document.getElementById('collection-reset')!.hidden=!filtered;
    document.getElementById('collection-error')!.hidden=!state.error;document.getElementById('collection-error-message')!.textContent=state.error;
    document.querySelectorAll<HTMLButtonElement>('[data-collection-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.collectionMode===state.mode)));
    document.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(button=>{const active=button.dataset.category===state.category;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))});
    const journey=document.getElementById('home-journey')!;journey.dataset.filtered=String(!dailyView||filtered);journey.hidden=!dailyView||filtered||journey.dataset.ready!=='true';
    document.getElementById('photo-search-panel')?.classList.toggle('has-query',Boolean(state.query));
    const url=new URL(location.href);
    for(const [key,value] of Object.entries({view:dailyView?'':'all',category:state.category,q:state.query})){if(value)url.searchParams.set(key,value);else url.searchParams.delete(key)}
    history.replaceState(history.state,'',url.pathname+url.search+url.hash);
    if(!state.loading&&!state.error&&!initialAnchorHandled){initialAnchorHandled=true;if(!publicNavigation.returning&&location.hash==='#collection')requestAnimationFrame(()=>document.getElementById('collection')!.scrollIntoView({block:'start',behavior:'auto'}))}
   },initial);
   const clearTimer=()=>clearTimeout(timer);
   document.querySelectorAll<HTMLButtonElement>('[data-collection-mode]').forEach(button=>button.onclick=()=>{clearTimer();void collection.select({mode:button.dataset.collectionMode==='all'?'all':'daily',query:search.value.trim()})});
   document.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(button=>button.onclick=()=>{clearTimer();void collection.select({category:button.dataset.category||'',query:search.value.trim()})});
   search.addEventListener('input',()=>{clearTimer();timer=setTimeout(()=>void collection.select({query:search.value.trim()}),250)});
   document.getElementById('photo-search-clear')!.onclick=()=>{clearTimer();search.value='';void collection.select({query:''})};
   document.getElementById('collection-reset')!.onclick=()=>{clearTimer();search.value='';void collection.select({category:'',query:''})};
   document.getElementById('collection-empty-all')!.onclick=()=>{clearTimer();void collection.select({mode:'all'})};
   document.getElementById('collection-retry')!.onclick=()=>void collection.retry();
   autoLoad=collectionAutoLoad(more,()=>!restoring&&state.mode==='all'&&!state.loading&&!state.error&&state.photos.length>0&&state.photos.length<state.total,()=>collection.more());
   void collection.start(publicNavigation.count).then(()=>{restoring=false;publicNavigation.restore();autoLoad?.check()});
   const tools=Array.from(document.querySelectorAll<HTMLDetailsElement>('.collection-tool'));
   tools.forEach(tool=>tool.addEventListener('toggle',()=>{if(tool.open){tools.forEach(other=>{if(other!==tool)other.open=false});if(tool.id==='photo-search-panel')document.getElementById('photo-search')?.focus()}}));
   document.addEventListener('click',event=>{tools.forEach(tool=>{if(!tool.contains(event.target as Node))tool.open=false})});
   document.addEventListener('keydown',event=>{if(event.key==='Escape')tools.forEach(tool=>{if(tool.open){tool.open=false;tool.querySelector('summary')?.focus()}})});
   void homeJourney(catalog,openViewer);
   if(catalog.posts?.length){document.getElementById('latest-journal')!.hidden=false;document.getElementById('journal-preview-list')!.innerHTML=postCards(catalog.posts.slice(0,3))}
  }
  if(page==='albums'){
   const container=document.getElementById('album-content')!;
   if(segment){
    document.getElementById('album-types')!.hidden=true;document.getElementById('album-back')!.hidden=false;
    const data=detail as {album:Album,photos:Photo[],total:number};
    document.querySelector('.page-heading h1')!.textContent=data.album.title;
    const facts=albumFacts({...catalog.albums.find(album=>album.id===data.album.id),...data.album});
    const description=document.querySelector<HTMLElement>('.collection-page-heading>div>p')!;
    description.textContent=facts.description||facts.places;description.hidden=!description.textContent;
    document.getElementById('album-summary')!.textContent=[facts.year,data.total+' 张作品'].filter(Boolean).join(' · ');
    container.className='photo-grid';let current=[...data.photos];
    while(current.length<Math.min(publicNavigation.count,data.total)){
     try{const next=await api<{photos:Photo[]}>('/public/albums/'+encodeURIComponent(segment)+'?limit=36&offset='+current.length);if(!next.photos.length)break;current.push(...next.photos)}catch(error){notice(errorText(error),true);break}
    }
    publicNavigation.rememberCount(current.length);
    if(current.length)photoGrid(current,container,data.total<=12);else container.innerHTML='<p class="collection-empty">这本相册暂时没有公开作品。</p>';document.title=data.album.title+' · '+settings.site_name;
    const more=document.createElement('button');more.className='button subtle load-more';more.textContent='更多作品';more.hidden=current.length>=data.total;container.after(more);
    more.onclick=async()=>{more.disabled=true;try{const next=await api<{photos:Photo[],total:number}>('/public/albums/'+encodeURIComponent(segment)+'?limit=36&offset='+current.length);current.push(...next.photos);publicNavigation.rememberCount(current.length);photoGrid(current,container,data.total<=12);more.hidden=current.length>=next.total}catch(e){notice(errorText(e),true)}finally{more.disabled=false}};
   }else {
    const draw=(kind:string)=>{const selected=catalog.albums.filter(album=>!kind||album.kind===kind);container.innerHTML=albumCards(selected)||'<div class="collection-empty"><p>这个分类还没有公开相册。</p><a href="/albums/">浏览全部相册 →</a></div>';document.getElementById('album-summary')!.textContent=selected.length+' 本相册';};
    const requestedKind=new URLSearchParams(location.search).get('kind')||'';
    const setKind=(kind:string)=>{document.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(button=>{const active=button.dataset.kind===kind;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))});draw(kind);const url=new URL(location.href);if(kind)url.searchParams.set('kind',kind);else url.searchParams.delete('kind');history.replaceState(history.state,'',url.pathname+url.search+url.hash)};
    setKind(['travel','project','series'].includes(requestedKind)?requestedKind:'');document.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(button=>button.onclick=()=>setKind(button.dataset.kind||''));
    document.title='相册 · '+settings.site_name;
   }
  }
  if(page==='photos'){
   const photo=detail as Photo;visiblePhotos=[photo];
   document.getElementById('photo-page')!.innerHTML='<p class="breadcrumb"><a href="/">作品</a> / '+escaped(photo.title)+'</p><article class="photo-detail glass"><button class="image-full" style="border:0;background:none;padding:0;cursor:zoom-in" aria-label="查看作品大图">'+image(photo,true,true)+'</button><aside><h1 class="public-title">'+escaped(photo.title)+'</h1><p>'+escaped(photo.caption)+'</p>'+exifMarkup(photo)+(photo.download?'<p><a class="button primary" href="'+escaped(photo.download)+'">下载原尺寸 JPEG（带水印） ↓</a></p>':'')+'<p>'+photo.width+' × '+photo.height+'</p></aside></article>';
   document.querySelector('.image-full')?.addEventListener('click',()=>openViewer(0));document.title=photo.title+' · '+settings.site_name;
  }
  if(page==='journal'){
   const container=document.getElementById('journal-content')!;
   if(segment){const post=detail as Post;document.querySelector('.page-heading')!.setAttribute('hidden','');container.className='journal-article';container.innerHTML='<a class="collection-back" href="/journal/">← 全部随笔</a><article><h1 class="public-title">'+escaped(post.title)+'</h1><time datetime="'+new Date(post.updated*1000).toISOString()+'">'+new Date(post.updated*1000).toLocaleDateString('zh-CN')+'</time><div class="prose">'+post.html+'</div></article>';document.title=post.title+' · '+settings.site_name}
   else {container.innerHTML=postCards(catalog.posts)||emptyJournal(catalog.albums);document.title='随笔 · '+settings.site_name;}
  }
  if(page==='about'){
   document.getElementById('about-text')!.textContent=settings.about;
   const contact=settings.contact.trim(),destination=contactDestination(contact);
   document.getElementById('about-contact')!.hidden=!contact;
   const target=document.getElementById('contact-text')!;
   if(destination){const link=document.createElement('a');link.href=destination;link.textContent=contact;target.replaceChildren(link)}else target.textContent=contact;
   const album=representative(catalog.albums),photo=album?.cover;
   if(photo){const figure=document.getElementById('about-work')!;figure.hidden=false;figure.innerHTML='<a href="/photos/'+escaped(photo.slug)+'" aria-label="查看代表作品：'+escaped(photo.title)+'">'+image(photo,true,false,false,'(max-width:700px) calc(100vw - 80px), (max-width:1512px) calc(49.5vw - 58px), 691px')+'</a><figcaption>'+escaped([photo.title,photo.geo?.label].filter(Boolean).join(' · '))+'</figcaption>';}
   document.title='关于 · '+settings.site_name;
  }
  if(page!=='home'&&page!=='footprints')publicNavigation.restore();
 }catch(error){notice(errorText(error),true);const target=document.querySelector<HTMLElement>('.empty,.collection-loading,#about-text')||document.getElementById('photo-grid');if(target){target.replaceChildren();const message=document.createElement('span');message.textContent='内容暂时未能加载，请重试。';target.classList.add('public-load-error');const retry=document.createElement('button');retry.className='button subtle';retry.textContent='重新加载';retry.onclick=()=>location.reload();target.append(message,retry)}}
}
start();
