import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {scheduleDays, filterRows, postalPoints, rank, ageBand, dimensions, createInsights} from '../assets/insights.mjs';
import {uniquePeople} from '../assets/data-integrity.mjs';
const person={globalStudentId:'A',fullName:'Pessoa teste',birthDate:'2000-01-01',gender:'F',postalCode:'18110-000',neighborhood:'Centro'};
const rows=[{student:person,cl:{id:'1',name:'A',sport:'Handebol',schedule:'Seg, Qua · 09:00–10:00'}},{student:{...person},cl:{id:'2',name:'B',sport:'Ginástica',schedule:'Ter, Qui · 08:00–09:00'}},{student:{...person,globalStudentId:'B',fullName:'Outra pessoa',gender:'M',postalCode:'99999-999'},cl:{id:'2',name:'B',sport:'Ginástica',schedule:'Ter, Qui · 08:00–09:00'}}];
test('weekday parsing handles canonical and legacy labels without reading hours as days',()=>{
 for(const [input,expected] of [['Seg, Qua · 09:00–10:00',[0,2]],['segunda e quarta das 9 às 9h45',[0,2]],['terças e quintas',[1,3]],['2ª e 4ª feira',[0,2]],['Segunda a sexta 08h–09h',[0,1,2,3,4]],['sábado e domingo',[5,6]],['09:00–10:00',[]],['terça 8h e quinta 9h',[1,3]],['seg e qua das 8 a 9',[0,2]],['',[]]])assert.deepEqual(scheduleDays(input),expected,input);
});
test('filter enrollments before deduplication preserves a person enrolled on another day',()=>{
 const tuesday=filterRows(rows,{day:'1'});assert.equal(tuesday.length,2);assert.equal(uniquePeople(tuesday).length,2);assert.equal(filterRows(rows,{day:'0',gender:'Feminino',activity:'Handebol'}).length,1);assert.equal(uniquePeople(rows).length,2);
});
test('linked filters combine accent-insensitive categories and search; empty intersection is empty',()=>{
 assert.equal(filterRows(rows,{activity:'ginastica',gender:'Feminino',search:'Pessoa teste'}).length,1);assert.equal(filterRows(rows,{day:'0',activity:'Ginástica'}).length,0);assert.equal(filterRows(rows,{neighborhood:'centro'}).length,3);
});
test('postal map counts one contribution per person and keeps unknown CEPs pending',()=>{
 const directory={'18110000':{latitude:-23.55,longitude:-47.44}};const result=postalPoints(rows,directory);assert.equal(result.total,2);assert.equal(result.points.length,1);assert.equal(result.missing.length,1);assert.equal(result.points[0].cep,'18110000');assert.equal(postalPoints(rows,{}).points.length,0);assert.equal(postalPoints(rows,{'18110000':{latitude:NaN,longitude:0}}).points.length,0);
});
test('coincident CEPs remain separate contributions; source rows are not mutated',()=>{
 const input=[rows[0],{student:{...person,globalStudentId:'C',fullName:'Mais uma'},cl:rows[0].cl}],before=JSON.stringify(input);const result=postalPoints(input,{'18110000':{latitude:-23.55,longitude:-47.44}});assert.equal(result.points.length,2);assert.equal(JSON.stringify(input),before);
});
test('chart totals preserve percentage denominators and normalize gender/status',()=>{
 assert.deepEqual(rank(uniquePeople(rows),'gender'),[['Feminino',1],['Masculino',1]]);assert.equal(rank(rows,'activity').reduce((sum,entry)=>sum+entry[1],0),3);assert.equal(dimensions.status({student:{enrollmentStatus:'Inativa'}}),'Inativa');assert.equal(dimensions.status({student:{enrollmentStatus:'Ativa'}}),'Ativa');
});
test('invalid and future birthdays never produce a valid age band',()=>{
 assert.equal(ageBand({birthDate:'2025-02-31'}),'Não informada');assert.equal(ageBand({birthDate:'2099-01-01'}),'Não informada');assert.equal(ageBand({birthDate:'1960-01-01'},new Date('2026-10-21')),'60+');
});
test('public CEP artifact contains only aggregate references within valid coordinates',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../data/votorantim-cep-coordenadas.json',import.meta.url)));assert.ok(Object.keys(data.postalCodes).length>900);for(const [cep,p] of Object.entries(data.postalCodes)){assert.match(cep,/^\d{8}$/);assert.ok(p.addressCount>=3);assert.ok(p.latitude< -23&&p.latitude> -24);assert.ok(p.longitude< -47&&p.longitude> -48);assert.deepEqual(Object.keys(p).sort(),['addressCount','latitude','longitude']);}
});
test('light neighborhood geometry retains all identities at a smaller payload',()=>{
 const read=n=>fs.readFileSync(new URL('../data/'+n,import.meta.url));for(const [original,light] of [['votorantim-bairros-referencia-cnefe-2022.geojson','votorantim-bairros-mapa-leve.geojson'],['votorantim-bairros-complementares.geojson','votorantim-bairros-complementares-leve.geojson']]){const a=read(original),b=read(light);assert.ok(b.length<a.length*.5);assert.deepEqual(JSON.parse(a).features.map(f=>f.properties.id),JSON.parse(b).features.map(f=>f.properties.id));}
});

