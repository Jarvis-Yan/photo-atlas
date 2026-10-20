export interface Photo {thumbnail?:{src:string;srcset:string};metadata_updated?:number;source_context?:{relative_path?:string};geo?:{label?:string;country?:string;latitude?:number;longitude?:number;precision?:string;source?:string;status?:string;conflict?:string};captured?:{value?:string;precision?:string;source?:string;status?:string};duplicate_audit?:{decision?:string};category:string;category_locked?:boolean;tags_locked?:boolean;id:string;slug:string;title:string;caption:string;alt:string;tags:string[];published:number;featured:number;position:number;processing:string;width:number;height:number;src:string;srcset:string;exif:Record<string,string>;album_ids:string[];created:number;full?:string;download?:string;duplicate_of?:string;similar_photos?:string[];similarity_reviewed?:boolean;original_name?:string;sha256?:string;size?:number;error?:string}
export interface Album {years?:number[];places?:string[];kind: 'travel'|'project'|'series';id:string;slug:string;title:string;description:string;published:number;position:number;cover_id:string|null;count:number;cover:Photo|null}
export interface Post {id:string;slug:string;title:string;excerpt:string;body?:string;html?:string;published:number;created:number;updated:number}
export interface SiteSettings {site_name:string;subtitle:string;description:string;about:string;contact:string;copyright:string}
export interface Catalog {settings:SiteSettings;photos:Photo[];albums:Album[];posts:Post[];total:number;daily_date?:string}
export interface UploadSession {id:string;filename:string;size:number;sha256:string;chunk_size:number;chunks:number;received:number[];status:string;photo_id:string|null;duplicate_of?:string}
export class ApiError extends Error {constructor(public status:number,public code:string,message:string){super(message)}}
let csrf='';
export function setCsrf(value:string){csrf=value}
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
 const publicRead=path.startsWith('/public/')&&(!options.method||options.method==='GET')&&!options.signal;
 const cacheKey='photo-atlas-public-v3:'+path+(path==='/public/home'?'|'+new Date(Date.now()+8*3600000).toISOString().slice(0,10):'');
 if(publicRead){try{const cached=JSON.parse(sessionStorage.getItem(cacheKey)||'null');if(cached&&cached.expires>Date.now())return cached.data as T}catch{}}
 const headers=new Headers(options.headers);
 if(options.body && typeof options.body==='string')headers.set('Content-Type','application/json');
 if(!['GET','HEAD'].includes(options.method||'GET')&&csrf)headers.set('X-CSRF-Token',csrf);
 const controller=new AbortController();let timedOut=false;
 const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
 if(options.signal?.aborted)controller.abort();
 const timeout=setTimeout(()=>{timedOut=true;controller.abort()},path.endsWith('/complete')?900000:options.body instanceof ArrayBuffer?120000:30000);
 try {
 const response=await fetch((import.meta.env.PUBLIC_API_BASE||'/api')+path,{...options,headers,signal:controller.signal,credentials:'same-origin'});
 let body:any=null;
 try{body=await response.json()}catch{if(response.status===204)return undefined as T;if(response.ok)throw new ApiError(0,'INCOMPLETE_RESPONSE','返回数据未读取完整，请继续或刷新重试')}
 if(!response.ok)throw new ApiError(response.status,body?.code||'HTTP_ERROR',body?.message||'操作暂时未完成，请稍后重试');
 if(publicRead){try{
  const expires=Date.now()+30000;
  sessionStorage.setItem(cacheKey,JSON.stringify({expires,data:body}));
  if(path==='/public/home')sessionStorage.setItem('photo-atlas-public-v3:/public/site',JSON.stringify({expires,data:{settings:body.settings,albums:body.albums,posts:body.posts}}));
 }catch{}}
 return body as T;
 } catch(error) {if(timedOut)throw new ApiError(0,'TIMEOUT','连接超时；已保存的部分会保留，可以继续或刷新重试');throw error}
 finally {clearTimeout(timeout);options.signal?.removeEventListener('abort',abort)}
}
export function escaped(value:unknown):string{return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))}
export function humanSize(bytes:number){return bytes>=1048576?(bytes/1048576).toFixed(1)+' MB':Math.max(1,Math.round(bytes/1024))+' KB'}
export function errorText(error:unknown){if(error instanceof ApiError)return error.message;if(error instanceof Error&&error.name==='AbortError')return '已暂停';return '连接暂时中断，请检查网络后继续'}
let timer:ReturnType<typeof setTimeout>;
export function notice(message:string,error=false){const element=document.getElementById('notice');if(!element)return;clearTimeout(timer);element.textContent=message;element.hidden=false;element.classList.toggle('error',error);timer=setTimeout(()=>{element.hidden=true},error?8000:4000)}
export function initTheme(){const stored=localStorage.getItem('photo-atlas-theme');const initial=stored|| (matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');document.documentElement.dataset.theme=initial;document.querySelectorAll('[data-theme-toggle]').forEach(button=>button.addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;localStorage.setItem('photo-atlas-theme',theme)}))}
