const {photoWall}=require('./photo-wall');
// Match the web's closed daily mosaic and shortest-column all-works layout.
function homeGallery(photos,mode,width=686,gap=20,flip=false,expanded={}){
 if(flip){let y=0;const items=photos.map((photo,index)=>{const height=width*(photo.width>0&&photo.height>0?photo.height/photo.width:1);const item={index,x:0,y,width,height};y+=height+gap;return item;});return {items,height:items.length?y-gap:0};}
 if(mode==='bounded')return photoWall(photos,width,gap,0,614);
 const heights=[0,0],size=(width-gap)/2;
 const items=photos.map((photo,index)=>{
  const column=heights[0]<=heights[1]?0:1;
  const ratio=photo.width>0&&photo.height>0?photo.height/photo.width:1;
  const item={index,x:column*(size+gap),y:heights[column],width:size,height:size*ratio};
  heights[column]=item.y+item.height+gap;return item;
 });
 return {items,height:items.length?Math.max(...heights)-gap:0};
}
module.exports={homeGallery};
