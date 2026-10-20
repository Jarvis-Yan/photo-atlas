/* React Bits adaptation — Copyright (c) 2026 David Haz.
 * MIT + Commons Clause; see third_party/react-bits/LICENSE.md and THIRD_PARTY_NOTICES.md.
 */
export function fitPhoto(aspect,maxWidth,maxHeight){
 const ratio=Number.isFinite(aspect)&&aspect>0?aspect:1;
 const w=Math.min(maxWidth,maxHeight*ratio);
 return {w,h:w/ratio};
}
