'use strict';
const fs = require('node:fs');
const endpoint = 'https://mg-api.ariedam.fr/data';
(async () => {
  const res = await fetch(endpoint, {signal: AbortSignal.timeout(15000)});
  if (!res.ok) throw new Error('catalog HTTP '+res.status);
  const data = await res.json();
  const result = {schema: 1, fetchedAt: new Date().toISOString(), source: endpoint};
  for (const key of ['plants','pets','items','decor','eggs','mutations','weathers']) {
    if (!data[key] || typeof data[key] !== 'object' || Array.isArray(data[key])) throw new Error('missing catalog '+key);
    result[key] = data[key];
  }
  fs.mkdirSync('src', {recursive:true});
  fs.writeFileSync('src/catalog-data.json', JSON.stringify(result, null, 2)+'\n');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(result).filter(([k])=>!['source','schema','fetchedAt'].includes(k)).map(([k,v])=>[k,{count:Object.keys(v).length,example:Object.entries(v).slice(0,1)}])), null, 2));
})().catch(error => { console.error(error.message); process.exitCode=1; });
