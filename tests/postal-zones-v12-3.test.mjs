import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {resolvePostalZone,postalZonePatch} from '../assets/postal-zones.mjs';
const zones=[{id:'centro',name:'CENTRO',sector:'Bairros',sourceVersion:'CNEFE 2022'},{id:'jardim',name:'JARDIM TESTE',sector:'Bairros',sourceVersion:'CNEFE 2022'}];
const directory={'18110000':{localities:[{name:'CENTRO'}]},'18110001':{localities:[{name:'CENTRO'},{name:'JARDIM TESTE'}]}};
test('shared CEP requires the declared neighborhood; abbreviations and accents match',()=>{
 assert.equal(resolvePostalZone('18110-001','Jd. Teste','',directory,zones).zone.id,'jardim');assert.equal(resolvePostalZone('18110001','','',directory,zones).zone,null);assert.equal(resolvePostalZone('18110001','CENTRO','',directory,zones).zone.id,'centro');
});
test('a known neighborhood never validates an unknown or conflicting CEP',()=>{
 assert.equal(resolvePostalZone('99999999','CENTRO','',directory,zones).reason,'unknown-cep');assert.equal(resolvePostalZone('18110000','Jardim Teste','',directory,zones).reason,'cep-neighborhood-conflict');assert.equal(resolvePostalZone('18110000','CENTRO','3552205',directory,zones).outside,true);assert.equal(resolvePostalZone('','CENTRO','',directory,zones).reason,'invalid-cep');
});
test('verified CEP populates every zone field, with no identity or class changes',()=>{
 const row={postalCode:'18110-000',neighborhood:'Centro',territoryZoneId:'wrong',globalStudentId:'ALU-000001',enrollmentCode:'MAT-000123',geo:{matchMethod:'manual-zone-selection'}};const before=JSON.stringify(row),result=postalZonePatch(row,directory,zones);assert.equal(result.patch.territoryZoneId,'centro');assert.equal(result.patch.geo.zoneId,'centro');assert.equal(result.patch.geo.matchMethod,'cep-cnefe-2022');assert.equal(result.patch.territorySource,'CNEFE 2022');assert.ok(!('globalStudentId'in result.patch));assert.ok(!('enrollmentCode'in result.patch));assert.equal(JSON.stringify(row),before);
});
test('master patches respect the existing Firestore field schema and are idempotent',()=>{
 const row={postalCode:'18110000',neighborhood:'Centro'};const patch=postalZonePatch(row,directory,zones,{master:true}).patch;assert.ok(!('territoryMatchMethod'in patch));assert.equal(postalZonePatch({...row,...patch},directory,zones,{master:true}).patch,null);
});
test('stale automatic zones are cleared while manual unresolved choices remain for review',()=>{
 const row={postalCode:'99999999',neighborhood:'Centro',territoryZoneId:'centro',geo:{matchMethod:'cep-reviewed',zoneId:'centro'}};
 assert.equal(postalZonePatch(row,directory,zones).patch.territoryZoneId,'');assert.equal(postalZonePatch({...row,geo:{matchMethod:'manual-zone-selection'}},directory,zones).patch,null);assert.equal(postalZonePatch({...row,city:'Sorocaba'},directory,zones).reason,'outside');
});
test('empty neighborhoods can be populated only from a single local CEP reference',()=>{
 assert.equal(postalZonePatch({postalCode:'18110000'},directory,zones).patch.neighborhood,'CENTRO');assert.equal(postalZonePatch({postalCode:'18110001'},directory,zones).patch,null);
});
test('every current CNEFE locality maps to at most one unambiguous neighborhood zone',()=>{
 const read=file=>JSON.parse(fs.readFileSync(new URL('../data/'+file,import.meta.url)));const postal=read('votorantim-cep-bairros.json').postalCodes;const zs=[...read('votorantim-bairros-mapa-leve.geojson').features,...read('votorantim-bairros-complementares-leve.geojson').features].map(f=>f.properties);
 let matched=0,missing=0;for(const [cep,record]of Object.entries(postal))for(const {name}of record.localities){const r=resolvePostalZone(cep,name,'',postal,zs);if(r.zone)matched++;else missing++;}assert.ok(matched>1000);assert.equal(missing,0);
});
const app=fs.readFileSync(new URL('../assets/app.js',import.meta.url),'utf8');
const extract=()=>app.slice(app.indexOf('async function repairPostalZones('),app.indexOf('async function auditClasses('));
test('zone repair cannot be invoked by a teacher',async()=>{const ctx={state:{isAdmin:false}};vm.createContext(ctx);vm.runInContext(extract()+';globalThis.repair=repairPostalZones;',ctx);await assert.rejects(ctx.repair({}),/exclusiva/);});
test('repair backs up before writes, preserves concurrent address edits and handles master+enrollment',async()=>{
 const row={postalCode:'18110000',neighborhood:'Centro',globalStudentId:'ALU-000001',fullName:'Teste'};
 const db=new Map([['studentRegistry/ALU-000001',{...row}],['classes/a',{name:'A'}],['classes/a/students/s',{...row}]]);let backed=false,changedAddress=false;
 const snapshot=path=>({id:path.split('/').at(-1),ref:{path},exists:()=>db.has(path),data:()=>db.get(path)});
 const state={isAdmin:true,user:{uid:'adm'},sessionRevision:1,postalDirectory:directory,territoryZones:zones,bundledTerritoryZones:zones,territoryLoadErrors:[],classes:[]};
 const ctx={state,postalZonePatch,loadBundledTerritoryZones:async()=>{},mergeTerritoryZones:()=>zones,firebase:{db:{}},getDocs:async path=>({docs:[...db.keys()].filter(k=>k.startsWith(path+'/')&&k.split('/').length===path.split('/').length+1).map(snapshot)}),collection:(_, ...p)=>p.join('/'),doc:(_, ...p)=>({path:p.join('/')}),downloadBlob:()=>backed=true,APP_VERSION:'12.3.0',localDate:()=>'',serverTimestamp:()=> 'now',registryRows:[],renderDashboard(){},loadStudents:async()=>[],escapeHtml:s=>s,friendlyFirebaseError:e=>e.message,document:{getElementById:()=>null},
 runTransaction:async(_,fn)=>{assert.equal(backed,true);if(!changedAddress){changedAddress=true;db.set('classes/a/students/s',{...row,postalCode:'99999999'});}let writing=false;const pending=[];const result=await fn({get:async ref=>{assert.equal(writing,false);return snapshot(ref.path);},update:(ref,patch)=>{writing=true;pending.push([ref.path,patch]);}});pending.forEach(([p,patch])=>db.set(p,{...db.get(p),...patch}));return result;}};
 vm.createContext(ctx);vm.runInContext(extract()+';globalThis.repair=repairPostalZones;',ctx);const button={disabled:false};await ctx.repair(button);assert.equal(db.get('studentRegistry/ALU-000001').territoryZoneId,'centro');assert.equal(db.get('classes/a/students/s').territoryZoneId,undefined);assert.match(state.postalRepairResult,/1 alterações concorrentes/);assert.equal(state.postalRepairBusy,false);assert.equal(button.disabled,false);
});
