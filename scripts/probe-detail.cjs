'use strict';
const fs=require('node:fs');
(async()=>{
 const urls=['https://magicgarden.gg/version/1517/assets/QuinoaCanvas-CzorzMCH.js','https://magicgarden.gg/version/1517/assets/installPlayerSystems-fLTo4V0u.js'];
 const rows=[];
 for(const url of urls){const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('HTTP '+r.status);const t=await r.text();
  for(const needle of ['QuinoaCommand','sendClaim(','LogItems','LogItem','ClaimDailyQuestReward','ClaimDailyQuestBonus','WaterPlant']){
   let p=-1,k=0;while((p=t.indexOf(needle,p+1))>=0&&k++<10)rows.push({url,needle,offset:p,text:t.slice(Math.max(0,p-650),p+1450)});
  }
 }
 fs.mkdirSync('research',{recursive:true});fs.writeFileSync('research/protocol-detail.json',JSON.stringify({at:new Date().toISOString(),rows},null,2));
 console.log('Inspected declarations:',rows.length);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
