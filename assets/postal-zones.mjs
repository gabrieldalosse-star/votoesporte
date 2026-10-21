export function neighborhoodName(value) {
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,' ').trim().replace(/^(jd|jdm) /,'jardim ').replace(/^pq /,'parque ').replace(/^vl /,'vila ').replace(/\s+/g,' ');
}
export function resolvePostalZone(postalCode,neighborhood='',municipality='',directory={},zones=[]) {
  const empty={zone:null,neighborhood:'',candidates:[],outside:false,reason:''};
  if(municipality&&municipality!=='3557006')return {...empty,outside:true,reason:'outside'};
  const code=String(postalCode||'').replace(/\D/g,'');
  if(code.length!==8)return {...empty,reason:'invalid-cep'};
  const record=directory[code];
  if(!record)return {...empty,reason:'unknown-cep'};
  const names=[...new Map((record.localities||[]).map(n=>[neighborhoodName(n.name),n.name])).values()];
  const declared=neighborhoodName(neighborhood),matches=names.filter(name=>neighborhoodName(name)===declared);
  if(declared&&!matches.length)return {...empty,candidates:names,reason:'cep-neighborhood-conflict'};
  const name=matches[0]||(!declared&&names.length===1?names[0]:'');
  if(!name)return {...empty,candidates:names,reason:'ambiguous-cep'};
  const candidates=zones.filter(z=>neighborhoodName(z.name)===neighborhoodName(name));
  const primary=candidates.filter(z=>!z.aliasOnly),zone=(primary.length===1?primary:candidates).length===1?(primary.length===1?primary[0]:candidates[0]):null;
  return zone?{zone,neighborhood:name,candidates:[],outside:false,reason:'matched'}:{...empty,candidates:names,reason:'zone-missing'};
}
export function postalZonePatch(row,directory,zones,{master=false}={}) {
  if(row.city&&neighborhoodName(row.city)!=='votorantim')return {patch:null,reason:'outside'};
  const result=resolvePostalZone(row.postalCode,row.neighborhood,'',directory,zones);
  let desired;
  if(result.zone){const z=result.zone;desired={territoryZoneId:z.id,territoryZoneName:z.name,territorySector:z.sector||'',territorySource:z.sourceVersion||'',geo:{...(row.geo||{}),zoneId:z.id,zoneLabel:z.name,sector:z.sector||'',sourceVersion:z.sourceVersion||'',matchMethod:'cep-cnefe-2022'}};
    if(!row.neighborhood)desired.neighborhood=result.neighborhood;
    if(!master)desired.territoryMatchMethod='cep-cnefe-2022';
  } else {
    // Remove stale automatic classifications, retain unverified manual decisions for review.
    const method=row.geo?.matchMethod||row.territoryMatchMethod;
    if(!['cep-cnefe-2022','cep-reviewed'].includes(method))return {patch:null,reason:result.reason,candidates:result.candidates};
    desired={territoryZoneId:'',territoryZoneName:'',territorySector:'',territorySource:'',geo:{...(row.geo||{}),zoneId:'',zoneLabel:'',sector:'',sourceVersion:'',matchMethod:'not-classified'}};
    if(!master)desired.territoryMatchMethod='not-classified';
  }
  const patch=Object.fromEntries(Object.entries(desired).filter(([k,v])=>JSON.stringify(row[k]??'')!==JSON.stringify(v)));
  return {patch:Object.keys(patch).length?patch:null,reason:result.reason,candidates:result.candidates};
}
