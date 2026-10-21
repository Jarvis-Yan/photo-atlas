/** Restore the photo selected in the viewer without losing the gallery or its filters. */
export function restoreViewerPhoto(id:string){
 const tile=document.getElementById('work-'+id)||Array.from(document.querySelectorAll<HTMLElement>('[data-masonry-id]')).find(node=>node.dataset.masonryId===id);
 if(!tile)return false;
 tile.scrollIntoView({block:'center',inline:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 const focus=tile.querySelector<HTMLElement>('.flip-front:not([inert]),button:not([disabled]),a[href]');
 focus?.focus({preventScroll:true});return true;
}
