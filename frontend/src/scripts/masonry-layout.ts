import {photoWall} from '../../../miniprogram/utils/photo-wall.js';
export interface MasonrySize { width:number; height:number }
export interface MasonryBox { x:number; y:number; width:number; height:number }
// Conventional column packing, without third-party renderer or animation code.
export function masonryLayout(items:MasonrySize[],width:number){
 const gap=width<600?10:12;
 const columns=Math.max(1,Math.min(3,Math.floor((width+gap)/372)));
 const columnWidth=Math.max(1,(width-(columns-1)*gap)/columns);
 const lanes=Array.from({length:columns},(_,index)=>({index,bottom:0}));
 const boxes:MasonryBox[]=[];
 for(const item of items){
  const lane=lanes.reduce((best,current)=>current.bottom<best.bottom?current:best);
  const height=columnWidth*(item.width>0&&item.height>0?item.height/item.width:1);
  boxes.push({x:lane.index*(columnWidth+gap),y:lane.bottom,width:columnWidth,height});
  lane.bottom+=height+gap;
 }
 return {boxes,height:items.length?Math.max(...lanes.map(lane=>lane.bottom))-gap:0,columns,gap};
}

/** A closed, irregular mosaic for small sets, using the original photo-wall solver. */
export function boundedLayout(items:MasonrySize[],width:number){
 const gap=width<600?10:12;
 const wall=photoWall(items,width,gap,0,614,{targetFraction:width<720?1:.43,minWidth:Math.min(width,320),minHeight:Math.min(width*.55,190)});
 return {boxes:wall.items.map(({x,y,width,height})=>({x,y,width,height})),height:wall.height,gap};
}

/** Extend open card backs without overlapping the photographs below them. */
export function expandCardBacks(boxes:MasonryBox[],needs:number[]){
 const expansions=boxes.map((box,index)=>({index,extra:Math.max(0,(needs[index]||0)-box.height)})).filter(item=>item.extra>0).sort((a,b)=>boxes[a.index].y-boxes[b.index].y);
 for(const {index,extra} of expansions){
  const top=boxes[index].y;
  boxes.forEach((box,i)=>{if(i!==index&&box.y>top+.5)box.y+=extra});
  boxes[index].height+=extra;
 }
 return Math.max(0,...boxes.map(box=>box.y+box.height));
}
