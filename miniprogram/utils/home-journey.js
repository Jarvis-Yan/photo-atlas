// Use the same confirmed-place rule as the web homepage, never invent a trip.
function journeySelection(photos){
 const groups=new Map();
 for(const photo of photos||[]){if(!photo.geo||photo.geo.status!=='resolved'||!photo.geo.label)continue;const list=groups.get(photo.geo.label)||[];if(!list.some(item=>item.id===photo.id))list.push(photo);groups.set(photo.geo.label,list);}
 const group=[...groups.entries()].filter(([,items])=>items.length>=2).sort((a,b)=>b[1].length-a[1].length)[0];if(!group)return null;
 const selected=group[1].slice(0,3),dates=[...new Set(selected.map(p=>p.captured&&p.captured.value).filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')))].sort();
 const prefix=selected.filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.captured&&p.captured.value||'')).length<selected.length?'已知拍摄日期：':'';
 return{place:group[0],photos:selected,date:dates.length===1?prefix+dates[0]:dates.length?prefix+'照片拍于 '+dates[0]+' 至 '+dates[dates.length-1]:''};
}
module.exports={journeySelection};
