// Random slicing mosaics keep all four outer edges closed. Every leaf reserves
// its photograph's natural aspect ratio plus caption space; no crop or overlap.
function photoWall(photos,width,gap=20,caption=100,seed=1,options={}){
 if(!photos.length||!Number.isFinite(width)||width<=0)return {height:0,items:[]};
 let state=seed>>>0;
 const random=()=>{state=(state+0x6D2B79F5)>>>0;let n=state;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return((n^(n>>>14))>>>0)/4294967296;};
 const ratio=p=>Number.isFinite(p.width)&&Number.isFinite(p.height)&&p.width>0&&p.height>0?p.height/p.width:1;
 const leaf=index=>({index,a:ratio(photos[index]),b:caption});
 const join=(left,right,horizontal)=>{
  const sum=left.a+right.a;
  return {left,right,horizontal,a:horizontal?left.a*right.a/sum:sum,b:horizontal?(right.a*left.b+left.a*right.b-left.a*right.a*gap)/sum:left.b+right.b+gap};
 };
 const make=(indices,aspect)=>{
  if(indices.length===1)return leaf(indices[0]);
  const split=Math.max(1,Math.min(indices.length-1,Math.floor(indices.length*(.25+random()*.5))));
  const horizontal=random()<aspect/(aspect+.75),fraction=split/indices.length;
  return join(make(indices.slice(0,split),horizontal?aspect*fraction:aspect/fraction),make(indices.slice(split),horizontal?aspect*(1-fraction):aspect/(1-fraction)),horizontal);
 };
 const place=(node,w,x,y,items)=>{
  if(!node.left){items.push({index:node.index,x,y,width:w,height:w*node.a});return;}
  const h=node.a*w+node.b;
  if(node.horizontal){const first=(h-node.left.b)/node.left.a;place(node.left,first,x,y,items);place(node.right,w-gap-first,x+first+gap,y,items);}
  else{place(node.left,w,x,y,items);place(node.right,w,x,y+node.left.a*w+node.left.b+gap,items);}
 };
 const items=[];let y=0;
 // Complete groups never move when another page is appended. Only an unfinished
 // final group may be repacked, which is necessary to close its new outer edge.
 for(let start=0;start<photos.length;start+=12){
  const indices=Array.from({length:Math.min(12,photos.length-start)},(_,i)=>start+i);
  for(let i=indices.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[indices[i],indices[j]]=[indices[j],indices[i]];}
  const target=width*(options.targetFraction||(width>=900?.30:.44));
  const idealHeight=indices.reduce((s,i)=>s+target*(target*ratio(photos[i])+caption),0)/width;
  let best,bestScore=Infinity;
  for(let trial=0;trial<192;trial++){
   const tree=make(indices,width/Math.max(1,idealHeight)),placed=[];
   place(tree,width,0,0,placed);
   if(placed.some(p=>p.width<=(options.minWidth||0)-.001||p.height<=(options.minHeight||0)-.001||p.width<=0||p.height<=0))continue;
   const logs=placed.map(p=>Math.log(p.width/target)),mean=logs.reduce((s,n)=>s+n,0)/logs.length;
   const spread=Math.sqrt(logs.reduce((s,n)=>s+(n-mean)**2,0)/logs.length);
   const score=placed.reduce((s,p)=>s+Math.log(p.width/target)**2+(p.width<width*(width>=900?.15:.26)?5:0),0)/placed.length+Math.max(0,.22-spread)*2+random()*.025;
   if(score<bestScore){bestScore=score;best={tree,placed};}
  }
  // A vertical strip is always feasible, including a single extreme panorama.
  if(!best){const tree=indices.map(leaf).reduce((a,b)=>join(a,b,false)),placed=[];place(tree,width,0,0,placed);best={tree,placed};}
  for(const item of best.placed)items.push({...item,y:item.y+y});
  y+=best.tree.a*width+best.tree.b+gap;
 }
 return {items:items.sort((a,b)=>a.index-b.index),height:y-gap};
}
module.exports={photoWall};
