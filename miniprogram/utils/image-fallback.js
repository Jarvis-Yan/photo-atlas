/** Preserve a working legacy preview when a new thumbnail request is interrupted. */
function imageFailed(event){
 const data=event.currentTarget.dataset,path=data.path,fallback=data.fallback;
 if(typeof path!=='string'||typeof fallback!=='string'||!fallback)return;
 const current=path.replace(/\[(\d+)\]/g,'.$1').split('.').reduce((value,key)=>value&&value[key],this.data);
 if(current!==fallback)this.setData({[path]:fallback});
}
module.exports={imageFailed};
