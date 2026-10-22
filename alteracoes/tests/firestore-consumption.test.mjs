import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {catalogueEntry} from '../assets/records-tools.mjs';

const app = fs.readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');
const extract = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
function harness(source, globals) {
  const context = vm.createContext(globals);
  vm.runInContext(source, context);
  return context;
}
function studentsHarness(getDocs) {
  return harness(extract('async function loadStudents(', 'async function loadHistory('), {
    state: {sessionRevision:0, classes:[{id:'a'}], studentsByClass:{}},
    firebase:{db:{}}, collection(){}, query(){}, orderBy(){}, getDocs
  });
}
test('overlapping roster requests share one query; sequential refresh remains fresh', async()=>{
  let calls=0, release;
  const h=studentsHarness(()=>{calls++;return new Promise(resolve=>release=resolve);});
  const a=h.loadStudents('a'), b=h.loadStudents('a');
  assert.equal(calls,1);
  release({docs:[{id:'s',data:()=>({fullName:'Aluno'})}]});
  assert.deepEqual(await a,await b);
  const next=h.loadStudents('a');assert.equal(calls,2);release({docs:[]});await next;
});
test('failed roster request can retry and a removed class cannot be repopulated', async()=>{
  let calls=0;
  const h=studentsHarness(async()=>{if(++calls===1)throw Error('offline');return {docs:[]};});
  await assert.rejects(h.loadStudents('a'),/offline/);
  await h.loadStudents('a');assert.equal(calls,2);
  h.state.classes=[];assert.equal((await h.loadStudents('a')).length,0);
});
test('read-only consumers reuse only the active live roster, and explicit reads still query', async()=>{
  let calls=0;
  const h=studentsHarness(async()=>{calls++;return {docs:[]};});
  h.state.liveStudentsClassId='a';h.state.studentsByClass.a=[{id:'live'}];
  assert.equal((await h.loadStudents('a',{preferLive:true}))[0].id,'live');
  assert.equal(calls,0);
  await h.loadStudents('a');assert.equal(calls,1);
  assert.equal(h.state.studentsByClass.a[0].id,'live');
});

function catalogueHarness(isAdmin=true) {
  const writes=[],batches=[];
  const h=harness(extract('async function syncActivityCatalogue()', 'function subscribeSportsCenters()'), {
    state:{sessionRevision:0,isAdmin,classesReady:true,catalogueReady:true,classes:[],activityCatalogue:[]},
    catalogueEntry, firebase:{db:{}},doc:(_,collection,id)=>id,
    writeBatch:()=>{const ops=[];return {
      set:(id,data)=>ops.push({id,data}),delete:id=>ops.push({id,data:null}),
      commit:async()=>{batches.push(ops);writes.push(...ops);}
    };}
  });
  return {h,writes,batches};
}
test('catalogue does no writes for unchanged public fields and writes only the changed class',async()=>{
  const {h,writes}=catalogueHarness();
  h.state.classes=[{id:'a',name:'A'},{id:'b',name:'B'}];
  h.state.activityCatalogue=h.state.classes.map(cl=>({id:cl.id,...catalogueEntry(cl)}));
  await h.syncActivityCatalogue();assert.equal(writes.length,0);
  h.state.classes[0].studentCount=40;
  await h.syncActivityCatalogue();assert.equal(writes.length,0);
  h.state.classes[0].name='Nova';
  await h.syncActivityCatalogue();assert.equal(writes.length,1);assert.equal(writes[0].id,'a');
  await h.syncActivityCatalogue();assert.equal(writes.length,1);
});
test('catalogue waits for authoritative snapshots; only admins remove stale entries',async()=>{
  for(const admin of [false,true]){
    const {h,writes}=catalogueHarness(admin);
    h.state.activityCatalogue=[{id:'other',name:'Outra turma'}];
    h.state.classesReady=false;await h.syncActivityCatalogue();assert.equal(writes.length,0);
    h.state.classesReady=true;h.state.catalogueReady=false;
    await h.syncActivityCatalogue();assert.equal(writes.length,0);
    h.state.catalogueReady=true;await h.syncActivityCatalogue();
    assert.equal(writes.length,admin?1:0);
  }
});
test('catalogue batches stay bounded and queue changes while a commit is pending',async()=>{
  const {h,batches}=catalogueHarness();
  h.state.classes=Array.from({length:801},(_,i)=>({id:String(i),name:'Turma'}));
  await h.syncActivityCatalogue();
  assert.deepEqual(batches.map(b=>b.length),[400,400,1]);
  let release;const writes=[];
  h.writeBatch=()=>{const ops=[];return {set:(id,data)=>ops.push({id,data}),delete(){},
    commit:()=>{writes.push(...ops);return writes.length===1?new Promise(r=>release=r):Promise.resolve();}};};
  h.state.classes[0].name='Primeiro';
  const first=h.syncActivityCatalogue();
  h.state.classes[0].name='Segundo';
  const second=h.syncActivityCatalogue();
  release();await Promise.all([first,second]);
  assert.deepEqual(writes.map(w=>w.data.name),['Primeiro','Segundo']);
});
test('catalogue retry works after failure and stops later batches after session change',async()=>{
  const {h}=catalogueHarness();h.state.classes=[{id:'a'}];
  h.writeBatch=()=>({set(){},commit:async()=>{throw Error('denied');}});
  await assert.rejects(h.syncActivityCatalogue(),/denied/);
  assert.equal(h.state.catalogueSyncPromise,null);
  let commits=0;
  h.writeBatch=()=>({set(){},commit:async()=>{commits++;h.state.sessionRevision++;}});
  h.state.classes=Array.from({length:401},(_,i)=>({id:String(i)}));
  await h.syncActivityCatalogue();assert.equal(commits,1);
  assert.equal(h.state.activityCatalogue.length,0);
});

