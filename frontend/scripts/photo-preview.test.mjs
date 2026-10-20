import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/scripts/photo-preview.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
test('small map previews never request grid or full-size assets',()=>{
 const photo={src:'/960.webp',srcset:'/480.webp 480w, /960.webp 960w',thumbnail:{src:'/thumb480.webp',srcset:'/thumb160.webp 107w, /thumb320.webp 213w, /thumb480.webp 320w, /thumb768.webp 512w'}};
 const result=exports.browsingImage(photo,160);
 assert.equal(result.src,'/thumb160.webp');assert.equal(result.srcset,'/thumb160.webp 107w');
 assert.equal(exports.browsingImage(photo).srcset,photo.thumbnail.srcset);
 assert.equal(photo.src,'/960.webp');
});
test('legacy catalogs and originals smaller than the requested slot still render',()=>{
 assert.equal(exports.browsingImage({src:'/tiny.webp',srcset:'/tiny.webp 80w'},160).src,'/tiny.webp');
 assert.equal(exports.browsingImage({src:'/fallback.webp',srcset:''}).src,'/fallback.webp');
});

test('portrait previews obey the long-edge budget, including narrow photos',()=>{const photo={width:1000,height:2000,src:'/960.webp',srcset:'',thumbnail:{src:'/thumb480.webp',srcset:'/thumb160.webp 80w, /thumb320.webp 160w, /thumb480.webp 240w, /thumb768.webp 384w, /thumb1280.webp 640w'}};assert.equal(exports.browsingImage(photo,480).srcset,'/thumb160.webp 80w, /thumb320.webp 160w, /thumb480.webp 240w');assert.ok(!exports.browsingImage(photo).srcset.includes('1280'));});

test('clear upgrades label portrait legacy files by actual width and keep larger files available',()=>{const photo={width:4000,height:6000,src:'/media/id/960.webp',srcset:'/media/id/480.webp 480w, /media/id/960.webp 960w, /media/id/1600.webp 1600w, /media/id/2400.webp 2400w'};const result=exports.clearPreview(photo,1600);assert.equal(result.src,'/media/id/1600.webp');assert.equal(result.srcset,'/media/id/480.webp 320w, /media/id/960.webp 640w, /media/id/1600.webp 1067w');assert.ok(!exports.clearPreview(photo,960).srcset.includes('1600'));});
