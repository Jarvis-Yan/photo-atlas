// Named places without photo coordinates may use a broad place viewport only.
// These references never become photo GPS or photo markers. Exact labels include
// the province so homonyms (e.g. Shaxi) are not resolved by substring guessing.
const references={
 '宁夏 六盘山':{latitude:35.66,longitude:106.21,scale:8,source:'Getty TGN 1109277',url:'https://www.getty.edu/vow/TGNFullDisplay?english=N&subjectid=1109277'},
 '内蒙古 库布齐沙漠':{latitude:40.53,longitude:107.93,scale:6,source:'GeoNames 2036896',url:'https://www.geonames.org/2036896/'},
 '贵州 黄果树':{latitude:25.99,longitude:105.67,scale:10,source:'GeoNames 1807486',url:'https://www.geonames.org/1807486/'},
 '贵州 小七孔':{latitude:25.25,longitude:107.71,scale:9,source:'高德地图 小七孔景区',url:'https://ditu.amap.com/place/B035600C1Q'},
 '云南 沙溪古镇':{latitude:26.30,longitude:99.85,scale:10,source:'GeoNames 1280017',url:'https://www.geonames.org/1280017/shaxi.html'},
};
function placeReference(photo){
 const geo=photo&&photo.geo;if(!geo||geo.country&&geo.country!=='CN')return null;
 if(Number.isFinite(geo.latitude)&&Number.isFinite(geo.longitude)&&Math.abs(geo.latitude)<=90&&Math.abs(geo.longitude)<=180)return null;
 const label=String(geo.label||'').trim().replace(/\s+/g,' '),reference=references[label];
 return reference?Object.assign({label,kind:'place-area'},reference):null;
}
module.exports={placeReference};
