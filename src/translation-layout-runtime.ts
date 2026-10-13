// Serialized into platform pages as well as used by the workspace renderer.
// Layout changes can happen without DOM insertions (DPI, maximize, fullscreen).
export function installTranslationLayoutWatchersFromDom(replay:()=>void) {
  let disposed=false,timer=0;
  let retries:number[]=[];
  const metrics=()=>[window.innerWidth,window.innerHeight,window.devicePixelRatio,
    window.visualViewport?.width,window.visualViewport?.height,window.visualViewport?.scale].join(':');
  let previous=metrics();
  const schedule=()=>{
    if(disposed)return;
    window.clearTimeout(timer);retries.forEach(window.clearTimeout);retries=[];
    timer=window.setTimeout(()=>{timer=0;if(disposed)return;replay();
      retries=[80,240,700,1400].map(delay=>window.setTimeout(()=>{if(!disposed)replay();},delay));
    },80);
  };
  const onMetrics=()=>{const current=metrics();if(current===previous)return;previous=current;schedule();};
  const onFullscreen=()=>{previous=metrics();schedule();};
  let dpi:MediaQueryList|null=null;
  const onDpi=()=>{armDpi();previous=metrics();schedule();};
  const armDpi=()=>{
    dpi?.removeEventListener('change',onDpi);
    dpi=typeof window.matchMedia==='function'?window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`):null;
    dpi?.addEventListener('change',onDpi);
  };
  armDpi();
  window.addEventListener('resize',onMetrics,{passive:true});
  window.visualViewport?.addEventListener('resize',onMetrics,{passive:true});
  document.addEventListener('fullscreenchange',onFullscreen);
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(onMetrics):null;
  if(document.documentElement)observer?.observe(document.documentElement);
  return ()=>{
    disposed=true;window.clearTimeout(timer);retries.forEach(window.clearTimeout);observer?.disconnect();
    dpi?.removeEventListener('change',onDpi);window.removeEventListener('resize',onMetrics);
    window.visualViewport?.removeEventListener('resize',onMetrics);document.removeEventListener('fullscreenchange',onFullscreen);
  };
}
