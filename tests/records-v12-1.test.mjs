import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {phoneDigits,phoneNumbers,contactNumbers,displayPhone,inspectClasses,catalogueEntry} from '../assets/records-tools.mjs';
const app=fs.readFileSync(new URL('../assets/app.js',import.meta.url),'utf8');
test('phone normalization preserves DDD and handles country, trunk and carrier prefixes',()=>{
 for(const value of ['(15) 99999-1234','+55 15 99999-1234','0055 15 99999-1234','015999991234','02115999991234'])assert.equal(phoneDigits(value),'5515999991234',value);
 assert.equal(phoneDigits('(15) 3333-1234'),'551533331234');assert.equal(phoneDigits('99999-1234'),'');assert.equal(phoneDigits('123'),'');assert.equal(displayPhone('5515999991234'),'(15) 99999-1234');
});
test('all three contact roles and multiple legacy numbers get distinct usable links',()=>{
 assert.deepEqual(phoneNumbers('(15) 99999-1234 / (15) 3333-1234'),['5515999991234','551533331234']);
 const contacts=contactNumbers({guardianPhone:'15999991234',studentPhone:'+5515999991234',phone:'1533331234'});assert.equal(contacts.length,2);assert.match(contacts[0].label,/Responsável \/ Aluno/);
});
test('contact links render every number with recorded restrictions and escaped labels',()=>{
 const permission=app.slice(app.indexOf('function isContactAllowed('),app.indexOf('function renderTerritoryPill('));
 const render=app.slice(app.indexOf('function renderContactActions('),app.indexOf('function renderAttendance('));
 const esc=s=>String(s).replace(/</g,'&lt;').replace(/"/g,'&quot;');const ctx={contactNumbers,displayPhone,escapeHtml:esc,escapeAttr:esc};vm.createContext(ctx);vm.runInContext(permission+render+';globalThis.render=renderContactActions;',ctx);
 const s={guardianPhone:'15999991234',phone:'1533331234'};const html=ctx.render(s,'');assert.equal((html.match(/https:\/\/wa.me\//g)||[]).length,2);assert.equal((html.match(/tel:\+/g)||[]).length,2);
 assert.doesNotMatch(ctx.render({...s,contact:{permission:'no_contact'}},''),/href=/);assert.doesNotMatch(ctx.render({...s,contactPermission:'call'},''),/wa.me/);
});
const cl={id:'a',name:' Turma A ',sport:'Ginástica',location:'Cermag',teacherId:'u',teacherName:'Nome antigo',schedule:'Seg, Qua · 09:00–10:00'};
const student={id:'s',globalStudentId:'ALU-000001',fullName:'Nome Teste',birthDate:'2000-01-01',gender:'F',enrollmentCode:'MAT-000001'};
test('class scan proposes only deterministic changes and does not mutate source records',()=>{
 const before=JSON.stringify({cl,student}),plan=inspectClasses([cl],{a:[student]},[student],[{id:'u',displayName:'Nome atual'}]);assert.deepEqual(plan.changes[0].patch,{name:'Turma A',teacherName:'Nome atual'});assert.deepEqual(plan.changes[1].patch,{gender:'Feminino'});assert.equal(JSON.stringify({cl,student}),before);
});
test('ambiguous duplicates, missing identity and missing class data are reported without deleting',()=>{
 const plan=inspectClasses([{...cl,name:' ',sport:'',teacherId:'',schedule:''}],{a:[student,{...student,id:'s2'},{id:'s3',fullName:'Sem ID'}]},[]);assert.ok(plan.issues.length>=6);assert.ok(plan.changes.every(c=>!('globalStudentId' in c.patch)&&!('enrollmentCode' in c.patch)&&!('name' in c.patch)));
});
test('repeating a fully corrected scan is idempotent; catalogue excludes private data',()=>{
 const good={...cl,name:'Turma A'},s={...student,gender:'Feminino'};assert.equal(inspectClasses([good],{a:[s]},[s]).changes.length,0);assert.deepEqual(Object.keys(catalogueEntry({...good,students:[s],phone:'secret'})).sort(),['active','ageGroup','location','name','schedule','sport','teacherName','territoryZoneId']);
});
test('only administrators may invoke the correction action',async()=>{
 const start=app.indexOf('async function auditClasses('),end=app.indexOf('async function migrateStudentRegistry(',start);const ctx={state:{isAdmin:false}};vm.createContext(ctx);vm.runInContext(app.slice(start,end)+';globalThis.audit=auditClasses;',ctx);await assert.rejects(ctx.audit({}),/exclusiva/);
});
test('complete registry profile preserves master data, fills missing fields and lists enrollments',async()=>{
 const master={globalStudentId:'ALU-000001',fullName:'Nome oficial',birthDate:'2000-01-01',contact:{permission:'no_contact'}};
 let dialog;const state={isAdmin:true,isDemo:true,sessionRevision:1,classes:[cl],studentsByClass:{a:[{...student,fullName:'Nome antigo',school:'Escola do cadastro',contactPermission:'both'}]}};
 const ctx={state,demoData:()=>({studentRegistry:{'ALU-000001':master}}),loadStudents:async()=>[],normalizeGender:v=>v,formatDate:v=>v,renderContactActions:()=>'',contactPermissionLabel:v=>v,escapeHtml:s=>String(s),escapeAttr:s=>String(s),document:{getElementById:()=>null,createElement:()=>dialog={setAttribute(){},querySelector:()=>({addEventListener(){}}),showModal(){this.open=true;}},body:{appendChild(){}}}};
 vm.createContext(ctx);const start=app.indexOf('async function openRegistryProfile(');vm.runInContext(app.slice(start,app.indexOf('async function auditClasses(',start))+';globalThis.open=openRegistryProfile;',ctx);await ctx.open('ALU-000001');assert.equal(dialog.open,true);for(const text of ['Nome oficial','Escola do cadastro','MAT-000001','Endereço e território','Responsável e contatos','no_contact'])assert.match(dialog.innerHTML,new RegExp(text));assert.equal(master.fullName,'Nome oficial');assert.equal(master.school,undefined);
});
test('a profile requested before logout cannot be shown in the next session',async()=>{
 let release,created=false;const state={isAdmin:true,isDemo:false,sessionRevision:1,classes:[]};const ctx={state,firebase:{db:{}},doc(){},getDoc:()=>new Promise(resolve=>{release=resolve;}),document:{createElement(){created=true;}}};vm.createContext(ctx);const start=app.indexOf('async function openRegistryProfile(');vm.runInContext(app.slice(start,app.indexOf('async function auditClasses(',start))+';globalThis.open=openRegistryProfile;',ctx);const pending=ctx.open('ALU-000001');state.sessionRevision++;state.isAdmin=false;release({data:()=>({fullName:'Antes'})});await pending;assert.equal(created,false);
});
test('correction rechecks concurrent changes, takes backup, releases busy state, and does not delete',async()=>{
 const stripId=({id,...data})=>data;const db=new Map([['classes/a',stripId(cl)],['classes/a/students/s',stripId(student)],['studentRegistry/ALU-000001',stripId(student)],['users/u',{displayName:'Nome atual'}]]);
 // Simulate a class being renamed after the scan; its new value must survive.
 let mutated=false,backups=0;const writes=[];const state={isAdmin:true,user:{uid:'adm'},sessionRevision:1,classes:[cl],territoryZones:[]};
 const ref=path=>({path}),snap=path=>({id:path.split('/').at(-1),ref:ref(path),exists:()=>db.has(path),data:()=>db.get(path)});
 const ctx={state,inspectClasses,catalogueEntry,APP_VERSION:'12.1.0',document:{getElementById:()=>null},firebase:{db:{}},collection:(_, ...p)=>p.join('/'),doc:(_, ...p)=>ref(p.join('/')),serverTimestamp:()=> 'now',localDate:()=> '2026-10-21',downloadBlob:()=>backups++,friendlyFirebaseError:e=>e.message,renderDashboard(){},renderClasses(){},loadStudents:async()=>[],
 getDocs:async path=>({docs:[...db.keys()].filter(k=>k.startsWith(path+'/')&&k.split('/').length===path.split('/').length+1).map(snap)}),escapeHtml:s=>s,
 runTransaction:async(_,fn)=>{if(!mutated){mutated=true;db.set('classes/a',{...stripId(cl),name:'Novo nome concorrente'});}const pending=[];let writing=false;const result=await fn({get:async r=>{assert.equal(writing,false);return snap(r.path);},update:(r,p)=>{writing=true;pending.push([r.path,{...db.get(r.path),...p}]);},set:(r,p)=>{writing=true;pending.push([r.path,p]);}});pending.forEach(([p,v])=>{db.set(p,v);writes.push(p);});return result;}};
 vm.createContext(ctx);const start=app.indexOf('async function auditClasses(');vm.runInContext(app.slice(start,app.indexOf('async function migrateStudentRegistry(',start))+';globalThis.audit=auditClasses;',ctx);
 const b={disabled:false};await ctx.audit(b);assert.equal(backups,1);assert.equal(state.classAuditBusy,false);assert.equal(b.disabled,false);assert.equal(db.get('classes/a').name,'Novo nome concorrente');assert.equal(db.get('classes/a/students/s').gender,'Feminino');assert.equal(db.get('activityCatalogue/a').name,'Novo nome concorrente');assert.match(state.classAuditResult,/concorrentes preservadas/);assert.ok(writes.length>0);
});
