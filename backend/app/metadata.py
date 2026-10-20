"""Fuse trustworthy metadata with filenames and directory place evidence, never upload dates."""
import datetime,json,math,re,time,xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from .places import matches,country_hint,nearest,distance,ANCHORS,PREFERRED


def parse_date(value,source='exif'):
    value=str(value).strip()
    patterns=[(r'(?<!\d)((?:19|20)\d{2})[:./年-](\d{1,2})[:./月-](\d{1,2})(?:日)?','day'),(r'(?<!\d)((?:19|20)\d{2})(\d{2})(\d{2})(?!\d)','day'),(r'(?<!\d)((?:19|20)\d{2})[-./年](\d{1,2})(?:月)?(?!\d)','month'),(r'(?<!\d)((?:19|20)\d{2})(?:年|(?=$))','year')]
    for pattern,precision in patterns:
        found=re.search(pattern,value)
        if not found:continue
        try:
            numbers=[int(v) for v in found.groups()];year=numbers[0];month=numbers[1] if len(numbers)>1 else 1;day=numbers[2] if len(numbers)>2 else 1
            date=datetime.date(year,month,day)
            if date>datetime.date.today()+datetime.timedelta(days=1):continue
            normalized=f'{year:04d}'+(f'-{month:02d}' if precision!='year' else '')+(f'-{day:02d}' if precision=='day' else '')
            return {'value':normalized,'precision':precision,'source':source,'status':'resolved'}
        except ValueError:return None
    return None


def extract(source,existing=None):
    result=dict(existing or {})
    try:
        with Image.open(source) as image:
            exif=image.getexif();detail={**exif,**exif.get_ifd(34665)}
            for name,tag in (('camera',272),('lens',42036),('iso',34855),('fnumber',33437),('exposure',33434),('focal_length',37386)):
                value=detail.get(tag)
                if value is not None and not result.get(name):result[name]=str(value)[:120]
            if detail.get(36867):result['date']=str(detail[36867])[:120]
            if detail.get(36881):result['date_offset']=str(detail[36881])[:20]
            try:
                from PIL.IptcImagePlugin import getiptcinfo
                iptc=getiptcinfo(image) or {}
                def decode(v):return v.decode('utf-8','replace') if isinstance(v,bytes) else str(v)
                if iptc.get((2,55)) and not result.get('date'):result['date']=decode(iptc[(2,55)]);result['date_source']='iptc'
                if iptc.get((2,90)):result['iptc_city']=decode(iptc[(2,90)])[:120]
            except (OSError,ValueError,TypeError):pass
            gps=exif.get_ifd(34853)
            if gps.get(2) and gps.get(4):
                def degrees(parts):return float(parts[0])+float(parts[1])/60+float(parts[2])/3600
                lat=degrees(gps[2])*(-1 if str(gps.get(1)).upper()=='S' else 1)
                lon=degrees(gps[4])*(-1 if str(gps.get(3)).upper()=='W' else 1)
                if math.isfinite(lat) and math.isfinite(lon) and -90<=lat<=90 and -180<=lon<=180:result['gps_latitude'],result['gps_longitude']=lat,lon
    except (OSError,ValueError,TypeError,KeyError,IndexError,ZeroDivisionError):pass
    try:
        import pyvips
        header=pyvips.Image.new_from_file(str(source),access='sequential')
        if header.get_typeof('xmp-data'):
            packet=header.get('xmp-data');packet=packet.decode('utf-8','replace') if isinstance(packet,bytes) else str(packet)
            if len(packet)<=262144 and '<!DOCTYPE' not in packet and '<!ENTITY' not in packet:
                node=ET.fromstring(packet);values={}
                for item in node.iter():
                    name=item.tag.rsplit('}',1)[-1]
                    if name in ('ISOSpeedRatings','PhotographicSensitivity','ISO'):
                        values[name]=' '.join(t.strip() for t in item.itertext() if t.strip())
                    elif item.text:values[name]=item.text.strip()
                    for k,v in item.attrib.items():values[k.rsplit('}',1)[-1]]=v
                for name,keys in (('camera',('Model',)),('lens',('LensModel','Lens')),('iso',('ISOSpeedRatings','PhotographicSensitivity','ISO')),('fnumber',('FNumber',)),('exposure',('ExposureTime',)),('focal_length',('FocalLength',))):
                    value=next((values[key] for key in keys if values.get(key)),None)
                    if value and not result.get(name):result[name]=value[:120]
                for key in ('DateTimeOriginal','DateCreated'):
                    if values.get(key) and not result.get('date'):result['date']=values[key][:120];result['date_source']='xmp'
                if values.get('City'):result['iptc_city']=values['City'][:120]
    except Exception:pass
    return result


def compact(place,source,status='resolved',evidence=''):
    label=place['label'];matched=place.get('matched','')
    if place['name'] not in PREFERRED and re.fullmatch(r'[\u3400-\u9fff]{2,6}',matched) and matched not in ANCHORS:label=matched
    return {'label':label,'city_id':place['id'],'country':place['country'],'latitude':place['lat'],'longitude':place['lon'],'precision':'city','source':source,'status':status,'evidence':evidence[:180]}


