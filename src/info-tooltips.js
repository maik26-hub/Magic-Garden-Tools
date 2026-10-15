/* Delayed, accessible help. Hover/focus: 1.2 s; click/touch: toggle;
 * Escape, outside click, section change or scrolling closes the tooltip. */
function installInfoTooltips(doc,panel){
  'use strict';
  if(panel.dataset.infoInstalled)return;panel.dataset.infoInstalled='1';
  const style=doc.createElement('style');style.textContent=`
#mg-autofarm-v13.mg-compact .mg-info {display:inline-flex!important;align-items:center;justify-content:center;padding:0!important;width:21px;min-width:21px;height:21px;margin:0 4px!important;border:1px solid #908571!important;border-radius:50%!important;background:transparent!important;color:#d6cbb6!important;font:600 12px system-ui!important;box-shadow:none!important;cursor:help;vertical-align:middle}
#mg-autofarm-v13 .mg-info-block {margin:5px 0;text-align:right}
#mg-v16-tooltip {position:fixed;z-index:2147483647;box-sizing:border-box;max-width:min(300px,calc(100vw - 20px));padding:11px 13px;background:#211e19;color:#efe7d9;border:1px solid #8c806b;border-radius:10px;font:12px/1.5 system-ui,sans-serif;box-shadow:0 6px 24px #0006;white-space:normal;overflow-wrap:anywhere}
#mg-v16-tooltip[hidden] {display:none!important}
#mg-autofarm-v13 .mg-live-status {font-size:11px;color:var(--mg-muted);line-height:1.4;margin:7px 0}
#mg-autofarm-v13 .mg-team-card {border:1px solid var(--mg-line);border-radius:9px;padding:9px;margin:8px 0;font-size:12px}
#mg-autofarm-v13 .mg-team-card small {font-size:11px;margin:4px 0}
#mg-autofarm-v13 .mg-team-list {max-height:350px;overflow:auto}
`;
  doc.head.appendChild(style);const bubble=doc.createElement('div');bubble.id='mg-v16-tooltip';bubble.role='tooltip';bubble.hidden=true;doc.body.appendChild(bubble);
  let button=null,timer=null,leaveTimer=null;
  function close(){clearTimeout(timer);clearTimeout(leaveTimer);if(button)button.removeAttribute('aria-describedby');button=null;bubble.hidden=true;}
  function show(target){if(!target.isConnected)return;close();button=target;
    bubble.textContent=target.dataset.info||'';if(!bubble.textContent)return;
    bubble.hidden=false;target.setAttribute('aria-describedby',bubble.id);
    const box=target.getBoundingClientRect(),w=bubble.offsetWidth,h=bubble.offsetHeight;
    const view=doc.defaultView;
    bubble.style.left=Math.min(Math.max(10,box.right-w),Math.max(10,view.innerWidth-w-10))+'px';
    bubble.style.top=(box.bottom+h+12<view.innerHeight?box.bottom+7:Math.max(8,box.top-h-7))+'px';
  }
  function schedule(target){close();button=target;timer=setTimeout(()=>show(target),1200);}
  panel.addEventListener('pointerover',e=>{const t=e.target.closest?.('.mg-info');if(t&&t!==button)schedule(t);});
  panel.addEventListener('pointerout',e=>{if(e.target.closest?.('.mg-info'))leaveTimer=setTimeout(close,180);});
  bubble.addEventListener('pointerenter',()=>clearTimeout(leaveTimer));bubble.addEventListener('pointerleave',close);
  panel.addEventListener('focusin',e=>{const t=e.target.closest?.('.mg-info');if(t)schedule(t);});
  panel.addEventListener('focusout',e=>{if(e.target.closest?.('.mg-info'))close();});
  panel.addEventListener('click',e=>{const t=e.target.closest?.('.mg-info');if(!t)return;e.preventDefault();e.stopPropagation();if(button===t&&!bubble.hidden)close();else show(t);},true);
  doc.addEventListener('pointerdown',e=>{if(!e.target.closest?.('.mg-info')&&!bubble.contains(e.target))close();},true);
  doc.addEventListener('keydown',e=>{if(e.key==='Escape'&&!bubble.hidden){e.stopPropagation();close();}},true);
  panel.addEventListener('scroll',close,true);
  // Legacy explanatory blocks become help too; dynamic statuses are never hidden.
  for(const el of panel.querySelectorAll('small,.mg-choice-note')){
    if(el.closest('.mg-team-card,.mg-choice-menu,.mg-live-status')||el.dataset.liveStatus||el.querySelector('.mg-info')||el.classList.contains('mg-info'))continue;
    const text=el.textContent.trim();if(text.length<65)continue;
    const info=doc.createElement('button');info.type='button';info.className='mg-info';info.textContent='i';info.dataset.info=text;info.setAttribute('aria-label','Weitere Informationen');el.replaceWith(info);
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports={installInfoTooltips};
