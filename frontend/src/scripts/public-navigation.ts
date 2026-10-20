/** Keep the current history entry useful when the browser reconstructs it on Back. */
function createNavigation(){
 const saved=history.state?.photoAtlasBrowse;
 const back=(performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined)?.type==='back_forward';
 const returning=Boolean(back&&saved?.url===location.href&&Number.isFinite(saved?.scroll));
 let count=0,restored=false;
 let container:HTMLElement|undefined;
 if(returning)history.scrollRestoration='manual';
 window.addEventListener('pagehide',()=>{
  history.replaceState({...history.state,photoAtlasBrowse:{url:location.href,scroll:container?container.scrollTop:scrollY,count}},'');
 });
 return {
  returning,
  count:returning?Math.max(0,Math.min(10000,Number(saved.count)||0)):0,
  rememberCount(value:number){count=value},
  useScrollContainer(element:HTMLElement){container=element},
  restore(){
   if(!returning||restored)return;restored=true;
   requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const options={top:Math.max(0,saved.scroll),behavior:'instant' as const};
    if(container)container.scrollTo(options);else scrollTo(options);
    history.scrollRestoration='auto';
   }));
  },
 };
}
export const publicNavigation=createNavigation();
