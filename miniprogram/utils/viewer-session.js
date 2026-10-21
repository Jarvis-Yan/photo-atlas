// Keep the originating gallery order in memory; route URLs still work as single photos.
let photos=[];
function openViewer(items,id){photos=[...new Map((items||[]).filter(p=>p&&p.id).map(p=>[p.id,p])).values()];if(!photos.some(p=>p.id===id))photos=[];wx.navigateTo({url:'/pages/photo/index?id='+encodeURIComponent(id)+'&viewer=1'});}
function viewerPhotos(id){return photos.some(photo=>photo.id===id)?photos.slice():[];}
module.exports={openViewer,viewerPhotos};
