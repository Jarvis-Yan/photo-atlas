/** Ignore editable fields and browser shortcuts while a photo dialog is open. */
export function viewerKeyStep(event:KeyboardEvent):number {
 if(event.defaultPrevented||event.isComposing||event.altKey||event.ctrlKey||event.metaKey)return 0;
 if((event.target as Element|null)?.closest?.('input,textarea,select,[contenteditable="true"]'))return 0;
 return event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:0;
}
