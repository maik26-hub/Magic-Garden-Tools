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
    if(!text(pet.sourceEggId))reasons.push('Herkunftsei unbekannt');
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
        mutations:arr(pet.mutations).filter(text),abilities:report.abilities,
        abilityNames:report.abilityNames,now:report.now,future:report.future,metrics:report.metrics,
        rated:report.rated,hunger:finite(pet.hunger)?pet.hunger:null,
        teamMember:teamRefs.has(pet.id),protected:reasons.length>0,protection:reasons
      });
    }
    // Unknown strength / unrecognized abilities are not silently rated as zero.
    const eligible=profiles.filter(p=>p.rated).sort((a,b)=>
      b.now.score-a.now.score||b.future.score-a.future.score||a.name.localeCompare(b.name,'de'));
    const recommendations=eligible.slice(0,3);
    const reviews=[];
    for(const candidate of profiles){
      if(candidate.location!=='Inventar'||candidate.protected||!candidate.metrics||
         !candidate.abilities.length)continue;
      const peer=profiles.find(other=>
        other.id!==candidate.id&&other.species===candidate.species&&
        other.sourceEggId===candidate.sourceEggId&&other.sourceEggId!==null&&
        other.metrics&&other.metrics.current>=candidate.metrics.current&&
        other.metrics.max>=candidate.metrics.max&&
        (other.metrics.current>candidate.metrics.current||other.metrics.max>candidate.metrics.max)&&
        JSON.stringify([...other.abilities].sort())===JSON.stringify([...candidate.abilities].sort())&&
        JSON.stringify([...other.mutations].sort())===JSON.stringify([...candidate.mutations].sort()));
      if(peer)reviews.push({id:candidate.id,name:candidate.name,reason:'Schwächeres identisches Duplikat als '+peer.name,
        comparedTo:peer.id});
    }
    return {goal:actualGoal,goalName:goals.find(g=>g.id===actualGoal).name,weather,
      count:profiles.length,locations:{
        active:profiles.filter(x=>x.location==='Aktiv').length,
        inventory:profiles.filter(x=>x.location==='Inventar').length,
        hutch:profiles.filter(x=>x.location==='Pet Hutch').length
      },
      profiles,recommendations:recommendations.map(p=>p.id),
      reviews,readOnly:true,coverage:profiles.filter(x=>x.rated).length,
      notice:'Relative, nicht garantierte Team-Bewertung. Verkaufsvorschläge sind nur zur manuellen Prüfung.'
    };
  }
  return {goals,analyze,abilityGroup,strength};
}
if(typeof module!=='undefined'&&module.exports)module.exports={createPetAdvisor};
