/** Native controls with a shared CSS surface; no SVG refraction or sampled images. */
export function installGlassButtons(root:HTMLElement){
 const scan=()=>root.querySelectorAll<HTMLElement>('.flip-view').forEach(button=>button.classList.add('glass-action'));
 scan();new MutationObserver(scan).observe(root,{childList:true,subtree:true});
}
