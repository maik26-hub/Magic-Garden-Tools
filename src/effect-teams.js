/* Independent effect-team planner, not an import of Aries' internal builder.
 * Native ability metadata supplies trigger, proc and magnitude. Unknown effects
 * remain separate and are never declared dominated for automated pet selling.
 * Ranking uses full-growth STR; AFK scores are estimates, not lifetime promises.
 */
function createEffectTeamBuilder() {
  'use strict';
  const arr=v=>Array.isArray(v)?v:[], num=v=>typeof v==='number'&&Number.isFinite(v);
  const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
  const id=v=>typeof v==='string'&&v.length>0&&v.length<=128;
  const lower=v=>String(v||'').toLowerCase();
  const human=v=>String(v||'').replace(/([a-z\d])([A-Z])/g,'$1 $2').replace(/_/g,' ');
  const scaled=new Set(['scaleIncreasePercentage','cropSellPriceIncreasePercentage','mutationChanceIncreasePercentage',
    'hungerRestorePercentage','hungerRefundPercentage','hungerDepletionRateDecreasePercentage','petDustIncreasePercentage','plantGrowthReductionMinutes',
    'eggGrowthTimeReductionMinutes','baseMaxCoinsFindable','bonusXp','maxStrengthIncreasePercentage','plantAbilityChanceBoostPercentage']);
  const knownScalar=new Set([...scaled,'sizeIncrease']);
  const procOnly=/^(DoubleHatch(?:II)?|DoubleHarvest|ProduceRefund|PetRefund(?:II)?|SeedFinder(?:I|II|III|IV)|ProduceEater)$/;
  const friendly={SellBoost:'Verkaufsbonus',ProduceRefund:'Ernte zurück',DoubleHarvest:'Doppelernte',EggGrowthBoost:'Brutgeschwindigkeit',
    PlantGrowthBoost:'Pflanzenwachstum',ProduceScaleBoost:'Pflanzengröße',ProduceMutationBoost:'Mutationschance',CoinFinder:'Coins',
    PetXpBoost:'Pet-XP',PetHatchSizeBoost:'Max-STR beim Schlüpfen',PetAgeBoost:'Start-XP beim Schlüpfen',PetMutationBoost:'Pet-Mutationen',
    DoubleHatch:'Doppelte Pets',PetRefund:'Pet-Rückgabe',DustBoost:'Magic Dust',HungerBoost:'Hunger sparen',HungerRestore:'Hunger auffüllen'};
  function stats(p,c) {
    if(!c||!num(c.maxScale)||c.maxScale<=1||!num(c.hoursToMature)||c.hoursToMature<=0||
      !num(p.targetScale)||p.targetScale<1||!num(p.xp)||p.xp<0)return null;
    const max=Math.floor((p.targetScale-1)/(c.maxScale-1)*20+80+1e-9);
    // No arbitrary 100 cap: native hatch boosts may increase the potential.
    if(!Number.isSafeInteger(max)||max<=0||max>1000)return null;
    const progress=Math.min(30,Math.floor(p.xp/(c.hoursToMature*3600)*30+1e-9));
    return {max,current:Math.max(0,max-30)+progress,progress};
  }
  function pets(s,catalogs={}) {
    const out=new Map();
    function add(raw,place) {for(const entry of arr(raw)){
      const outer=entry?.slot||entry, p=obj(outer)?{...outer,...(obj(outer.data)?outer.data:{})}:null;
      if(!p||!id(p.id)||!id(p.petSpecies||p.species)||out.has(lower(p.id)))continue;
      if(place!=='Aktiv'&&p.itemType!=='Pet')continue;
      p.petSpecies=p.petSpecies||p.species;
      out.set(lower(p.id),{...p,location:place,metrics:stats(p,catalogs.pets?.[p.petSpecies])});
    }}
    add(s?.own?.petSlots,'Aktiv'); add(s?.inventory?.items,'Inventar');
    for(const st of arr(s?.inventory?.storages))if(st?.decorId==='PetHutch')add(st.items,'Pet Hutch');
    return [...out.values()];
  }
  function family(ability,definition) {
    const params=definition.baseParameters||{};
    if(arr(params.grantedMutations).length)return 'mutation:'+params.grantedMutations.slice().sort().join('+');
    if(/^SeedFinder/.test(ability))return ability; // different seed pools, not numerical upgrades
    if(ability==='EggGrowthBoostII_NEW')return 'EggGrowthBoost';
    let name=ability.replace(/^(Snowy|Dawn|Amber|Thunder)(?=CoinFinder|PlantGrowthBoost|EggGrowthBoost|PetXpBoost|XpBoost)/,'');
    if(name==='XpBoost')name='PetXpBoost';
    return name.replace(/(IV|III|II|I)$/,'');
  }
  function effect(ability,definition,strength) {
    if(!id(ability)||!obj(definition)||!id(definition.trigger)||!obj(definition.baseParameters)||!num(strength))return null;
    const raw=definition.baseParameters, ratio=strength/100, values={}, vector={};
    const chance=num(definition.baseProbability)?Math.max(0,Math.min(100,definition.baseProbability*ratio))/100:1;
    const cooldown=num(raw.cooldownSeconds)&&raw.cooldownSeconds>0?raw.cooldownSeconds/Math.max(.01,ratio):null;
    const granted=arr(raw.grantedMutations).filter(id), weather=id(raw.requiredWeather)?raw.requiredWeather:null;
    let unsupported=false;
    for(const [k,v]of Object.entries(raw)){
      if(['requiredWeather','grantedMutations','cooldownSeconds'].includes(k))continue;
      if(num(v)&&knownScalar.has(k)){
        const val=scaled.has(k)?v*ratio:v;
        values[k]=val; vector[k]=Math.max(0,val)*chance/(cooldown||1);
      }else unsupported=true;
    }
    if(granted.length||procOnly.test(ability))vector.proc=chance/(cooldown||1);
    const keys=Object.keys(vector);
    const base=family(ability,definition);
    // Parameter signature prevents accidental comparison across changed units.
    const key=base+'|'+definition.trigger+'|'+(weather||'Any')+'|'+keys.sort().join(',');
    return {ability,key,family:base,trigger:definition.trigger,weather,name:friendly[base]||definition.name||human(base),
      label:definition.name||human(ability),chance,values,vector,granted,cooldown,
      known:!unsupported&&keys.length>0, strength, score:Object.values(vector).reduce((a,b)=>a+b,0),
      passive:definition.trigger==='continuous'&&!weather};
  }
  function signature(s,catalogs) {
    // XP/hunger only affect display; structural updates and catalogue values rebuild teams.
    return JSON.stringify([pets(s,catalogs).map(p=>[p.id,p.petSpecies,p.name,p.targetScale,p.abilities,p.mutations,p.location])
      .sort((a,b)=>String(a[0]).localeCompare(String(b[0]))),catalogs.pets||null,catalogs.abilities||null]);
  }
  function build(s,catalogs={},previous=[]) {
    const owned=pets(s,catalogs), groups=new Map(),byId=new Map(),unknown=[];
    for(const p of owned){
      p.effects=new Map();p.unknown=!p.metrics||!Array.isArray(p.abilities)||!p.abilities.length;
      if(p.metrics)for(const ability of arr(p.abilities)){
        const e=effect(ability,catalogs.abilities?.[ability],p.metrics.max);
        if(!e){p.unknown=true;continue;}
        if(!e.known)p.unknown=true;
        const old=p.effects.get(e.key);if(!old||old.score<e.score)p.effects.set(e.key,e);
        let g=groups.get(e.key);
        if(!g){g={...e,members:[]};groups.set(e.key,g);}
      }
      if(p.unknown)unknown.push(p.id);byId.set(lower(p.id),p);
    }
    for(const p of owned)for(const [key,e]of p.effects)groups.get(key).members.push({p,e});
    const plans=[];
    const prior=new Map(arr(previous).map(t=>[t.key,arr(t.petIds).map(lower)]));
    const unwanted=(p,g)=>[...p.effects.values()].some(e=>e.granted.includes('Gold')&&!g.granted.includes('Gold'))?1:0;
    function ranking(g,mode='active'){
      const old=new Set(prior.get(g.key+'#'+mode)||[]);
      return g.members.slice().sort((a,b)=>b.e.score-a.e.score||unwanted(a.p,g)-unwanted(b.p,g)||
        b.p.metrics.max-a.p.metrics.max||Number(old.has(lower(b.p.id)))-Number(old.has(lower(a.p.id)))||a.p.id.localeCompare(b.p.id));
    }
    const support=p=>[...p.effects.values()].filter(e=>e.passive&&/^(HungerRestore|HungerBoost)/.test(e.family));
    const supportScore=p=>support(p).reduce((v,e)=>v+e.score,0);
    function add(g,mode,chosen){
      if(!chosen.length)return;
      const key=g.key+'#'+mode;
      const members=chosen.map(x=>x.p||x),known=members.every(p=>!p.unknown);
      plans.push({key,effect:g.key,family:g.family,name:g.name+(g.weather?' · '+g.weather:'')+(mode==='afk'?' · AFK':''),
        mode,trigger:g.trigger,weather:g.weather,petIds:members.map(p=>p.id),known,
        score:members.reduce((v,p)=>v+(p.effects.get(g.key)?.score||0),0),
        maxStrengths:members.map(p=>p.metrics.max),
        details:members.map(p=>({id:p.id,name:p.name||catalogs.pets?.[p.petSpecies]?.name||human(p.petSpecies),
          species:p.petSpecies,location:p.location,max:p.metrics.max,abilities:arr(p.abilities).map(a=>catalogs.abilities?.[a]?.name||human(a))})),
        trainingSlot:g.family==='PetXpBoost',sustainScore:members.reduce((v,p)=>v+supportScore(p),0),
        note:mode==='afk'?'Passive Kombination mit Hunger-Unterstützung; keine Garantie für unbegrenzte Laufzeit.':
          (known?'Vergleich aus nativen Fähigkeiten bei Max-STR.':'Neue/unklare Effekte: vorläufige Empfehlung, kein Auto-Sell darauf.')});
    }
    for(const g of [...groups.values()].sort((a,b)=>a.key.localeCompare(b.key))){
      const limit=g.family==='PetXpBoost'?2:3;
      const ranked=ranking(g),chosen=ranked.slice(0,limit);
      add(g,'active',chosen);
      // Each AFK candidate is a whole combination, not two effects + a blind filler.
      if(!g.passive||!ranked.length)continue;
      const pool=new Map(ranked.slice(0,6).map(x=>[lower(x.p.id),x.p]));
      for(const p of owned.filter(p=>p.metrics&&supportScore(p)>0).sort((a,b)=>supportScore(b)-supportScore(a)||b.metrics.max-a.metrics.max).slice(0,4))pool.set(lower(p.id),p);
      const list=[...pool.values()],size=Math.min(limit,list.length);let best=null;
      function search(start,combo){
        if(combo.length===size){
          const utility=combo.reduce((a,p)=>a+(p.effects.get(g.key)?.score||0),0);
          const sustain=combo.reduce((a,p)=>a+supportScore(p),0);
          if(!utility||!sustain)return;
          const old=new Set(prior.get(g.key+'#afk')||[]);
          const score=[sustain,utility,-combo.reduce((a,p)=>a+unwanted(p,g),0),combo.filter(p=>old.has(lower(p.id))).length];
          if(!best||score.some((v,i)=>v!==best.score[i]&&score.slice(0,i).every((x,j)=>x===best.score[j])&&v>best.score[i]))best={members:combo.slice(),score};
          return;
        }
        for(let i=start;i<list.length;i++){combo.push(list[i]);search(i+1,combo);combo.pop();}
      }
      search(0,[]);if(best)add(g,'afk',best.members);
    }
    // Cross-effect teams for abilities that all fire on the SAME action.
    // The same pet contributes its full set of rolled abilities, so one pet
    // carrying two useful hatch boosts may free a slot for a third boost.
    // Normalizing within each family avoids bonusXp (thousands) drowning out
    // maxStrengthIncreasePercentage (single-digit %).
    const comboDefs=[
      {id:'hatch',name:'Eier öffnen · Qualitäts-Kombi',trigger:'hatchEgg',mode:'active',
        families:['PetHatchSizeBoost','DoubleHatch','PetMutationBoost','PetAgeBoost'],
        weights:[5,4,2.75,2]},
      {id:'cropSale',name:'Pflanzen verkaufen · Bonus-Kombi',trigger:'sellAllCrops',mode:'active',
        families:['SellBoost','ProduceRefund'],weights:[4,3]},
      {id:'petSale',name:'Pets verkaufen · Bonus-Kombi',trigger:'sellPet',mode:'active',
        families:['DustBoost','PetRefund'],weights:[4,2.5]},
      {id:'growEggs',name:'AFK · Pflanzen & Eier',trigger:'continuous',mode:'afk',
        families:['PlantGrowthBoost','EggGrowthBoost'],weights:[4,4]},
      {id:'coinsXp',name:'AFK · Coins & Pet-XP',trigger:'continuous',mode:'afk',
        families:['CoinFinder','PetXpBoost','ProduceEater'],weights:[4,3,2]}
    ];
    function comboEffect(p,d,family){
      return [...p.effects.values()].filter(e=>e.family===family&&e.trigger===d.trigger&&
        !e.weather&&e.known&&(d.mode!=='afk'||e.passive))
        .sort((a,b)=>b.score-a.score)[0]||null;
    }
    function buildCombo(d){
      const safe=owned.filter(p=>p.metrics&&!p.unknown);
      const families=d.families.map((family,i)=>({family,weight:d.weights[i],
        members:safe.map(p=>({p,e:comboEffect(p,d,family)}))
          .filter(x=>x.e&&x.e.score>0)
          .sort((a,b)=>b.e.score-a.e.score||b.p.metrics.max-a.p.metrics.max)}))
        .filter(f=>f.members.length);
      // A single boost family is already managed by the regular effect team.
      if(families.length<2)return;
      const peaks=new Map(families.map(f=>[f.family,f.members[0].e.score]));
      const pool=new Map();
      for(const f of families)for(const {p}of f.members.slice(0,6))pool.set(lower(p.id),p);
      if(d.mode==='afk')for(const p of safe.filter(p=>supportScore(p)>0)
        .sort((a,b)=>supportScore(b)-supportScore(a)||b.metrics.max-a.metrics.max).slice(0,5))pool.set(lower(p.id),p);
      const current=prior.get('combo:'+d.id+'#'+d.mode)||[];
      for(const id of current){const candidate=safe.find(p=>lower(p.id)===id);if(candidate)pool.set(id,candidate);}
      const candidates=[...pool.values()].slice(0,26);
      if(!candidates.length)return;
      const count=Math.min(3,candidates.length),attenuation=[1,.45,.20];
      function measure(team){
        let diversity=0,utility=0;
        for(const f of families){
          const values=team.map(p=>comboEffect(p,d,f.family))
            .filter(Boolean).map(e=>e.score/peaks.get(f.family)).sort((a,b)=>b-a);
          if(values.length)diversity++;
          utility+=f.weight*values.reduce((sum,v,i)=>sum+v*(attenuation[i]||0),0);
        }
        const sustain=team.reduce((sum,p)=>sum+supportScore(p),0);
        if(diversity<2||(d.mode==='afk'&&sustain<=0))return null;
        const carry=team.filter(p=>current.includes(lower(p.id))).length;
        const maxStr=team.reduce((sum,p)=>sum+p.metrics.max,0);
        // In AFK mode a real feeding ability is required and rewards a
        // sustainable composition; this is a heuristic, not an AFK guarantee.
        const score=utility*(d.mode==='afk'?1+Math.min(.5,sustain*.07):1);
        return {score,diversity,sustain,carry,maxStr};
      }
      let best=null;
      function visit(start,team){
        if(team.length===count){
          const result=measure(team);if(!result)return;
          if(!best||result.score>best.result.score+1e-9||
            (Math.abs(result.score-best.result.score)<=1e-9&&
              (result.carry>best.result.carry||
                (result.carry===best.result.carry&&result.maxStr>best.result.maxStr))))
            best={members:team.slice(),result};
          return;
        }
        for(let i=start;i<candidates.length;i++){
          team.push(candidates[i]);visit(i+1,team);team.pop();
        }
      }
      visit(0,[]);if(!best)return;
      const members=best.members;
      const comboKey='combo:'+d.id+'#'+d.mode;
      const detail=members.map(p=>({id:p.id,name:p.name||catalogs.pets?.[p.petSpecies]?.name||human(p.petSpecies),
        species:p.petSpecies,location:p.location,max:p.metrics.max,
        abilities:arr(p.abilities).map(a=>catalogs.abilities?.[a]?.name||human(a))}));
      const contributions=families.map(f=>({family:f.family,label:friendly[f.family]||human(f.family),weight:f.weight,
        pets:members.filter(p=>!!comboEffect(p,d,f.family)).map(p=>p.id)}));
      plans.push({key:comboKey,effect:comboKey,family:'Combo'+d.id,name:d.name,
        mode:d.mode,trigger:d.trigger,weather:null,petIds:members.map(p=>p.id),known:true,
        score:Math.round(best.result.score*1000)/1000,maxStrengths:members.map(p=>p.metrics.max),
        details:detail,contributions,combo:true,trainingSlot:false,
        sustainScore:best.result.sustain,
        note:'Kombiniert '+families.map(f=>friendly[f.family]||human(f.family)).join(' + ')+
          '. Ein Pet mit mehreren passenden Fähigkeiten zählt für jede davon.'+
          (d.mode==='afk'?' AFK/Hunger sind Schätzwerte, keine Laufzeitgarantie.':'')});
    }
    for(const d of comboDefs)buildCombo(d);
    const reserved=new Set(plans.flatMap(t=>t.petIds.map(lower)));
    function covers(better,worse){
      if(better.unknown||worse.unknown||!worse.effects.size)return false;
      for(const [k,e]of worse.effects){
        const b=better.effects.get(k);if(!b||!b.known||!e.known)return false;
        if(Object.entries(e.vector).some(([x,v])=>b.vector[x]===undefined||b.vector[x]+1e-9<v))return false;
      }
      return true;
    }
    const retained=owned.filter(p=>reserved.has(lower(p.id)));
    const decisions=owned.map(p=>{
      if(reserved.has(lower(p.id)))return {id:p.id,kind:'keep',reason:'Für ein Effekt- oder AFK-Team reserviert.'};
      if(p.unknown)return {id:p.id,kind:'unknown',reason:'Max-STR oder einzelne Fähigkeiten fehlen bzw. sind nicht sicher vergleichbar.'};
      const replacement=retained.find(q=>q.id!==p.id&&covers(q,p));
      return replacement?{id:p.id,kind:'surplus',replacement:replacement.id,reason:'Bei Max-STR vollständig durch '+(replacement.name||replacement.petSpecies)+' abgedeckt.'}:
        {id:p.id,kind:'keep',reason:'Keine vollständige bessere Abdeckung dieser Fähigkeiten vorhanden.'};
    });
    return {ready:!!catalogs.pets&&!!catalogs.abilities,plans,decisions,unknown,reserved:[...reserved],
      owned:owned.map(({effects,...p})=>p),message:!catalogs.pets?'Pet-Katalog fehlt':!catalogs.abilities?'Fähigkeitenkatalog fehlt':
        owned.length?plans.length+' Effekt-/AFK-Teams berechnet':'Noch keine eigenen Pets vorhanden'};
  }
  return {stats,pets,effect,signature,build};
}
if (typeof module !== 'undefined' && module.exports) module.exports={createEffectTeamBuilder};
