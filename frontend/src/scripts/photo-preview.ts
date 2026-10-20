import type {Photo} from './api';

/** Browsing previews have their own low-byte assets; full-screen images keep their originals. */
export function browsingImage(photo:Photo,maxEdge=768):{src:string;srcset:string}{
  const preview=photo.thumbnail||photo;
  const candidates=preview.srcset.split(',').map(item=>item.trim()).map(item=>{
    const match=item.match(/^(\S+)\s+(\d+)w$/);
    return match?{url:match[1],width:Number(match[2])}:null;
  }).filter((item):item is {url:string;width:number}=>item!==null).sort((a,b)=>a.width-b.width);
  if(!candidates.length)return {src:preview.src,srcset:preview.srcset};
  const widthBudget=photo.width>0&&photo.height>0?Math.max(1,Math.round(maxEdge*photo.width/Math.max(photo.width,photo.height))):maxEdge;
  const chosen=candidates.filter(item=>item.width<=widthBudget);
  if(!chosen.length)chosen.push(candidates[0]);
  return {src:chosen.find(item=>item.width>=320)?.url||chosen.at(-1)!.url,srcset:chosen.map(item=>`${item.url} ${item.width}w`).join(', ')};
}

/** Legacy filenames describe the long edge; label their actual widths for retina selection. */
export function clearPreview(photo:Photo,maxEdge=1600):{src:string;srcset:string}{
 const widths=new Map<number,string>();
 for(const item of photo.srcset.split(',')){
  const match=item.trim().match(/^(\S+\/(\d+)\.webp)\s+\d+w$/);if(!match||Number(match[2])>maxEdge)continue;
  const target=Number(match[2]),width=Math.max(1,Math.round(photo.width*Math.min(1,target/Math.max(photo.width,photo.height))));
  if(!widths.has(width))widths.set(width,match[1]);
 }
 const choices=[...widths.entries()].sort((a,b)=>a[0]-b[0]);
 return {src:choices.at(-1)?.[1]||photo.src,srcset:choices.map(([width,url])=>url+' '+width+'w').join(', ')};
}


export function progressiveSources(photo:Photo,maxEdge=1600){
 const clear=clearPreview(photo,maxEdge);
 return {previewSrc:clear.src,previewSrcset:clear.srcset,previewSmall:browsingImage(photo,160).src,previewLite:browsingImage(photo,320).src,previewFallback:'/media/'+photo.id+'/480.webp',previewClearFallback:'/media/'+photo.id+'/thumb-v1-'+(maxEdge<=480?320:maxEdge<=960?768:1280)+'.webp'};
}
