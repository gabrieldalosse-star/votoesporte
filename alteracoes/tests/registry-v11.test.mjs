import {resolvePostalZone} from "../assets/postal-zones.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const app=fs.readFileSync(new URL('../assets/app.js',import.meta.url),'utf8');
const extract=(begin,end)=>app.slice(app.indexOf(begin),app.indexOf(end,app.indexOf(begin)));
function setup(cloud=false){
  const store={students:{a:{},b:{}},studentRegistry:{},classes:{},enrollmentCounters:{},registryCounter:0};
  const db=new Map(), state={isAdmin:true,isDemo:!cloud,user:{uid:'teacher-a'},studentsByClass:{},selectedClassId:null};
  let serial=0, staged=[];
  const sandbox={state,console,Map,Set,Date,Math,Error,JSON,Number,String,RegExp,Object,Array,crypto:webcrypto,TextEncoder,Uint8Array,
    PAGE_TITLES:{},firebase:{db:{}},document:{getElementById:()=>({addEventListener(){}}),addEventListener(){}},
    createId:()=>`student-${++serial}`,serverTimestamp:()=>new Date().toISOString(),
    censoKey:v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase(),
    neighborhoodKey:v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase(),
    buildStudentPayload:f=>({...f,contact:{target:'guardian',permission:'not_informed'}}),
    demoData:()=>structuredClone(store),writeDemoData:data=>{Object.assign(store,structuredClone(data));},
    loadStudents:async id=>cloud?[...db].filter(([k])=>k.startsWith(`classes/${id}/students/`)).map(([k,v])=>({id:k.split('/').at(-1),...structuredClone(v)})):Object.entries(store.students[id]||{}).map(([id,s])=>({id,...structuredClone(s)})),
    observeSelectedStudents(){},doc:(_, ...parts)=>parts.join('/'),
    runTransaction:async (_,action)=>{
      staged=[];let writing=false;
      await action({get:async ref=>{assert.equal(writing,false,'Firestore transaction must read before writing');return {exists:()=>db.has(ref),data:()=>structuredClone(db.get(ref))};},set:(ref,data,opt)=>{writing=true;staged.push([ref,data,opt?.merge]);},update:(ref,data)=>{writing=true;staged.push([ref,data,true]);},delete:ref=>{writing=true;staged.push([ref,null]);}});
      for(const [ref,data,merge]of staged){if(data===null)db.delete(ref);else db.set(ref,{...(merge?db.get(ref):{}),...structuredClone(data)});}
    }
  };
  vm.createContext(sandbox);
  const code=extract('const MASTER_FIELDS =','function subscribeActivityCatalogue()')+'\nglobalThis.save=saveRegisteredStudent;';
  vm.runInContext(code,sandbox);
  return {save:sandbox.save,store,state,db};
}
for(const cloud of [false,true]){
  test((cloud?'cloud':'demo')+': import callback returns committed IDs and codes without changing save return type',async()=>{
    const h=setup(cloud), roster=[];let committed;
    const id=await h.save({classId:'a',fullName:'Aluno Importado',birthDate:'2010-01-01'},{
      roster,onSaved:row=>{committed=row;roster.push(row);}
    });
    assert.equal(typeof id,'string');assert.equal(committed.id,id);
    assert.equal(committed.globalStudentId,'ALU-000001');
    assert.equal(committed.enrollmentCode,'MAT-000001');
    let changed;
    await h.save({classId:'a',studentId:id,fullName:'Aluno Importado',birthDate:'2010-01-01',neighborhood:'Centro'},{
      roster,onSaved:row=>changed=row
    });
    assert.equal(changed.globalStudentId,committed.globalStudentId);
    assert.equal(changed.enrollmentCode,committed.enrollmentCode);
    let notified=false;
    await assert.rejects(h.save({classId:'a',fullName:'Aluno Importado',birthDate:'2010-01-01'},{
      roster,onSaved:()=>notified=true
    }));
    assert.equal(notified,false);
  });
  const mode=cloud?'Firestore transaction mock':'local';
  test(`${mode}: global ID is permanent across classes; enrollment sequences remain separate`,async()=>{
    const h=setup(cloud);
    const first=await h.save({classId:'a',fullName:'Ana Teste',birthDate:'2000-01-01',sport:'Natação'});
    await h.save({classId:'b',fullName:'Ana Teste',birthDate:'2000-01-01',globalStudentId:'ALU-000001'});
    const master=cloud?h.db.get('studentRegistry/ALU-000001'):h.store.studentRegistry['ALU-000001'];
    assert.equal(master.fullName,'Ana Teste');assert.equal(master.sport,undefined);assert.equal(master.classId,undefined);assert.equal(master.enrollmentCode,undefined);
    const a=cloud?h.db.get(`classes/a/students/${first}`):h.store.students.a[first];
    const b=cloud?h.db.get('classes/b/students/g-ALU-000001'):h.store.students.b['g-ALU-000001'];
    assert.equal(a.globalStudentId,b.globalStudentId);assert.equal(a.enrollmentCode,'MAT-000001');assert.equal(b.enrollmentCode,'MAT-000001');
    await assert.rejects(h.save({classId:'b',fullName:'Ana Teste',globalStudentId:'ALU-000001'}),/já tem matrícula/);
    await assert.rejects(h.save({classId:'a',studentId:first,fullName:'Ana Teste',globalStudentId:'ALU-000002'}),/permanente/);
  });
  test(`${mode}: imported codes reserve their sequence and IDs are never reused after deletion`,async()=>{
    const h=setup(cloud);
    await h.save({classId:'a',fullName:'Primeira Pessoa',enrollmentCode:'MAT-001000'});
    const second=await h.save({classId:'a',fullName:'Segunda Pessoa'});
    let row=cloud?h.db.get(`classes/a/students/${second}`):h.store.students.a[second];
    assert.equal(row.enrollmentCode,'MAT-001001');assert.equal(row.globalStudentId,'ALU-000002');
    if(cloud){for(const key of h.db.keys())if(key.startsWith('studentRegistry/')||key.startsWith('studentIdentityIndex/')||key.includes('/students/'))h.db.delete(key);}else{h.store.students.a={};h.store.studentRegistry={};h.store.studentIdentityIndex={};}
    const third=await h.save({classId:'a',fullName:'Terceira Pessoa'});
    row=cloud?h.db.get(`classes/a/students/${third}`):h.store.students.a[third];
    assert.equal(row.enrollmentCode,'MAT-001002');assert.equal(row.globalStudentId,'ALU-000003');
  });
  test(`${mode}: unknown IDs and mismatched identities are rejected without partial writes`,async()=>{
    const h=setup(cloud);
    await assert.rejects(h.save({classId:'a',fullName:'Pessoa',globalStudentId:'ALU-999999'}),/não encontrado/);
    await h.save({classId:'a',fullName:'Ana Teste',birthDate:'2000-01-01'});
    await assert.rejects(h.save({classId:'b',fullName:'Outra Pessoa',globalStudentId:'ALU-000001'}),/não corresponde/);
    await assert.rejects(h.save({classId:'b',fullName:'Ana Teste',birthDate:'2001-01-01',globalStudentId:'ALU-000001'}),/não corresponde/);
    const counter=cloud?h.db.get('registryCounters/students').value:h.store.registryCounter;assert.equal(counter,1);
  });
  test(`${mode}: same name and birth cannot create another person in any class`,async()=>{
    const h=setup(cloud);
    await h.save({classId:'a',fullName:'Ana Maria Teste',birthDate:'2001-02-03'});
    await assert.rejects(h.save({classId:'b',fullName:'ÁNA MARIA TESTE',birthDate:'2001-02-03'}),/Já existe um aluno/);
    const counter=cloud?h.db.get('registryCounters/students').value:h.store.registryCounter;assert.equal(counter,1);
    await h.save({classId:'b',fullName:'Ana Maria Teste',birthDate:'2002-02-03'});
    assert.equal(cloud?h.db.get('registryCounters/students').value:h.store.registryCounter,2);
  });
}
test('215 official sectors are all Votorantim polygons in longitude/latitude',()=>{
  const geo=JSON.parse(fs.readFileSync(new URL('../data/votorantim-setores-ibge-2022.geojson',import.meta.url)));
  assert.equal(geo.features.length,215);assert.equal(new Set(geo.features.map(f=>f.properties.cd_setor)).size,215);
  for(const f of geo.features){assert.equal(f.properties.cd_mun,'3557006');assert.ok(['Polygon','MultiPolygon'].includes(f.geometry.type));const coords=f.geometry.coordinates.flat(Infinity);for(let i=0;i<coords.length;i+=2){assert.ok(coords[i]>-48&&coords[i]<-47);assert.ok(coords[i+1]>-24&&coords[i+1]<-23);}}
});
test('CEP assignment resolves unique locations, respects declared neighborhoods, and rejects outside municipalities',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../data/votorantim-cep-bairros.json',import.meta.url)));
  const main=JSON.parse(fs.readFileSync(new URL('../data/votorantim-bairros-referencia-cnefe-2022.geojson',import.meta.url)));
  const additional=JSON.parse(fs.readFileSync(new URL('../data/votorantim-bairros-complementares.geojson',import.meta.url)));
  const zones=[...main.features,...additional.features].map(f=>f.properties);
  const sandbox={resolvePostalZone,state:{postalDirectory:data.postalCodes,territoryZones:zones},neighborhoodKey:v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()};vm.createContext(sandbox);
  vm.runInContext(extract('function resolvePostalTerritory(','function applyPostalTerritory(')+'\nglobalThis.resolve=resolvePostalTerritory;',sandbox);
  const unique=Object.entries(data.postalCodes).find(([cep,r])=>r.localities.length===1);
  assert.ok(sandbox.resolve(unique[0]).zone);
  const shared=Object.entries(data.postalCodes).find(([cep,r])=>r.localities.length>1);
  assert.equal(sandbox.resolve(shared[0]).zone,null);assert.ok(sandbox.resolve(shared[0]).candidates.length>1);
  const candidate=shared[1].localities[0].name;assert.equal(sandbox.resolve(shared[0],candidate).zone.name,candidate);
  assert.equal(sandbox.resolve(unique[0],'','3552205').zone,null);
  assert.equal(sandbox.resolve('00000000').zone,null);
});
test('all local HTML assets exist and IDs are unique',()=>{
  const root=new URL('../',import.meta.url), html=fs.readFileSync(new URL('index.html',root),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  for(const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)){
    const value=match[1];if(/^(https?:|#|mailto:|tel:|data:)/.test(value))continue;
    assert.ok(fs.existsSync(new URL(value,root)),`Missing local resource: ${value}`);
  }
});
test('sports center directory uses only bounded public positions, with explicit pending points',()=>{
  const directory=JSON.parse(fs.readFileSync(new URL('../data/votorantim-polos-esportivos.json',import.meta.url)));
  assert.equal(directory.centers.length,19);
  const mapped=directory.centers.filter(c=>c.latitude!==null&&c.longitude!==null);assert.equal(mapped.length,18);
  for(const center of mapped){assert.ok(center.latitude>-23.75&&center.latitude<-23.45);assert.ok(center.longitude>-47.6&&center.longitude<-47.2);assert.ok(center.sourceUrl.startsWith('https://www.votorantim.sp.gov.br/'));assert.ok(center.positionSource);}
  assert.equal(directory.centers.find(c=>c.id==='aab-rio-acima').positionStatus,'pending-coordinate');
});
test('neighborhood aggregation preserves every sector exactly once and records mixed areas',()=>{
  const groups=JSON.parse(fs.readFileSync(new URL('../data/votorantim-bairros-referencia-cnefe-2022.geojson',import.meta.url)));
  const directory=JSON.parse(fs.readFileSync(new URL('../data/votorantim-bairros-diretorio.json',import.meta.url)));
  assert.equal(groups.features.length,76);assert.equal(directory.neighborhoods.length,109);
  const codes=groups.features.flatMap(f=>f.properties.sectorCodes);
  assert.equal(codes.length,215);assert.equal(new Set(codes).size,215);
  assert.equal(directory.assignments.reduce((n,a)=>n+a.addressCount,0),57819);
  assert.ok(directory.assignments.some(a=>a.reviewRequired));
  for(const f of groups.features){assert.equal(f.geometry.type,'MultiPolygon');assert.equal(f.properties.boundaryStatus,'reference-area-not-legal-neighborhood-boundary');}
});
test('bulk deletion cancels before writes and keeps the counters and history when confirmed',async()=>{
  const events=[];
  const data={studentRegistry:{'ALU-000041':{globalStudentId:'ALU-000041',fullName:'Pessoa'}},students:{a:{s1:{id:'s1',globalStudentId:'ALU-000041',fullName:'Pessoa'}}},registryCounter:41,enrollmentCounters:{a:57},attendance:{a:{old:{records:{s1:{status:'P'}}}}},occurrences:{o1:{description:'Histórico'}}};
  const sandbox={state:{isAdmin:true,isDemo:true,classes:[{id:'a'}],studentsByClass:{a:[]}},registryRows:Object.values(data.studentRegistry),readRegistry:async()=>{},loadStudents:async()=>Object.values(data.students.a),prompt:()=>'',confirm:()=>true,toast:()=>{},downloadBlob:()=>events.push('backup'),localDate:()=>'2026-10-21',APP_VERSION:'11',repository:{createDeletionAudit:async()=>events.push('audit')},demoData:()=>structuredClone(data),writeDemoData:updated=>{Object.assign(data,updated);events.push('delete');},renderStudentRegistry:async()=>{},renderDashboard:()=>{}};
  vm.createContext(sandbox);vm.runInContext(extract('async function deleteAllStudents() {','function syncReportControls()'),sandbox);
  await vm.runInContext('deleteAllStudents()',sandbox);assert.deepEqual(events,[]);
  sandbox.prompt=()=> 'EXCLUIR TODOS OS ALUNOS';sandbox.confirm=()=>false;
  await vm.runInContext('deleteAllStudents()',sandbox);assert.deepEqual(events,['backup']);assert.equal(Object.keys(data.studentRegistry).length,1);
  events.length=0;sandbox.confirm=()=>true;
  await vm.runInContext('deleteAllStudents()',sandbox);assert.deepEqual(events,['backup','audit','delete']);
  assert.equal(Object.keys(data.studentRegistry).length,0);assert.equal(Object.keys(data.students.a).length,0);
  assert.equal(data.registryCounter,41);assert.equal(data.enrollmentCounters.a,57);assert.ok(data.attendance.a.old);assert.ok(data.occurrences.o1);
});
