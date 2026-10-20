export interface PlaceArea {label:string;kind:'place-area';latitude:number;longitude:number;scale:number;source:string;url:string}
export function placeReference(photo:{geo?:{label?:string;country?:string;latitude?:number;longitude?:number}}|undefined):PlaceArea|null;
