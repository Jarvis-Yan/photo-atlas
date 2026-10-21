// Reuse only decoded tiny previews. Never cache full-size image downloads here.
function createPreviewCache(read,limit=24){
 const ready=new Map(),pending=new Set();let waiting=[];
 function remember(id,path){if(!id||!path)return;ready.delete(id);ready.set(id,path);while(ready.size>limit)ready.delete(ready.keys().next().value);}
 function pump(){while(pending.size<2&&waiting.length){const photo=waiting.shift();if(ready.has(photo.id)||pending.has(photo.id))continue;pending.add(photo.id);read({src:photo.mapThumbnail||photo.thumbnail||photo.src,success:info=>remember(photo.id,info.path),complete:()=>{pending.delete(photo.id);pump();}});}}
 return {remember,peek:id=>ready.get(id),forget:id=>ready.delete(id),prime(photos){waiting=[...new Map(photos.filter(p=>p&&p.id&&(p.mapThumbnail||p.thumbnail||p.src)).map(p=>[p.id,p])).values()];pump();}};
}
const previewCache=createPreviewCache(options=>wx.getImageInfo(options));
module.exports={createPreviewCache,previewCache};
