"""Cache full-resolution branded JPEGs; private master files never leave this module."""
import html,os,uuid
from pathlib import Path


def download_name(photo):
    return photo['slug']+'-watermarked.jpg'


def generate(source, folder):
    import pyvips
    image = source if isinstance(source,pyvips.Image) else pyvips.Image.new_from_file(str(source),access='sequential')
    image=image.colourspace('srgb')
    if image.hasalpha():image=image.flatten(background=[255,255,255])
    # Small corner signature; preserve every source pixel in the output dimensions.
    font=max(12,min(120,round(min(image.width,image.height)*0.026)))
    margin=max(8,round(min(image.width,image.height)*0.035))
    text='© Photo Atlas'
    def signature(color):
        mark=pyvips.Image.text('<span foreground="'+color+'">'+html.escape(text)+'</span>',font=f'sans {font}',rgba=True)
        if mark.width>image.width-2*margin:
            mark=mark.resize(max(0.1,(image.width-2*margin)/mark.width))
        return mark.extract_band(0,n=3).bandjoin((mark.extract_band(3)*0.72).cast('uchar'))
    white,shadow=signature('white'),signature('black')
    x=max(0,image.width-margin-white.width);y=max(0,image.height-margin-white.height)
    result=image.composite2(shadow,'over',x=min(image.width-1,x+1),y=min(image.height-1,y+1)).composite2(white,'over',x=x,y=y).flatten(background=[255,255,255])
    folder=Path(folder);folder.mkdir(parents=True,exist_ok=True)
    temp=folder/('watermarked-'+uuid.uuid4().hex+'.tmp')
    try:
        result.jpegsave(str(temp),Q=94,strip=True,optimize_coding=True,interlace=True)
        os.replace(temp,folder/'watermarked.jpg')
    finally:temp.unlink(missing_ok=True)
    return folder/'watermarked.jpg'


def cached(config,identifier):
    folder=config.data/'media'/identifier
    output=folder/'watermarked.jpg';source=folder/'full.jpg'
    if not output.exists() or output.stat().st_mtime_ns<source.stat().st_mtime_ns:
        generate(source,folder)
    return output