function uiHarness(overrides={}) {
 const nodes=new Map(),events={};
 globalThis.document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',replaceChildren(){this.innerHTML='';this.textContent='';}});return nodes.get(id);},addEventListener:(name,fn)=>{events[name]=fn;}};
 const controller=createInsights({getRows:()=>rows,getLoading:()=>false,loadMap:async()=>{throw Error('offline');},loadJSON:async()=>({postalCodes:{}}),...overrides});
 return {controller,nodes,events};
}
test('filter controls, chart legends and list share selection and can be cleared',()=>{
 const {controller,nodes,events}=uiHarness();controller.render();assert.match(nodes.get('censo-filter-summary').textContent,/2 pessoas · 3 matrículas/);
 events.change({target:{dataset:{insightFilter:'day'},value:'0'}});assert.match(nodes.get('censo-filter-summary').textContent,/1 pessoas · 1 matrículas/);assert.match(nodes.get('insight-students').innerHTML,/Pessoa teste/);assert.doesNotMatch(nodes.get('insight-students').innerHTML,/Outra pessoa/);
 events.click({target:{closest:()=>({dataset:{insightDimension:'gender',insightValue:'Masculino'},hasAttribute:()=>false})}});assert.match(nodes.get('censo-filter-summary').textContent,/0 pessoas/);
 events.click({target:{closest:()=>({dataset:{},hasAttribute:name=>name==='data-insight-clear'})}});assert.match(nodes.get('censo-filter-summary').textContent,/2 pessoas · 3 matrículas/);
 controller.reset();assert.equal(nodes.get('insight-students').innerHTML,'');delete globalThis.document;
});
test('rendering escapes student and category input rather than injecting HTML',()=>{
 const {controller,nodes}=uiHarness({getRows:()=>[{student:{...person,fullName:'<img src=x onerror=alert(1)>',neighborhood:'<script>'},cl:rows[0].cl}]});controller.render();assert.match(nodes.get('insight-students').innerHTML,/&lt;img/);assert.doesNotMatch(nodes.get('insight-students').innerHTML,/<img/);assert.match(nodes.get('censo-chart-neighborhood').innerHTML,/&lt;script&gt;/);delete globalThis.document;
});
test('heat load failures offer a retry and do not reject the UI event',async()=>{
 const {controller,nodes}=uiHarness();controller.showHeat();await new Promise(resolve=>setImmediate(resolve));assert.match(nodes.get('heat-status').textContent,/offline/);assert.match(nodes.get('heat-status').textContent,/Atualizar mapa/);controller.reset();delete globalThis.document;
});
test('a pending heat request cannot render after logout',async()=>{
 let release;const {controller,nodes}=uiHarness({loadMap:()=>new Promise(resolve=>{release=resolve;})});controller.showHeat();controller.reset();release();await new Promise(resolve=>setImmediate(resolve));assert.equal(nodes.get('heat-status').textContent,'');delete globalThis.document;
});
test('a student fetch from an ended session cannot repopulate census state',async()=>{
 const app=fs.readFileSync(new URL('../assets/app.js',import.meta.url),'utf8'),source=app.slice(app.indexOf('async function loadStudents('),app.indexOf('async function loadHistory('));
 let release;const state={sessionRevision:0,isDemo:false,classes:[{id:'a'}],studentsByClass:{}};
 const context={state,firebase:{db:{}},collection(){},query(){},orderBy(){},getDocs:()=>new Promise(resolve=>{release=resolve;})};vm.createContext(context);vm.runInContext(source+';globalThis.load=loadStudents;',context);
 const pending=context.load('a');state.sessionRevision++;state.classes=[];release({docs:[{id:'x',data:()=>({fullName:'Previous user data'})}]});await pending;assert.deepEqual(state.studentsByClass,{});
});
