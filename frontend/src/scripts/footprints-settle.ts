/** Wait for both pointer release and a quiet interval, including touch momentum. */
export function settledTask(run:()=>void,delay=320){
  let timer:ReturnType<typeof setTimeout>|undefined,held=false;
  const cancel=()=>{clearTimeout(timer);timer=undefined};
  const schedule=()=>{cancel();if(!held)timer=setTimeout(()=>{timer=undefined;run()},delay)};
  return {schedule,cancel,hold(){held=true;cancel()},release(){held=false;schedule()}};
}