def infer(photo,albums=()):
    exif=json.loads(photo.get('exif') or '{}');context=json.loads(photo.get('source_context') or '{}')
    filename=photo.get('original_name','');path=context.get('relative_path','');folder=str(Path(path).parent) if path else ''
    text=' '.join([folder,*albums]);country=country_hint(text)
    candidates=[];geo={'status':'unknown'}
    if 'gps_latitude' in exif and 'gps_longitude' in exif:
        lat,lon=float(exif['gps_latitude']),float(exif['gps_longitude']);city=nearest(lat,lon)
        geo={'latitude':lat,'longitude':lon,'precision':'exact','label':city['label'] if city else '拍摄地点','country':city['country'] if city else '', 'source':'gps','status':'resolved'}
    else:
        directory_places=matches(folder,country)
        for input_text,source in [(exif.get('iptc_city',''),'iptc'),(filename+' '+photo.get('title',''),'filename'),(folder,'directory'),(' '.join(albums),'album')]:
            lookup=input_text.replace('春日神社','春日大社') if '奈良' in folder or '纳良' in folder else input_text
            found=matches(lookup,country)
            if len(found)>1 and source=='filename' and len(directory_places)==1:
                anchor=directory_places[0];ranked=sorted(found,key=lambda p:distance(anchor['lat'],anchor['lon'],p['lat'],p['lon']))
                d1=distance(anchor['lat'],anchor['lon'],ranked[0]['lat'],ranked[0]['lon']);d2=distance(anchor['lat'],anchor['lon'],ranked[1]['lat'],ranked[1]['lon'])
                if d1<300 and d2>d1+100:found=ranked[:1]
            if len(found)==1 and source=='filename' and len(directory_places)==1 and found[0]['id']!=directory_places[0]['id'] and found[0]['population']<1000000 and found[0].get('matched') not in ANCHORS:
                anchor=directory_places[0]
                if distance(anchor['lat'],anchor['lon'],found[0]['lat'],found[0]['lon'])>300:
                    candidates.append(compact(found[0],source,'suggested',input_text));found=[]
            if len(found)==1:geo=compact(found[0],source,status='approximate' if source in ('directory','album') else 'resolved',evidence=input_text);break
            if found:candidates.extend(compact(p,source,evidence=input_text) for p in found)
        if candidates:geo['candidates']=list({p.get('city_id'):p for p in candidates}.values())[:6]
    if geo.get('source')=='gps':
        names=matches(filename+' '+folder,country)
        if names and all(distance(geo['latitude'],geo['longitude'],p['lat'],p['lon'])>300 for p in names):geo['conflict']='GPS与文件名/目录线索不一致，优先保留GPS'
    captured=parse_date(exif.get('date',''),exif.get('date_source','exif'))
    if captured:
        captured['timezone_offset']=exif.get('date_offset','')
    else:
        hints=[parse_date(part,'directory') for part in Path(folder).parts]
        hints=[h for h in hints if h]
        captured=parse_date(filename,'filename') or (max(hints,key=lambda h:len(h['value'])) if hints else None) or {'status':'unknown'}
    if not captured.get('value'):
        hints=[parse_date(name,'album') for name in albums];hints=[h for h in hints if h]
        if len({h['value'] for h in hints})==1:captured=hints[0]
    return geo,captured


def enrich(db,config,identifier):
    photo=db.one('SELECT * FROM photos WHERE id=? AND deleted IS NULL',(identifier,))
    if not photo:return
    master=db.one('SELECT original_path FROM photo_masters WHERE photo_id=?',(identifier,))
    source=config.data/(master['original_path'] if master else photo['original_path'])
    metadata=extract(source,json.loads(photo['exif']))
    photo['exif']=json.dumps(metadata,ensure_ascii=False)
    albums=[r['title'] for r in db.all('SELECT a.title FROM albums a JOIN album_photos p ON p.album_id=a.id WHERE p.photo_id=? AND a.archived_at IS NULL',(identifier,))]
    geo,captured=infer(photo,albums)
    with db.connect() as conn:
        conn.execute('UPDATE photos SET exif=?,geo=CASE WHEN geo_locked=0 THEN ? ELSE geo END,captured=CASE WHEN captured_locked=0 THEN ? ELSE captured END,metadata_updated=? WHERE id=? AND deleted IS NULL',(photo['exif'],json.dumps(geo,ensure_ascii=False),json.dumps(captured,ensure_ascii=False),time.time(),identifier))


def public_geo(geo):
    allowed={k:geo[k] for k in ('label','country','precision','source','status') if k in geo}
    if geo.get('status') in ('resolved','approximate') and 'latitude' in geo:
        allowed.update(latitude=round(geo['latitude'],2),longitude=round(geo['longitude'],2))
        if geo.get('precision')=='exact':allowed['precision']='approximate'
    return allowed
