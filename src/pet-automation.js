/** Optional Aries integration and conservative Pet Sell plan.
 * No external Aries code is copied. Aries currently exposes *saved* teams
 * through QWS_PetsService, not Team Builder suggestions. AutoFarm may manage
 * only an explicitly opted-in saved team using its own role recommendations.
 */
function createPetAutomationPolicy() {
  'use strict';
  const arr=x=>Array.isArray(x)?x:[];
  const str=x=>typeof x==='string'&&x.length>0&&x.length<120;
  const normalizeId=x=>typeof x==='string'?x.toLowerCase():'';
  function ariesTeams(service) {
    if(!service||typeof service.getTeams!=='function')return [];
    try {
      const rows=service.getTeams();
      if(!Array.isArray(rows))return [];
      return rows.filter(t=>t&&str(t.id)&&Array.isArray(t.slots)).slice(0,100).map(t=>({
        id:t.id,name:str(t.name)?t.name:'Unbenanntes Aries-Team',
        slots:t.slots.slice(0,3).map(x=>str(x)?x:null),
        serverId:str(t.serverId)?t.serverId:null
      }));
    } catch {return [];}
  }
  function reservedAriesPetIds(service) {
    return new Set(ariesTeams(service).flatMap(t=>t.slots.filter(str).map(normalizeId)));
  }
  function eligibleSell(s,report,config,service,protectedItem) {
    if(!config.petSell||!config.petSellEggs?.length||!s?.inventory?.items)return {pet:null,why:'Kein Pet-Verkauf ohne Schalter und Herkunftsei-Auswahl'};
    if(!report||!Array.isArray(report.profiles)||!Array.isArray(report.decisions))return {pet:null,why:'Pet-Analyse nicht bereit'};
    const protectedAries=reservedAriesPetIds(service);
    const nativeTeams=new Set(arr(s.own?.petTeams).flatMap(t=>arr(t?.members).map(m=>normalizeId(m?.petId)).filter(Boolean)));
    const active=new Set(arr(s.own?.petSlots).map(p=>normalizeId(p?.id)).filter(Boolean));
    const favorites=new Set(arr(s.inventory.favoritedItemIds).map(normalizeId));
    const reportById=new Map(report.profiles.map(p=>[normalizeId(p.id),p]));
    const decisions=new Map(report.decisions.map(d=>[normalizeId(d.id),d]));
    for(const item of s.inventory.items){
      if(item?.itemType!=='Pet'||!str(item.id)||!str(item.petSpecies))continue;
      const id=normalizeId(item.id),profile=reportById.get(id),decision=decisions.get(id);
      if(!profile||!decision||decision.autoSellAllowed===true||decision.kind!=='review'||!profile.sellCandidate)continue;
      if(profile.location!=='Inventar'||profile.protected||profile.protection?.length)continue;
      if(!str(profile.sourceEggId)||!config.petSellEggs.includes(profile.sourceEggId)||profile.sourceEggId!==item.sourceEggId)continue;
      if(!Array.isArray(item.abilities)||!item.abilities.length||item.abilities.some(a=>!str(a)))continue;
      if(!Array.isArray(item.mutations)||item.mutations.length||!Number.isFinite(item.xp)||!Number.isFinite(item.targetScale))continue;
      if(favorites.has(id)||active.has(id)||nativeTeams.has(id)||protectedAries.has(id))continue;
      if(item.locked||item.isLocked||item.protected||item.isProtected||protectedItem?.({},item))continue;
      if(s.heldId===item.id)continue;
      const parent=reportById.get(normalizeId(profile.dominatedBy));
      if(!parent||!parent.metrics||!profile.metrics||parent.id===item.id)continue;
      // The advisor has proved this exact *boost set* is covered by a pet
      // retained for a purpose-built team; this excludes "weak" only by level.
      if(!Object.values(report.teamPlans||{}).some(list=>arr(list).some(m=>normalizeId(m.id)===normalizeId(parent.id))))continue;
      return {pet:item,why:'Max-Level-Boosts von einem reservierten Pet abgedeckt'};
    }
    return {pet:null,why:'Keine sicher übertroffenen, freigegebenen Inventar-Pets'};
  }
  function recommendAriesUpdate(s,report,config,service) {
    if(!config.ariesSync)return {plan:null,why:'Aries-Sync aus'};
    if(!service||typeof service.saveTeam!=='function'||typeof service.isTeamSyncEnabled!=='function'||
      !service.isTeamSyncEnabled())return {plan:null,why:'Aries Team-Service/Synchronisierung nicht bereit'};
    const teams=ariesTeams(service);
    if(!teams.length)return {plan:null,why:'Keine gespeicherten Aries-Teams'};
    if(!Array.isArray(report?.profiles)||!report?.teamPlans)return {plan:null,why:'Pet-Analyse nicht bereit'};
    const owned=new Map(report.profiles.map(p=>[normalizeId(p.id),p.id]));
    const goals=new Set(['sellCrops','afk','hatchQuality','hatchSpeed','plantGrowth','cropQuality','xp','sellPets']);
    for(const rule of arr(config.ariesManagedTeams)){
      if(!str(rule?.teamId)||!goals.has(rule.goal))continue;
      const current=teams.find(t=>t.id===rule.teamId);
      if(!current)continue;
      // Require a server-linked team to ensure Aries actually syncs this
      // template into the game instead of only changing local storage.
      if(!current.serverId)continue;
      const desired=arr(report.teamPlans[rule.goal]).slice(0,3).map(p=>owned.get(normalizeId(p.id))).filter(Boolean);
      if(!desired.length||new Set(desired.map(normalizeId)).size!==desired.length)continue;
      const currentMembers=current.slots.filter(Boolean).map(normalizeId);
      if(JSON.stringify(currentMembers)===JSON.stringify(desired.map(normalizeId)))continue;
      if(desired.some(id=>!owned.has(normalizeId(id))))continue;
      return {plan:{id:current.id,name:current.name,goal:rule.goal,slots:[...desired,...Array(Math.max(0,3-desired.length)).fill(null)],before:current.slots},why:'Aries-Team kann mit eigenen Max-STR-Pets verbessert werden'};
    }
    return {plan:null,why:'Aries-Teams bereits passend oder keine geeigneten eigenen Pets'};
  }
  return {ariesTeams,reservedAriesPetIds,eligibleSell,recommendAriesUpdate};
}
if(typeof module!=='undefined'&&module.exports)module.exports={createPetAutomationPolicy};
