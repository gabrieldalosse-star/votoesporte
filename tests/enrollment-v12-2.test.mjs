import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {PERSON_FIELDS,flattenPerson,completePerson,fillPersonForm} from '../assets/enrollment-profile.mjs';
const app=fs.readFileSync(new URL('../assets/app.js',import.meta.url),'utf8');
test('nested contact, census, geographic and identity fields all populate',()=>{
 const person=flattenPerson({fullName:'Teste',gender:'F',contact:{target:'student',permission:'both',studentPhone:'15999991234',consentDate:'2026-01-01'},census:{externalCode:'X',reviewStatus:'reviewed'},geo:{zoneId:'zone',matchMethod:'cep-reviewed'}});
 assert.equal(person.studentPhone,'15999991234');assert.equal(person.contactPermission,'both');assert.equal(person.contactTarget,'student');assert.equal(person.contactConsentDate,'2026-01-01');assert.equal(person.censusCode,'X');assert.equal(person.territoryZoneId,'zone');assert.equal(person.gender,'Feminino');
});
test('master data wins while legacy enrollment-only fields fill omissions',()=>{
 const person=completePerson({fullName:'Oficial',contact:{permission:'no_contact'}},[{fullName:'Antigo',school:'Escola antiga',guardianEmail:'teste@example.com',contactPermission:'both',guardianName:'Responsável'}]);assert.equal(person.fullName,'Oficial');assert.equal(person.contactPermission,'no_contact');assert.equal(person.school,'Escola antiga');assert.equal(person.guardianEmail,'teste@example.com');assert.equal(person.guardianName,'Responsável');
});
function form(){return {elements:Object.fromEntries([...PERSON_FIELDS,'classId','studentId','enrollmentCode','enrollmentStatus'].map(k=>[k,{value:k==='classId'?'new-class':k==='enrollmentStatus'?'Ativa':''}])),querySelectorAll:()=>[button]};}let button;
test('filling and replacing a person never copies old class or enrollment identifiers',()=>{
 button={};const f=form();fillPersonForm(f,{fullName:'A',guardianName:'Old',enrollmentCode:'MAT-999999',classId:'old-class'});fillPersonForm(f,{fullName:'B'});assert.equal(f.elements.guardianName.value,'');assert.equal(f.elements.fullName.value,'B');assert.equal(f.elements.classId.value,'new-class');assert.equal(f.elements.enrollmentCode.value,'');assert.equal(f.elements.enrollmentStatus.value,'Ativa');
});
function lookupHarness(getDoc){button={disabled:false};const f=form();f.elements.globalStudentId.value='ALU-000001';const state={sessionRevision:0,classes:[],studentsByClass:{}};let message='';const ctx={state,ui:{'student-form':f,'student-dialog-title':{}},firebase:{db:{}},doc(){},getDoc,fillPersonForm,completePerson,populateTerritoryZoneOptions(){},syncTerritoryFields(){},updateStudentAgePreview(){},setFormMessage:(_,m)=>message=m,friendlyFirebaseError:e=>e.message};vm.createContext(ctx);const start=app.indexOf('async function autofillExistingStudent(');vm.runInContext(app.slice(start,app.indexOf('function openStudentDialog(',start))+';globalThis.fill=autofillExistingStudent;',ctx);return {ctx,f,state,getMessage:()=>message};}
test('lookup fills all available data and unlocks save only after completion',async()=>{
 let release;const {ctx,f}=lookupHarness(()=>new Promise(r=>{release=r;}));const pending=ctx.fill();assert.equal(button.disabled,true);release({data:()=>({fullName:'Cadastro existente',street:'Rua de teste',contact:{guardianPhone:'1533331234',permission:'both'}})});await pending;assert.equal(button.disabled,false);assert.equal(f.elements.guardianPhone.value,'1533331234');assert.equal(f.elements.street.value,'Rua de teste');assert.equal(f.elements.contactPermission.value,'both');
});
test('a late lookup cannot overwrite a different ID typed in the meantime',async()=>{
 let release;const {ctx,f}=lookupHarness(()=>new Promise(r=>{release=r;}));const pending=ctx.fill();f.elements.globalStudentId.value='ALU-000002';release({data:()=>({fullName:'Wrong person'})});await pending;assert.equal(f.elements.fullName.value,'');assert.equal(f.elements.globalStudentId.value,'ALU-000002');
});
test('clearing an ID during a pending lookup releases save and clears the former person',async()=>{
 let release;const {ctx,f,state}=lookupHarness(()=>new Promise(r=>{release=r;}));const pending=ctx.fill();f.elements.globalStudentId.value='';await ctx.fill();assert.equal(state.registryLookupBusy,false);assert.equal(button.disabled,false);release({data:()=>({fullName:'Previous'})});await pending;assert.equal(f.elements.fullName.value,'');
});
test('frequency renders a correction action for the actual attendance class without modifying marks',()=>{
 const state={classes:[{id:'attendance-class'}],selectedClassId:'other-class',studentsByClass:{'attendance-class':[{id:'student-x',fullName:'Teste'}]},attendance:{classId:'attendance-class',date:'2026-10-21',records:{'student-x':{status:'P'}},dirty:true}};
 const ui=new Proxy({}, {get:(target,id)=>target[id]||= {style:{},classList:{toggle(){}}}});const ctx={state,ui,studentIsActive:()=>true,countMarked:()=>1,countPresent:()=>1,countJustified:()=>0,localDate:()=>'',localTime:()=>'',formatDate:s=>s,initials:()=>'',escapeHtml:s=>s,escapeAttr:s=>s,renderJustificationSelect:()=>''};vm.createContext(ctx);const start=app.indexOf('function renderAttendance()');vm.runInContext(app.slice(start,app.indexOf('function updateAttendanceStatus(',start))+';renderAttendance();',ctx);assert.match(ui['attendance-list'].innerHTML,/data-action="edit-student" data-class-id="attendance-class" data-id="student-x"/);assert.equal(state.attendance.records['student-x'].status,'P');assert.equal(state.attendance.dirty,true);
});