test('import reads a roster twice for the whole file and reuses saved identity for repeated lines',async()=>{
  const source=extract('  async importStudents(classId, rows) {','\n};');
  let reads=0, serial=0;const saved=[],rosters=[];
  const h=harness('globalThis.repo={'+source+'};', {
    state:{selectedClassId:null},loadStudents:async()=>{reads++;return [];},
    censoKey:s=>s.toLowerCase()
  });
  h.repo.saveStudent=async(values,options)=>{
    rosters.push(options.roster);saved.push(values);
    options.onSaved({...values,id:values.studentId||String(++serial),globalStudentId:'ALU-000001',enrollmentCode:'MAT-000001'});
  };
  await h.repo.importStudents('a',[{fullName:'Ana'},{fullName:'Ana'},{fullName:'Ana',enrollmentCode:'MAT-000001'}]);
  assert.equal(reads,2);assert.equal(serial,1);
  assert.equal(saved[1].studentId,'1');assert.equal(saved[2].studentId,'1');
  assert.ok(rosters.every(roster=>roster===rosters[0]));
});
test('migration with numbered roster performs no reads or writes',async()=>{
  let reads=0,writes=0;
  const h=harness(extract('const enrollmentMigrations =', '// Included in app.js'), {
    loadStudents:async()=>{reads++;return [];},assignEnrollmentCode:async()=>writes++,renderClasses(){}
  });
  await h.migrateEnrollments('a',[{id:'s',enrollmentCode:'MAT-000001'}]);
  assert.equal(reads,0);assert.equal(writes,0);
});
test('overlapping registry loads share one read and discard results after logout',async()=>{
  let release,calls=0;
  const h=harness(extract('async function readRegistry()', 'async function runGenderNormalization('), {
    state:{isAdmin:true,sessionRevision:0},registryRows:[],firebase:{db:{}},collection(){},
    getDocs:()=>{calls++;return new Promise(r=>release=r);}
  });
  const first=h.readRegistry(),second=h.readRegistry();assert.equal(calls,1);
  release({docs:[{id:'ALU-1',data:()=>({fullName:'Ana'})}]});
  await Promise.all([first,second]);assert.equal(h.registryRows[0].fullName,'Ana');
  const ended=h.readRegistry();h.state.sessionRevision++;h.state.isAdmin=false;h.registryRows=[];
  release({docs:[{id:'ALU-2',data:()=>({fullName:'Sessão anterior'})}]});
  assert.equal((await ended).length,0);assert.equal(h.registryRows.length,0);
});
test('numbering a legacy roster reads it once and keeps transaction counters monotonic',async()=>{
  const db=new Map([['classes/a/students/old',{enrollmentCode:'MAT-000040'}],
    ['classes/a/students/x',{}],['classes/a/students/y',{}]]);
  let reads=0;
  const h=harness(extract('async function assignEnrollmentCode(', 'async function runManagementAction('), {
    state:{},firebase:{db:{}},collection:(_, ...p)=>p.join('/'),doc:(_, ...p)=>p.join('/'),
    getDocs:async()=>{reads++;throw Error('Unexpected collection scan');},serverTimestamp:()=>0,
    runTransaction:async(_,fn)=>fn({
      get:async ref=>({exists:()=>db.has(ref),data:()=>db.get(ref)}),
      set:(ref,value)=>db.set(ref,value),
      update:(ref,value)=>db.set(ref,{...db.get(ref),...value})
    })
  });
  const roster=[{id:'old',enrollmentCode:'MAT-000040'},{id:'x'},{id:'y'}];
  await h.assignEnrollmentCode('a','x',roster);await h.assignEnrollmentCode('a','y',roster);
  assert.equal(reads,0);assert.equal(db.get('classes/a/students/x').enrollmentCode,'MAT-000041');
  assert.equal(db.get('classes/a/students/y').enrollmentCode,'MAT-000042');
});
test('late attendance response cannot overwrite a newly selected date or ended session',async()=>{
  let release, renders=0;
  const h=harness(extract('async function loadAttendance()', 'async function openAttendanceFor('), {
    state:{sessionRevision:0,attendance:{classId:'a',date:'2026-10-01'}},firebase:{db:{}},
    doc(){},getDoc:()=>new Promise(r=>release=r),renderAttendance:()=>renders++,
    structuredClone,localTime:()=>'',toast(){},friendlyFirebaseError:e=>e.message
  });
  const pending=h.loadAttendance();h.state.attendance.date='2026-10-02';
  release({exists:()=>true,id:'2026-10-01',data:()=>({records:{s:{status:'P'}}})});
  await pending;assert.equal(h.state.attendance.date,'2026-10-02');assert.equal(renders,0);
  const ended=h.loadAttendance();h.state.sessionRevision++;
  release({exists:()=>false});await ended;assert.equal(renders,0);
});
