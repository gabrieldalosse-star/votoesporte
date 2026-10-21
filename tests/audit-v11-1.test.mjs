import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {uniquePeople, normalizeGender, completeVenueDirectory, venueKey} from '../assets/data-integrity.mjs';
const app=fs.readFileSync(new URL('../assets/app.js',import.meta.url),'utf8');
const extract=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));
const wrap=student=>({student});

test('census reconciles legacy and global IDs, accents, dates and transitive duplicates',()=>{
  const rows=[
    {fullName:'Ana Teste',birthDate:'2010-02-03'},
    {globalStudentId:'ALU-1',fullName:' ÁNA   TESTE ',birthDate:'03/02/2010'},
    {globalStudentId:'ALU-2',fullName:'Ana Teste',birthDate:'2010-02-03'},
    {globalStudentId:'ALU-2',fullName:'Nome corrigido',birthDate:'2010-02-03'},
    {fullName:'Ana Teste',birthDate:'2011-02-03'},
  ].map(wrap);
  assert.equal(uniquePeople(rows).length,2);
  assert.ok(uniquePeople(rows)[0].student.globalStudentId);
});

test('missing birthdays do not collapse distinct people or unidentified records',()=>{
  assert.equal(uniquePeople([{globalStudentId:'A',fullName:'Homônimo'},{globalStudentId:'B',fullName:'Homônimo'},{fullName:'Homônimo'},{fullName:'Homônimo'},{}].map(wrap)).length,5);
  assert.equal(uniquePeople([{globalStudentId:'A',fullName:'Nome antigo'},{globalStudentId:'A',fullName:'Nome corrigido'}].map(wrap)).length,1);
});

test('gender normalizes F/M without inferring or changing other categories',()=>{
  for(const [before,after] of [['F','Feminino'],[' f ','Feminino'],['M','Masculino'],['masculino','Masculino'],['FEMININO','Feminino'],['Não informado','Não informado'],['Outro ','Outro '],['','']])assert.equal(normalizeGender(before),after);
});

test('venue directory includes Altos, every catalog place, and locations with no coordinates',()=>{
  const centers=JSON.parse(fs.readFileSync(new URL('../data/votorantim-polos-esportivos.json',import.meta.url))).centers;
  const placesCode=fs.readFileSync(new URL('../assets/censo-v2.js',import.meta.url),'utf8');
  const sandbox={window:{},document:{}};vm.createContext(sandbox);vm.runInContext(placesCode,sandbox);
  const places=Array.from(sandbox.window.CensoV2.places);
  const activities=[{id:'c1',location:'Ginásio Poliesportivo Professor João Carlos de Camargo'},{id:'c2',location:'Núcleo de teste novo',territoryZoneId:'bairro-teste'}];
  const list=completeVenueDirectory(centers,activities,places,[{id:'bairro-teste',name:'Bairro Teste'}]);
  assert.equal(list.filter(c=>c.id==='ginasio-joao').length,1);
  assert.equal(list.find(c=>c.id==='ginasio-joao').neighborhood,'Altos de Votorantim');
  const keys=new Set(list.flatMap(c=>[c.name,...c.aliases].map(venueKey)));
  places.forEach(p=>assert.ok(keys.has(venueKey(p)),p));
  const pending=list.find(c=>c.name==='Núcleo de teste novo');assert.equal(pending.latitude,null);assert.equal(pending.neighborhood,'Bairro Teste');
});

test('a failed or hanging territory file never blocks other datasets or login',async()=>{
  const state={};let cleared=0;
  const context={state,resourceRequests:new Map(),console:{warn(){}},AbortController,setTimeout:()=>1,clearTimeout:()=>{cleared++;},fetch:async url=>{
    if(url.includes('mapa-leve'))throw Error('offline');
    return {ok:true,json:async()=>url.includes('polos-esportivos')?{centers:[{id:'altos'}]}:url.includes('diretorio')?{neighborhoods:[],assignments:[]}:url.includes('cep-bairros')?{postalCodes:{}}:{features:[]}};
  }};
  vm.createContext(context);vm.runInContext(extract('async function fetchJsonResource','function createFirebase')+'\nglobalThis.load=loadBundledTerritoryZones;',context);
  await context.load();assert.equal(state.sportsCenters[0].id,'altos');assert.equal(state.territoryLoadErrors.length,1);assert.equal(cleared,5);
});

