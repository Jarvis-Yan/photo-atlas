import {installGlassButtons} from './glass-button';
import {installPhotoFlip,preparePhotoFlip} from './photo-flip';
import {masonryLayout,boundedLayout,type MasonryBox} from './masonry-layout';
interface Frame {id:string;width:number;height:number;markup:string}
interface Tile {frame:Frame;node:HTMLElement;box:MasonryBox}
interface Drag {tile:Tile;pointer:number;startX:number;startY:number;offsetX:number;offsetY:number;active:boolean;x:number;y:number}
export class PhotoMasonry {
 private tiles=new Map<string,Tile>();
 private order:string[]=[];
 private original:string[]=[];
 private observer:IntersectionObserver;
 private drag?:Drag;
 private suppressUntil=0;
 private scheduled=0;
 private bounded=false;
 private measuredWidth=0;
 private reset?:HTMLButtonElement;
 private reduced=matchMedia('(prefers-reduced-motion:reduce)');
 constructor(private root:HTMLElement){
  root.querySelectorAll('.collection-loading').forEach(node=>node.remove());root.classList.add('masonry');installPhotoFlip(root);installGlassButtons(root);
  this.observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
   if(entry.isIntersecting){entry.target.classList.add('is-revealed');this.observer.unobserve(entry.target)}
  }),{rootMargin:'160px 0px'});
  new ResizeObserver(()=>{if(Math.abs(root.clientWidth-this.measuredWidth)>.5)this.schedule()}).observe(root);
  root.addEventListener('dragstart',event=>event.preventDefault());
  root.addEventListener('click',event=>{if(performance.now()<this.suppressUntil){event.preventDefault();event.stopImmediatePropagation()}},true);
  root.addEventListener('pointerdown',event=>this.startDrag(event));
  window.addEventListener('pointermove',event=>this.moveDrag(event),{passive:false});
  window.addEventListener('pointerup',()=>this.finishDrag());
  window.addEventListener('pointercancel',()=>this.finishDrag());
  window.addEventListener('blur',()=>this.finishDrag());
  document.addEventListener('keydown',event=>{if(event.key==='Escape')this.finishDrag()});
  const controls=document.getElementById('gallery-controls');
  if(controls){
   controls.innerHTML='<p class="masonry-help">点击照片查看信息 · 从信息面板打开大图</p>';
   this.reset=controls.querySelector('button')!;
   if(this.reset)this.reset.onclick=()=>{this.finishDrag();this.order=[...this.original];this.syncOrder();this.layout()};
  }
 }
 render(frames:Frame[],bounded=false){
  this.finishDrag();this.bounded=bounded;this.root.dataset.layout=bounded?'bounded':'masonry';
  const next=frames.map(frame=>frame.id);
  // Keep downloaded images and custom order when loading the next page.
  const append=this.original.length>0&&this.original.every((id,index)=>next[index]===id);
  this.order=append?[...this.order,...next.slice(this.original.length)]:next;
  this.original=[...next];
  const retained=new Set(next);
  for(const [id,tile] of this.tiles){if(!retained.has(id)){this.observer.unobserve(tile.node);tile.node.remove();this.tiles.delete(id)}}
  frames.forEach((frame,index)=>{
   let tile=this.tiles.get(frame.id);
   if(!tile){
    const node=document.createElement('div');node.className='masonry-tile';node.dataset.masonryId=frame.id;
    node.innerHTML='<div class="masonry-reveal">'+frame.markup+'</div>';preparePhotoFlip(node);
    tile={frame,node,box:{x:0,y:0,width:0,height:0}};this.tiles.set(frame.id,tile);
    node.style.setProperty('--reveal-delay',Math.min(index%6,3)*45+'ms');
    this.root.append(node);this.observer.observe(node);
   }
   tile.frame=frame;
   tile.node.querySelector<HTMLElement>('[data-photo-index]')!.dataset.photoIndex=String(index);
  });
  this.syncOrder();this.layout();
 }
 private syncOrder(){
  // Match keyboard traversal to the new visual reading order, without replacing images.
  this.order.forEach((id,index)=>{const node=this.tiles.get(id)!.node;if(this.root.children[index]!==node)this.root.insertBefore(node,this.root.children[index]||null)});
  if(this.reset)this.reset.disabled=this.order.every((id,index)=>id===this.original[index]);
 }
 private schedule(){if(!this.scheduled)this.scheduled=requestAnimationFrame(()=>{this.scheduled=0;this.layout()})}
 private layout(){
  const width=this.root.clientWidth;if(!width)return;
  this.measuredWidth=width;
  const {boxes,height:baseHeight}=(this.bounded?boundedLayout:masonryLayout)(this.order.map(id=>this.tiles.get(id)!.frame),width);
  const height=baseHeight;
  this.root.style.height=height+'px';
  this.order.forEach((id,index)=>{
   const tile=this.tiles.get(id)!,box=boxes[index];tile.box=box;
   tile.node.style.width=box.width+'px';tile.node.style.height=box.height+'px';
   tile.node.style.transform=`translate3d(${box.x}px,${box.y}px,0)`;
   tile.node.querySelectorAll<HTMLImageElement>('img').forEach(img=>{img.sizes=Math.ceil(box.width)+'px'});
   if(this.reduced.matches)tile.node.classList.add('is-revealed');
  });
  if(this.drag?.active)this.positionDrag();
  this.root.dispatchEvent(new Event('pixelcore:layout'));
 }
 private startDrag(event:PointerEvent){
  if(event.button!==0||event.pointerType==='touch'||(event.target as Element).closest('button,.photo-flip'))return;
  const node=(event.target as Element).closest<HTMLElement>('.masonry-tile');if(!node)return;
  const tile=this.tiles.get(node.dataset.masonryId!)!,rect=node.getBoundingClientRect();
  this.drag={tile,pointer:event.pointerId,startX:event.clientX,startY:event.clientY,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top,active:false,x:event.clientX,y:event.clientY};
 }
 private positionDrag(){
  const d=this.drag;if(!d)return;
  const rect=this.root.getBoundingClientRect();
  d.tile.node.style.transform=`translate3d(${d.x-rect.left-d.offsetX}px,${d.y-rect.top-d.offsetY}px,0)`;
 }
 private moveDrag(event:PointerEvent){
  const d=this.drag;if(!d||d.pointer!==event.pointerId)return;
  d.x=event.clientX;d.y=event.clientY;
  if(!d.active&&Math.hypot(d.x-d.startX,d.y-d.startY)<6)return;
  event.preventDefault();
  if(!d.active){d.active=true;d.tile.node.classList.add('is-dragging');this.root.classList.add('is-sorting');d.tile.node.setPointerCapture(event.pointerId)}
  this.positionDrag();
  if(this.bounded)return; // A mosaic is fitted as a whole; reorder it on release.
  const rect=this.root.getBoundingClientRect(),cx=d.x-rect.left-d.offsetX+d.tile.box.width/2,cy=d.y-rect.top-d.offsetY+d.tile.box.height/2;
  const others=this.order.filter(id=>id!==d.tile.frame.id),current=this.order.indexOf(d.tile.frame.id);
  // Test insertion slots against the same layout used for rendering.
  const distances=Array.from({length:others.length+1},(_,index)=>{
   const ids=[...others];ids.splice(index,0,d.tile.frame.id);
   const box=masonryLayout(ids.slice(0,index+1).map(id=>this.tiles.get(id)!.frame),this.root.clientWidth).boxes[index];
   return Math.hypot(box.x+box.width/2-cx,box.y+box.height/2-cy);
  });
  const best=distances.indexOf(Math.min(...distances));
  if(best!==current&&distances[best]<distances[current]*.8-6){others.splice(best,0,d.tile.frame.id);this.order=others;this.layout()}
 }
 private finishDrag(){
  const d=this.drag;if(!d)return;this.drag=undefined;
  if(d.active){
   if(this.bounded){
    const rect=this.root.getBoundingClientRect(),cx=d.x-rect.left-d.offsetX+d.tile.box.width/2,cy=d.y-rect.top-d.offsetY+d.tile.box.height/2;
    const distances=this.order.map(id=>{const b=this.tiles.get(id)!.box;return Math.hypot(b.x+b.width/2-cx,b.y+b.height/2-cy)});
    const target=distances.indexOf(Math.min(...distances)),current=this.order.indexOf(d.tile.frame.id);
    if(target!==current)[this.order[current],this.order[target]]=[this.order[target],this.order[current]];
   }
   this.suppressUntil=performance.now()+350;
   if(d.tile.node.hasPointerCapture(d.pointer))d.tile.node.releasePointerCapture(d.pointer);
   d.tile.node.classList.remove('is-dragging');this.root.classList.remove('is-sorting');this.syncOrder();this.layout();
  }
 }
}
