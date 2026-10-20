// Bound abortable downloads and local image decoding with one shared connection budget.
function createQueue(limit=4,clearLimit=2){
 const waiting=[],active=new Set();let scrolling=false;
 function pump(){
  while(active.size<limit){const clear=[...active].filter(job=>job.stage==='clear').length;const candidates=waiting.filter(job=>!job.cancelled&&(job.stage!=='clear'||!scrolling&&clear<clearLimit));const job=candidates.find(job=>job.stage==='small')||candidates[0];if(!job)break;waiting.splice(waiting.indexOf(job),1);active.add(job);job.start(()=>{if(!active.delete(job))return;pump()});}
 }
 return{setScrolling(value){scrolling=value;pump();},enqueue(stage,start){const job={stage,start,cancelled:false};waiting.push(job);pump();return()=>{job.cancelled=true;const index=waiting.indexOf(job);if(index>=0)waiting.splice(index,1);active.delete(job);pump();}}};
}
const imageQueue=createQueue();
let settleTimer;
function previewScroll(){imageQueue.setScrolling(true);clearTimeout(settleTimer);settleTimer=setTimeout(()=>imageQueue.setScrolling(false),160);}
module.exports={createQueue,imageQueue,previewScroll};
