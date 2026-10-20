/* React Bits adaptation — Copyright (c) 2026 David Haz.
 * MIT + Commons Clause; see third_party/react-bits/LICENSE.md and THIRD_PARTY_NOTICES.md.
 */
/** Adapted from the supplied GlassSurface: displacement map + split RGB refraction.
 * An explicit photo sample makes SVG refraction work without browser-specific
 * SVG backdrop-filter support or a WebGL context for every gallery card.
 */
let serial=0;
const svgNS='http://www.w3.org/2000/svg';
const uri=(svg:string)=>'data:image/svg+xml,'+encodeURIComponent(svg);
export function displacementMap(width:number,height:number){
 const edge=Math.min(width,height)*.07,round=height/2;
 return uri(`<svg xmlns="${svgNS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="r" x1="100%" x2="0%"><stop stop-color="#0000"/><stop offset="1" stop-color="red"/></linearGradient><linearGradient id="b" y1="0%" y2="100%" x1="0%" x2="0%"><stop stop-color="#0000"/><stop offset="1" stop-color="blue"/></linearGradient><filter id="s"><feGaussianBlur stdDeviation="3"/></filter></defs><rect width="100%" height="100%" fill="black"/><rect width="100%" height="100%" rx="${round}" fill="url(#r)"/><rect width="100%" height="100%" rx="${round}" fill="url(#b)" style="mix-blend-mode:difference"/><rect x="${edge}" y="${edge}" width="${width-edge*2}" height="${height-edge*2}" rx="${round}" fill="hsl(0 0% 50% / .96)" filter="url(#s)"/></svg>`);
}
export function refractionFilter(id:string,w:number,h:number){
 const map=displacementMap(w,h);
 return `<filter id="${id}" x="0" y="0" width="${w}" height="${h}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feImage href="${map}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/><feDisplacementMap in="SourceGraphic" in2="map" scale="-38" xChannelSelector="R" yChannelSelector="G" result="r"/><feColorMatrix in="r" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="red"/><feDisplacementMap in="SourceGraphic" in2="map" scale="-36" xChannelSelector="R" yChannelSelector="G" result="g"/><feColorMatrix in="g" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="green"/><feDisplacementMap in="SourceGraphic" in2="map" scale="-34" xChannelSelector="R" yChannelSelector="G" result="b"/><feColorMatrix in="b" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="blue"/><feBlend in="red" in2="green" mode="screen" result="rg"/><feBlend in="rg" in2="blue" mode="screen" result="rgb"/><feGaussianBlur in="rgb" stdDeviation=".45"/></filter>`;
}
export function installGlassButtons(root:HTMLElement){
 const state=new WeakMap<HTMLButtonElement,{signature:string;svg:SVGSVGElement}>();
 const sample=document.createElement('canvas'),ctx=sample.getContext('2d');let pending=0;
 function draw(button:HTMLButtonElement){
  const card=button.closest<HTMLElement>('.photo-flip')!,back=button.closest<HTMLElement>('.flip-back')!,photo=card.querySelector<HTMLImageElement>('.flip-frost img')!;
  if(card.dataset.flipping==='true')return;
  if(!ctx||!photo.complete||!photo.naturalWidth||!button.offsetWidth)return;
  const w=button.offsetWidth,h=button.offsetHeight,cw=card.clientWidth,ch=card.clientHeight;
  let x=0,y=0,node:HTMLElement|null=button;
  while(node&&node!==back){x+=node.offsetLeft;y+=node.offsetTop;node=node.offsetParent as HTMLElement|null}
  const signature=[photo.currentSrc||photo.src,w,h,cw,ch,x,y].join('|');let saved=state.get(button);if(saved?.signature===signature)return;
  // Sample the rear surface, not the clear front: mirror, blur, grade, then navy veil.
  // Canvas filter lengths are device pixels; CSS blur also scales with the 1.16 transform.
  const pad=40,dpr=Math.min(2,devicePixelRatio||1),sw=w+pad*2,sh=h+pad*2;
  sample.width=Math.ceil(sw*dpr);sample.height=Math.ceil(sh*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,sw,sh);
  ctx.save();ctx.translate(pad-x+cw/2,pad-y+ch/2);ctx.scale(-1.16,1.16);
  const scale=Math.max(cw/photo.naturalWidth,ch/photo.naturalHeight),iw=photo.naturalWidth*scale,ih=photo.naturalHeight*scale;
  ctx.filter=`blur(${10*1.16*dpr}px) brightness(.92) saturate(.9)`;ctx.drawImage(photo,-iw/2,-ih/2,iw,ih);ctx.restore();
  // CSS linear-gradient(145deg) spans the whole card, not the button rectangle.
  const angle=145*Math.PI/180,dx=Math.sin(angle),dy=-Math.cos(angle),extent=(Math.abs(cw*dx)+Math.abs(ch*dy))/2;
  const cx=pad-x+cw/2,cy=pad-y+ch/2;
  const veil=ctx.createLinearGradient(cx-dx*extent,cy-dy*extent,cx+dx*extent,cy+dy*extent);
  veil.addColorStop(0,'#10273e45');veil.addColorStop(1,'#0b1b3080');ctx.fillStyle=veil;ctx.fillRect(0,0,sw,sh);
  let source:string;try{source=sample.toDataURL()}catch{return}
  if(!saved){
   const svg=document.createElementNS(svgNS,'svg');svg.classList.add('glass-refraction');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
   const label=document.createElement('span');label.className='glass-label';label.textContent=button.textContent;button.replaceChildren(svg,label);
   saved={signature:'',svg};state.set(button,saved);
  }
  const id='photo-glass-'+(++serial);
  saved.svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
  saved.svg.innerHTML=`<defs>${refractionFilter(id,w,h)}</defs><image href="${source}" x="${-pad}" y="${-pad}" width="${sw}" height="${sh}" filter="url(#${id})"/>`;
  saved.signature=signature;button.classList.add('has-refraction');
 }
 function update(){pending=0;root.querySelectorAll<HTMLButtonElement>('.photo-flip[data-flipped="true"] .flip-view').forEach(draw)}
 function schedule(){if(!pending)pending=requestAnimationFrame(update)}
 root.addEventListener('photo-atlas:flip',schedule);root.addEventListener('photo-atlas:flip-settled',schedule);root.addEventListener('photo-atlas:layout',schedule);
 root.addEventListener('load',event=>{if((event.target as Element).matches('.flip-front img,.flip-frost img'))schedule()},true);
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(pending);pending=0});
}
