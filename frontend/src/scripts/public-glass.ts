/** Style native buttons without replacing their keyboard or pointer behavior. */
export function installPublicGlass(){
 const scan=()=>document.querySelectorAll<HTMLElement>('.site-header button,.hero-actions a,.cover-actions button,.collection-scope button,.category-filter button,#public-main .button,.viewer-toolbar button').forEach(button=>button.classList.add('glass-action'));
 scan();new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
}
