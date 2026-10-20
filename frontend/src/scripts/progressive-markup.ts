import type {Photo} from './api';
import {escaped} from './api';
import {progressiveSources} from './photo-preview';
export function progressiveMarkup(photo:Photo,sizes:string,maxEdge=1600){
 const attributes=Object.entries(progressiveSources(photo,maxEdge)).map(([key,value])=>'data-'+key.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase())+'="'+escaped(value)+'"').join(' ');
 return '<img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" '+attributes+' sizes="'+escaped(sizes)+'" width="'+photo.width+'" height="'+photo.height+'" style="aspect-ratio:'+photo.width+'/'+photo.height+'" alt="'+escaped(photo.alt||photo.title)+'" decoding="async"/>';
}
