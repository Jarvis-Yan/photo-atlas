"""Offline GeoNames cities; ambiguous city names remain ambiguous."""
import gzip,json,re,math,threading
from functools import lru_cache
from pathlib import Path

COUNTRIES={'日本':'JP','japan':'JP','韩国':'KR','korea':'KR','中国':'CN','china':'CN','香港':'HK','hong kong':'HK','台湾':'TW','法国':'FR','france':'FR','英国':'GB','united kingdom':'GB','美国':'US','united states':'US'}
PREFERRED={'Kamakura':'镰仓','Nara-shi':'奈良','Fujikawaguchiko':'河口湖','Ōsaka':'大阪','Kōbe':'神户','Tokyo':'东京','Kyoto':'京都','Osaka':'大阪','Nara':'奈良','Uji':'宇治','Himeji':'姬路','Kobe':'神户','Shanghai':'上海','Beijing':'北京','Dali':'大理','Guiyang':'贵阳','Linyi':'临沂','Seoul':'首尔','Hong Kong':'香港'}
ANCHORS={'趵突泉':('Jinan','CN'),'大明湖':('Jinan','CN'),'春日大社':('Nara','JP'),'河口湖':('Fujikawaguchiko','JP'),'东京塔':('Tokyo','JP'),'六本木':('Tokyo','JP'),'浅草寺':('Tokyo','JP'),'台场':('Tokyo','JP'),'涩谷':('Tokyo','JP'),'新宿':('Tokyo','JP'),'金阁寺':('Kyoto','JP'),'清水寺':('Kyoto','JP'),'伏见稻荷':('Kyoto','JP'),'奈良公园':('Nara','JP'),'姬路城':('Himeji','JP'),'神户':('Kobe','JP'),'祈年殿':('Beijing','CN'),'角楼':('Beijing','CN'),'天坛':('Beijing','CN'),'故宫':('Beijing','CN'),'北外滩':('Shanghai','CN'),'外滩':('Shanghai','CN'),'东方明珠':('Shanghai','CN'),'六本木站':('Tokyo','JP')}

_CACHE=None
_LOCK=threading.Lock()
def database():
    global _CACHE
    with _LOCK:
        if _CACHE is not None:return _CACHE
        with gzip.open(Path(__file__).parent/'data/cities15000.json.gz','rt',encoding='utf-8') as f:rows=json.load(f)
        aliases={}
        for row in rows:
            row['label']=PREFERRED.get(row['name'],row['name'])
            for name in {*row['aliases'],row['label']}:
                key=name.strip().casefold()
                if len(key)>=2:aliases.setdefault(key,[]).append(row)
        for name,(city,country) in ANCHORS.items():
            choices=[r for r in aliases.get(city.casefold(),[]) if r['country']==country]
            if choices:aliases[name]=[max(choices,key=lambda r:r['population'])]
        # Common spelling variants in the photographer's directories.
        aliases['纳良']=aliases.get('nara',[]);aliases['宇智']=aliases.get('uji',[])
        ledong=[r for r in aliases.get('ledong',[]) if r['country']=='CN']
        if ledong:
            for row in ledong:row['label']='乐东'
            aliases['乐东']=ledong
        _CACHE=(rows,aliases)
        return _CACHE

def country_hint(text):
    lower=text.casefold();found={code for word,code in COUNTRIES.items() if word in lower}
    if '乐东' in text or '海南省' in text:found.add('CN')
    return next(iter(found)) if len(found)==1 else ''

def matches(text,country=''):
    country=country or country_hint(text)
    _,index=database();keys=set()
    for chunk in re.findall(r'[\u3400-\u9fff]+',text):
        for n in range(2,min(len(chunk),12)+1):
            keys.update(chunk[i:i+n] for i in range(len(chunk)-n+1))
    words=re.findall(r'[A-Za-z][A-Za-z -]*',text)
    for chunk in words:
        parts=chunk.casefold().strip().split()
        for n in range(1, min(4,len(parts))+1):
            keys.update(' '.join(parts[i:i+n]) for i in range(len(parts)-n+1) if len(' '.join(parts[i:i+n]))>=4)
    found={}
    # Favor known landmarks and longer aliases; avoid a short alias nested within a longer match.
    generic={'风景','自然','风光','人像','星空','银河','日落','日出','校园','海滩','街道','苗寨','假期','明珠','云端','俯瞰','背影','流星','樱花','小河','松树','杜鹃','花海','春日','石桥','古桥','黄莺','黄樱','晚霞','夕阳','海边','湖边','车站','古镇','清水','溪流','红叶','金色','水边','nature','portrait','photo','travel','sunset','garden','park','beach'}
    matched=[k for k in keys if k in index and k not in generic]
    # Bare 海南 is usually a province, not evidence for Japan's Kainan city.
    # A county name provides the location; 日本/海南市 remains a valid city query.
    matched=[k for k in matched if k!='海南' or country=='JP']
    matched=[k for k in matched if not any(k!=other and k in other and len(other)>len(k) for other in matched)]
    # Short town aliases inside unrelated longer words are not place evidence.
    matched=[k for k in matched if k in ANCHORS or not re.fullmatch(r'[\u3400-\u9fff]{2}',k) or any(r['population']>=1000000 for r in index[k]) or any(chunk.startswith(k) or any(code==country and chunk.startswith(prefix+k) for prefix,code in COUNTRIES.items()) for chunk in re.findall(r'[\u3400-\u9fff]+',text))]
    for key in matched:
        choices=[r for r in index[key] if not country or r['country']==country]
        if not choices:continue
        choices=sorted(choices,key=lambda r:r['population'],reverse=True)
        # Major globally recognizable cities may share names with tiny settlements.
        if len(choices)>1 and choices[0]['population']>10*max(1,choices[1]['population']):choices=choices[:1]
        for row in choices:found[row['id']]={**row,'matched':key}
    return list(found.values())

def distance(lat,lon,a,b):
    p,q=math.radians(lat),math.radians(a)
    s=math.sin((q-p)/2)**2+math.cos(p)*math.cos(q)*math.sin(math.radians(b-lon)/2)**2
    return 6371*2*math.asin(min(1,math.sqrt(s)))

def nearest(lat,lon):
    rows,_=database();row=min(rows,key=lambda r:distance(lat,lon,r['lat'],r['lon']))
    return row if distance(lat,lon,row['lat'],row['lon'])<50 else None
