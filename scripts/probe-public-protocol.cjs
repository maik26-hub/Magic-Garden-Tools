'use strict';
const fs = require('node:fs');
(async () => {
  const origin='https://magicgarden.gg';
  const page=await fetch(origin, {signal:AbortSignal.timeout(15000)});
  if (!page.ok) throw new Error('page HTTP '+page.status);
  const html=await page.text();
  const todo=[...html.matchAll(/(?:src|href)=["']([^"']+\.js(?:\?[^"']*)?)["']/g)].map(m=>new URL(m[1],origin).href);
  const seen=new Set(), snippets=[], versions=new Set();let bytes=0;
  while(todo.length && seen.size<100 && bytes<25000000) {
    const batch=todo.splice(0,4).filter(url=>!seen.has(url)&&url.startsWith(origin+'/'));
    for(const url of batch)seen.add(url);
    await Promise.all(batch.map(async url=>{
      try{
        const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
        if(!response.ok)return;
        const text=await response.text();bytes+=text.length;
        for(const m of text.matchAll(/["'`]((?:\.{0,2}\/|\/assets\/)[^"'`\s]+\.js)["'`]/g)) {
          const next=new URL(m[1],url).href;
          if(next.startsWith(origin+'/')&&!seen.has(next)&&todo.length<500)todo.push(next);
        }
        for(const needle of ['ClaimDaily','claimDaily','ClaimQuest','claimQuest','WaterPlant','HatchEgg','GrowEgg','ReplenishPotion','ApplyPetTeam']) {
          let pos=-1, count=0;
          while((pos=text.indexOf(needle,pos+1))>=0&&count++<12) {
            snippets.push({needle,url,offset:pos,text:text.slice(Math.max(0,pos-180),pos+400)});
          }
        }
      }catch(error){console.log('skip asset',url.split('/').pop(),error.message);}
    }));
  }
  const result={source:origin,readAt:new Date().toISOString(),assetCount:seen.size,bytes,snippets};
  fs.mkdirSync('research',{recursive:true});
  fs.writeFileSync('research/protocol-scan.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
