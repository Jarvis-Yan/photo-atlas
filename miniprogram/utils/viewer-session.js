// Keep the originating gallery order in memory; route URLs still work as single photos.
let photos=[],owner=null,startId='';
function openViewer(items,id,page){owner=page||null;startId=id;photos=[...new Map((items||[]).filter(p=>p&&p.id).map(p=>[p.id,p])).values()];if(!photos.some(p=>p.id===id))photos=[];wx.navigateTo({url:'/pages/photo/index?id='+encodeURIComponent(id)+'&viewer=1'});}
function viewerPhotos(id){return photos.some(photo=>photo.id===id)?photos.slice():[];}
function rememberViewer(id){if(owner)owner._viewerReturnId=id===startId?'':id;}
function restoreViewer(page){if(page!==owner)return;const id=page._viewerReturnId;delete page._viewerReturnId;owner=null;photos=[];if(id){const run=()=>setTimeout(()=>page.revealPhoto(id),240);if(wx.nextTick)wx.nextTick(run);else run();}}
module.exports={openViewer,viewerPhotos,rememberViewer,restoreViewer};
