import type {Photo} from './api';

export type CollectionMode='daily'|'all';
export interface CollectionFilter {mode:CollectionMode;category:string;query:string}
export interface CollectionState extends CollectionFilter {photos:Photo[];total:number;loading:boolean;error:string}
export interface CollectionPage {photos:Photo[];total:number}
export type CollectionFetch=(filter:CollectionFilter,offset:number)=>Promise<CollectionPage>;

export function dailySelection(photos:Photo[],filter:CollectionFilter):Photo[]{
 const query=filter.query.trim().toLocaleLowerCase();
 return photos.filter(photo=>(!filter.category||photo.category===filter.category)&&(!query||[photo.title,photo.geo?.label,photo.captured?.value,...photo.tags].some(value=>String(value||'').toLocaleLowerCase().includes(query))));
}
export function collectionFilter(params:URLSearchParams):CollectionFilter {
 const category=params.get('category')||'';
 return {mode:params.get('view')==='all'?'all':'daily',category:['人像','自然','城市','星空'].includes(category)?category:'',query:(params.get('q')||'').trim().slice(0,240)};
}

/** Each request belongs to one selection, so late pages cannot replace a newer view. */
export function homeCollection(daily:Photo[],fetchPage:CollectionFetch,onChange:(state:CollectionState)=>void,initial:CollectionFilter){
 let state:CollectionState={...initial,photos:[],total:0,loading:false,error:''};
 let generation=0,failedAppend=false;
 const emit=()=>onChange({...state});
 async function load(append=false):Promise<void>{
  const token=++generation;
  failedAppend=append;
  if(state.mode==='daily'){
   const photos=dailySelection(daily,state);
   state={...state,photos,total:photos.length,loading:false,error:''};emit();return;
  }
  state={...state,photos:append?state.photos:[],total:append?state.total:0,loading:true,error:''};emit();
  const selected:CollectionFilter={mode:state.mode,category:state.category,query:state.query};
  try{
   const page=await fetchPage(selected,append?state.photos.length:0);
   if(token!==generation)return;
   if(append&&!page.photos.length&&state.photos.length<page.total)throw new Error('未能取得更多作品，请重试。');
   state={...state,photos:append?[...state.photos,...page.photos]:page.photos,total:page.total,loading:false,error:''};emit();
  }catch(error){
   if(token!==generation)return;
   state={...state,loading:false,error:error instanceof Error?error.message:'作品暂时未能加载，请重试。'};emit();
  }
 }
 return {
  async start(restoreCount=0){
   const selection=generation+1;
   await load();
   // Restore only this selection; a user changing scope cancels the remaining pages.
   let expected=selection;
   while(generation===expected&&state.mode==='all'&&!state.error&&state.photos.length<Math.min(restoreCount,state.total)){
    expected++;await load(true);
   }
  },
  select(patch:Partial<CollectionFilter>){state={...state,...patch};return load()},
  more(){if(state.loading||state.mode==='daily'||state.photos.length>=state.total)return Promise.resolve();return load(true)},
  retry:()=>load(failedAppend),
 };
}
