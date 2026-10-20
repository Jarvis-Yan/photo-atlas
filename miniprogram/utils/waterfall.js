// Greedy packing keeps mixed orientations balanced and preserves positions on append.
function columns(photos) {
  const result=[{key:'left',photos:[],height:0,direction:'normal'},{key:'right',photos:[],height:0,direction:'reverse'}];
  for(const photo of photos||[]) {
    const column=result[0].height<=result[1].height?result[0]:result[1];
    const ratio=photo.width>0&&photo.height>0?photo.height/photo.width:1.25;
    const cardHeight=Math.round(333*ratio);
    column.photos.push(Object.assign({},photo,{cardHeight}));
    column.height+=cardHeight+128;
  }
  return result.map(c=>Object.assign(c,{duration:Math.max(45,Math.round(c.height/18))}));
}
module.exports={columns};