test('map selection uses all matching buttons; focus waits for the new map',()=>{
  const selected=[],state={territoryLayer:'neighborhoods',territoryZones:[{id:'altos',name:'Altos de Votorantim'}]};
  const context={state,renderNeighborhoodDirectory:async()=>{},renderTerritory(){},toast(){},
    $$:()=>['altos','centro'].map(id=>({dataset:{id},classList:{toggle:(_,value)=>selected.push([id,value])}}))};
  vm.createContext(context);vm.runInContext(extract('function selectTerritoryZoneFromMap','function filteredTerritoryZones')+'\nglobalThis.select=selectTerritoryZoneFromMap;',context);
  context.select('altos');assert.equal(state.selectedNeighborhood,'Altos de Votorantim');assert.deepEqual(selected,[['altos',true],['centro',false]]);
  assert.match(extract('async function focusSportsCenter','function renderSportsCenterDirectory'),/await state\.territoryMapReady/);
});

test('gender migration updates only current gender and is idempotent (transaction mock)',async()=>{
  const db=new Map([
    ['studentRegistry/A',{gender:'F',fullName:'Pessoa geral',keep:'unchanged'}],
    ['classes/c1/students/s1',{gender:'M',fullName:'Pessoa matrícula',keep:42}],
    ['classes/c1/students/s2',{gender:'Outro',keep:true}],
  ]);
  const node={textContent:''}, state={isAdmin:true,isDemo:false,user:{uid:'admin'}};
  let backups=0,writes=0;
  const snapshot=(path)=>({ref:{path},exists:()=>db.has(path),data:()=>db.get(path)});
  const context={state,normalizeGender,firebase:{db:{}},APP_VERSION:'11.1.0',registryRows:[],document:{getElementById:()=>node},localDate:()=> '2026-10-21',
    collection:(_, ...parts)=>parts.join('/'),
    getDocs:async path=>({docs:path==='classes'?[{id:'c1'}]:[...db.keys()].filter(k=>k.startsWith(path+'/')&&k.split('/').length===path.split('/').length+1).map(snapshot)}),
    downloadBlob:()=>backups++,refreshIndicators:async()=>{},renderDashboard(){},toast(){},friendlyFirebaseError:e=>e.message,
    runTransaction:async(_,callback)=>{const updates=[];let writing=false;const n=await callback({get:async ref=>{assert.equal(writing,false);return snapshot(ref.path);},update:(ref,patch)=>{writing=true;assert.deepEqual(Object.keys(patch),['gender']);updates.push([ref.path,patch]);}});updates.forEach(([path,patch])=>{db.set(path,{...db.get(path),...patch});writes++;});return n;}};
  vm.createContext(context);vm.runInContext(extract('async function runGenderNormalization','async function renderStudentRegistry')+'\nglobalThis.run=runGenderNormalization;',context);
  const button={disabled:false};await context.run(button);
  assert.equal(db.get('studentRegistry/A').gender,'Feminino');assert.equal(db.get('classes/c1/students/s1').gender,'Masculino');assert.equal(db.get('classes/c1/students/s1').keep,42);
  assert.equal(writes,2);assert.equal(backups,1);assert.equal(button.disabled,false);
  await context.run(button);assert.equal(writes,2);assert.equal(backups,1);
  state.isAdmin=false;await assert.rejects(context.run(button),/administração/);
});

test('submit guard prevents repeated saves and releases buttons after errors',async()=>{
  const button={disabled:false,textContent:'Salvar'},form={dataset:{},querySelectorAll:()=>[button]};
  const context={toast(){},friendlyFirebaseError:e=>e.message};vm.createContext(context);
  vm.runInContext(extract('async function runFormSubmission','function toast(')+'\nglobalThis.run=runFormSubmission;',context);
  let release,calls=0;const pending=new Promise(resolve=>{release=resolve;});const event={preventDefault(){},currentTarget:form};
  const first=context.run(event,async()=>{calls++;await pending;throw Error('offline');});
  await context.run(event,async()=>{calls++;});assert.equal(calls,1);assert.equal(button.disabled,true);
  release();await first;assert.equal(button.disabled,false);assert.equal(button.textContent,'Salvar');
});
