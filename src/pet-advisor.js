/* Read-only Pet Advisor. No commands, no pet sales, no cross-player data.
 * Profile scores are heuristic comparisons, not exact coin/XP predictions.
 * All calculations use the pet's OWN rolled abilities, current XP and max potential.
 */
function createPetAdvisor() {
  'use strict';
  const goals = [
    {id:'sellCrops',name:'Pflanzen verkaufen',description:'Sell Boost und Crop Refund'},
    {id:'afk',name:'AFK / passives Farming',description:'Coin Finder, Hunger und passives XP'},
    {id:'hatchQuality',name:'Bessere Pet-Hatches',description:'Max Strength, Mutation, Double Hatch und Start-XP'},
    {id:'hatchSpeed',name:'Eier schneller ausbrüten',description:'Egg Growth Boost'},
    {id:'plantGrowth',name:'Pflanzenwachstum',description:'Plant Growth Boost'},
    {id:'cropQuality',name:'Größe & Mutationen',description:'Crop Size, Mutation Boost und Granter'},
    {id:'xp',name:'Pets leveln',description:'XP Boost und Hunger-Unterstützung'},
    {id:'sellPets',name:'Pets verkaufen / Magic Dust',description:'Dust Boost und Pet Refund'}
  ];
  const groupWeights = {
    sellCrops:{sellBoost:12,cropRefund:6,doubleHarvest:4,coinFinder:2},
    afk:{coinFinder:9,hungerBoost:7,hungerRestore:6,petXp:4,seedFinder:3,plantGrowth:2},
    hatchQuality:{maxStrength:12,petMutation:10,doubleHatch:10,hatchXp:6,petRefund:1},
    hatchSpeed:{eggGrowth:15,petXp:1,hungerBoost:2},
    plantGrowth:{plantGrowth:15,cropSize:3,weatherMutation:2},
    cropQuality:{cropSize:12,weatherMutation:11,granter:9,plantGrowth:4},
    xp:{petXp:12,hungerRestore:5,hungerBoost:4,hatchXp:2},
    sellPets:{dustBoost:15,petRefund:4}
  };
  const patterns = [
    [/^(?:Snowy|Dawn|Thunder)?CoinFinder/i,'coinFinder'],
    [/^SellBoost/i,'sellBoost'],[/^ProduceRefund$/i,'cropRefund'],
    [/^DoubleHarvest$/i,'doubleHarvest'],[/^DustBoost$/i,'dustBoost'],
    [/^PetRefund/i,'petRefund'],[/^DoubleHatch/i,'doubleHatch'],
    [/^PetHatchSizeBoost/i,'maxStrength'],[/^PetMutationBoost/i,'petMutation'],
    [/^PetAgeBoost/i,'hatchXp'],[/^(?:Snowy|Thunder|Amber)?EggGrowthBoost/i,'eggGrowth'],
    [/^(?:Snowy|Dawn|Amber|Thunder)?PlantGrowthBoost/i,'plantGrowth'],
    [/^(?:Snowy)?(?:ProduceScaleBoost|CropSizeBoost)/i,'cropSize'],
    [/^(?:Snowy|Dawn|Thunder|Amber)?(?:ProduceMutationBoost|CropMutationBoost)|^DawnBoost$|^AmberMoonBoost$|^ThunderBoost$/i,'weatherMutation'],
    [/Granter$|^RainDance$/,'granter'],
    [/^(?:Snowy|Dawn|Thunder|Amber)?(?:PetXpBoost|DawnXpBoost|ThunderXpBoost|AmberXpBoost)/i,'petXp'],
    [/^HungerBoost|^SnowyHungerBoost/i,'hungerBoost'],
    [/^HungerRestore|^SnowyHungerRestore/i,'hungerRestore'],
    [/^SeedFinder/i,'seedFinder']
  ];
  const conditionByAbility = [
    [/^Snowy|^Snow|^Frost/i,['Snow','Winter','Frost']],
    [/^Dawn/i,['Dawn']], [/^Amber/i,['AmberMoon','Amber']],
    [/^Thunder/i,['Thunderstorm','Thunder']]
  ];
  const isObject=x=>x&&typeof x==='object'&&!Array.isArray(x);
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const arr=x=>Array.isArray(x)?x:[];
  const text=x=>typeof x==='string'&&x.length<120?x:'';
  const human=x=>String(x||'').replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/_/g,' ');
  const abilityGroup=id=>patterns.find(([rx])=>rx.test(id))?.[1]||'other';
  const conditional=id=>conditionByAbility.find(([rx])=>rx.test(id))?.[1]||null;
  const permittedWeather=(id,weather)=>{
    const allowed=conditional(id);
    return !allowed||allowed.includes(weather);
  };
  function strength(pet,info) {
    if(!isObject(info)||!finite(info.maxScale)||info.maxScale<=1||
       !finite(info.hoursToMature)||info.hoursToMature<=0||
       !finite(pet.targetScale)||!finite(pet.xp)||pet.xp<0)return null;
    const max=Math.floor(((pet.targetScale-1)/(info.maxScale-1))*20+80);
    if(!Number.isFinite(max)||max<80||max>100)return null;
    const perLevel=Math.floor(3600*info.hoursToMature/30);
    if(perLevel<1)return null;
    const grown=Math.min(30,Math.floor(pet.xp/perLevel));
    const current=max-30+grown;
    return {current,max,base:max-30,progress:grown,stepsRemaining:30-grown,
      xpPerLevel:perLevel,xpToNext:grown===30?0:perLevel-(pet.xp%perLevel)};
  }
  function gather(s) {
    const own=s?.own,inv=s?.inventory;
    if(!isObject(own)||!isObject(inv)||!Array.isArray(inv.items))return [];
    const seen=new Set(),pets=[];
    const add=(items,place)=>{
      for(const item of arr(items)){
        if(!isObject(item)||!text(item.id)||!text(item.petSpecies)||
          seen.has(item.id))continue;
        if(place!=='Aktiv'&&item.itemType!=='Pet')continue;
        seen.add(item.id);
        pets.push({...item,location:place});
      }
    };
    add(own.petSlots,'Aktiv');
    add(inv.items,'Inventar');
    for(const storage of arr(inv.storages)){
      if(storage?.decorId==='PetHutch')add(storage.items,'Pet Hutch');
    }
    return pets;
  }
  function profile(pet,petCatalog,abilityCatalog,goal,weather) {
    const metrics=strength(pet,petCatalog?.[pet.petSpecies]);
    const abilities=arr(pet.abilities).filter(text);
    const weights=groupWeights[goal]||groupWeights.afk;
    const scoreAt=value=>{
      let score=0;
      const highlights=[];
      for(const id of abilities){
        const group=abilityGroup(id),weight=weights[group]||0;
        if(!weight)continue;
        const allowed=permittedWeather(id,weather);
        const strengthFactor=value===null?0:value/100;
        // Tier factor is a planning heuristic, never an asserted game formula.
        const tier=/IV$/.test(id)?1.6:/III$/.test(id)?1.35:/II(?:_NEW)?$/.test(id)?1.15:1;
        const contribution=allowed?weight*strengthFactor*tier:0;
        score+=contribution;
        const detail=abilityCatalog?.[id];
        const baseChance=finite(detail?.baseProbability)?detail.baseProbability:null;
        const chance=baseChance===null||value===null?null:Math.round(baseChance*value)/100;
        highlights.push({id,name:text(detail?.name)||human(id),group,activeInWeather:allowed,
          strength: value,approxChancePercent:chance,weight:contribution});
      }
      return {score:Math.round(score*100)/100,highlights};
    };
    const now=scoreAt(metrics?.current??null);
    const future=scoreAt(metrics?.max??null);
    return {now,future,metrics,abilities,abilityNames:abilities.map(id=>text(abilityCatalog?.[id]?.name)||human(id)),
      rated:!!metrics&&abilities.length>0&&abilities.some(id=>Boolean(weights[abilityGroup(id)]))};
  }
  function protectedReasons(pet,s) {
    const reasons=[];
    const favored=arr(s?.inventory?.favoritedItemIds);
    if(favored.includes(pet.id))reasons.push('Favorit');
    if(pet.locked||pet.isLocked||pet.protected||pet.isProtected)reasons.push('Gesperrt');
    if(pet.location==='Aktiv')reasons.push('Aktives Pet');
    if(pet.location==='Pet Hutch')reasons.push('Im Pet Hutch');
    const teams=arr(s?.own?.petTeams);
    if(teams.some(t=>arr(t?.members).some(m=>m?.petId===pet.id)))reasons.push('Gespeichertes Team');
    if(arr(pet.mutations).length)reasons.push('Mutation');
    const journal=s?.own?.journal?.pets?.[pet.petSpecies];
    if(!isObject(journal)||!Array.isArray(journal.abilitiesLogged)||
      !Array.isArray(journal.variantsLogged))reasons.push('Journal noch unvollständig/unklar');
    else {
      const logged=new Set(journal.abilitiesLogged.map(x=>x?.ability));
      if(arr(pet.abilities).some(a=>!logged.has(a)))reasons.push('Ungesehene Fähigkeit');
      const variants=new Set(journal.variantsLogged.map(x=>x?.variant));
      if(!variants.has('Normal'))reasons.push('Normalvariante im Journal fehlt');
    }
    return reasons;
  }
  // Long-term keep decisions are NOT based on species, rarity, current
  // level, or the egg the pet came from. Evaluate max-level ability coverage
  // across ALL farming team roles. Seasonal abilities get their matching
  // weather when projecting long-term value so Frost pets are never labelled
  // useless just because it is currently sunny.
  const weathers=['Normal','Frost','Dawn','AmberMoon','Thunderstorm'];
  const tierFactor=id=>/IV$/.test(id)?1.6:/III$/.test(id)?1.35:/II(?:_NEW)?$/.test(id)?1.15:1;
  const abilityFamily=id=>id.replace(/(?:IV|III|II|I)(?:_NEW)?$/,'');
  function maxAbilities(pet){
    const result=new Map();
    if(!pet.metrics||!pet.abilities.length)return null;
    for(const id of pet.abilities){
      if(abilityGroup(id)==='other')return null;
      const weather=(conditional(id)||['Normal']).join('/');
      const key=abilityFamily(id)+'@'+weather;
      const power=tierFactor(id)*pet.metrics.max/100;
      result.set(key,Math.max(result.get(key)||0,power));
    }
    return result;
  }
  function dominates(other,candidate){
    if(other.id===candidate.id||!other.metrics||!candidate.metrics)return false;
    const wanted=maxAbilities(candidate),offered=maxAbilities(other);
    if(!wanted?.size||!offered?.size)return false;
    let stronger=false;
    for(const [ability,power] of wanted){
      const better=offered.get(ability);
      if(better===undefined||better+0.000001<power)return false;
      if(better>power+0.000001)stronger=true;
    }
    return stronger;
  }
  function portfolio(profiles,catalogs){
    const perGoal={},reserved=new Set(),bestRoles=new Map();
    for(const goal of goals){
      const candidates=profiles.map(p=>{
        // Score at all relevant weather states; long-term retain is based on
        // the BEST valid condition, not only today's active weather.
        const projected=weathers.map(weather=>
          profile({petSpecies:p.species,targetScale:p.targetScale,
            xp:p.xp,abilities:p.abilities},catalogs.pets,catalogs.abilities,goal.id,weather));
        const best=projected.reduce((a,b)=>
          b.future.score>a.future.score?b:a);
        return {pet:p,potential:best.future.score};
      }).filter(x=>x.pet.metrics&&x.potential>0)
        .sort((a,b)=>b.potential-a.potential||
          b.pet.metrics.current-a.pet.metrics.current||
          a.pet.id.localeCompare(b.pet.id));
      const selected=candidates.slice(0,3);
      perGoal[goal.id]=selected.map(x=>({id:x.pet.id,maxLevelScore:x.potential}));
      for(const x of selected){
        reserved.add(x.pet.id);
        const earlier=bestRoles.get(x.pet.id);
        if(!earlier||x.potential>earlier.score)
          bestRoles.set(x.pet.id,{goal:goal.id,name:goal.name,score:x.potential});
      }
    }
    return {perGoal,reserved,bestRoles};
  }
  function analyze(snapshot,catalogs={},goal='afk') {
    const profiles=[];
    const pets=gather(snapshot);
    const weather=text(snapshot?.game?.weather)||text(snapshot?.game?.weatherWindow?.weatherId)||'Normal';
    const actualGoal=groupWeights[goal]?goal:'afk';
    const teamRefs=new Set(arr(snapshot?.own?.petTeams).flatMap(t=>arr(t?.members).map(m=>m?.petId)));
    for(const pet of pets){
      const report=profile(pet,catalogs.pets,catalogs.abilities,actualGoal,weather);
      const reasons=protectedReasons(pet,snapshot);
      profiles.push({id:pet.id,name:text(pet.name)||text(catalogs.pets?.[pet.petSpecies]?.name)||human(pet.petSpecies),
        species:pet.petSpecies,location:pet.location,sourceEggId:text(pet.sourceEggId)||null,
        targetScale:pet.targetScale,xp:pet.xp,
        mutations:arr(pet.mutations).filter(text),abilities:report.abilities,
        abilityNames:report.abilityNames,now:report.now,future:report.future,metrics:report.metrics,
        rated:report.rated,hunger:finite(pet.hunger)?pet.hunger:null,
        teamMember:teamRefs.has(pet.id),protected:reasons.length>0,protection:reasons
      });
    }
    // Team suggestions can prioritize performance TODAY; the retain/sell
    // decision instead prioritizes fully matured strength in every role.
    const eligible=profiles.filter(p=>p.rated).sort((a,b)=>
      b.future.score-a.future.score||b.now.score-a.now.score||
      a.name.localeCompare(b.name,'de'));
    const recommendations=eligible.slice(0,3);
    const teamPlan=portfolio(profiles,catalogs);
    const decisions=[],reviews=[];
    for(const candidate of profiles){
      const reserve=teamPlan.reserved.has(candidate.id);
      const primary=teamPlan.bestRoles.get(candidate.id)||null;
      const unknown=!candidate.metrics||!candidate.abilities.length||
        candidate.abilities.some(id=>abilityGroup(id)==='other');
      const hardProtection=candidate.protection.filter(reason=>
        reason!=='Journal noch unvollständig/unklar'&&
        reason!=='Ungesehene Fähigkeit'&&
        reason!=='Normalvariante im Journal fehlt');
      const peer=profiles.filter(p=>teamPlan.reserved.has(p.id))
        .find(p=>dominates(p,candidate));
      let kind,reason;
      if(reserve){
        kind='keep';reason='Eines der besten Max-Level-Pets für '+
          (primary?.name||'ein Spezialteam');
      }else if(hardProtection.length){
        kind='keep';reason='Behalten: '+hardProtection.join(', ');
      }else if(unknown){
        kind='review';reason='Max-Level oder individuelle Boosts unklar – nicht automatisch aussortieren';
      }else if(peer){
        kind='review';reason='Max-Level/Boosts werden von '+peer.name+
          ' abgedeckt. Manuell prüfen, bevor du das Pet verkaufst.';
        reviews.push({id:candidate.id,name:candidate.name,reason,
          comparedTo:peer.id,blockedBy:candidate.protection.slice()});
      }else{
        kind='keep';reason='Keine bessere Abdeckung seiner Fähigkeiten in den Spezialteams';
      }
      candidate.decision=kind;
      candidate.decisionReason=reason;
      candidate.bestRole=primary;
      candidate.dominatedBy=peer?.id||null;
      candidate.sellCandidate=kind==='review'&&!!peer;
      candidate.autoSellAllowed=false; // Never send unverified pet-sale commands.
      decisions.push({id:candidate.id,name:candidate.name,kind,reason,
        dominatedBy:peer?.id||null,protected:candidate.protected,
        suggestedSell:!!peer,autoSellAllowed:false});
    }
    return {goal:actualGoal,goalName:goals.find(g=>g.id===actualGoal).name,weather,
      count:profiles.length,locations:{
        active:profiles.filter(x=>x.location==='Aktiv').length,
        inventory:profiles.filter(x=>x.location==='Inventar').length,
        hutch:profiles.filter(x=>x.location==='Pet Hutch').length
      },
      profiles,recommendations:recommendations.map(p=>p.id),
      teamPlans:teamPlan.perGoal,decisions,
      retained:decisions.filter(d=>d.kind==='keep').length,
      pendingReview:decisions.filter(d=>d.kind==='review').length,
      reviews,readOnly:true,coverage:profiles.filter(x=>x.rated).length,
      notice:'Behalten nach Max-Level und individuellen Boosts über alle Teamziele. Verkaufsvorschläge nur manuell – kein Pet-Auto-Sell aktiv.'
    };
  }
  return {goals,analyze,abilityGroup,strength};
}
if(typeof module!=='undefined'&&module.exports)module.exports={createPetAdvisor};
