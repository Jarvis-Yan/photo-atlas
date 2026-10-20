/* React Bits adaptation — Copyright (c) 2026 David Haz.
 * MIT + Commons Clause; see third_party/react-bits/LICENSE.md and THIRD_PARTY_NOTICES.md.
 */
import {photoWall} from '../../../miniprogram/utils/photo-wall.js';
export interface MasonrySize { width:number; height:number }
export interface MasonryBox { x:number; y:number; width:number; height:number }
// Shortest-column placement, adapted from the supplied React Bits Masonry.
export function masonryLayout(items:MasonrySize[],width:number){
 const gap=width<600?10:12;
 const columns=Math.max(1,Math.min(3,Math.floor((width+gap)/(360+gap))));
 const size=Math.max(1,(width-gap*(columns-1))/columns);
 const heights=Array<number>(columns).fill(0);
 const boxes=items.map(item=>{
  const column=heights.indexOf(Math.min(...heights));
  const ratio=item.width>0&&item.height>0?item.height/item.width:1;
  const box={x:column*(size+gap),y:heights[column],width:size,height:size*ratio};
  heights[column]=box.y+box.height+gap;
  return box;
 });
 return {boxes,height:items.length?Math.max(...heights)-gap:0,columns,gap};
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
