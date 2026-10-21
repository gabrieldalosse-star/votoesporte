/* Censo Esportivo V2 - presentation and catalog compatibility layer. No automatic writes. */
(() => {
 const activities = [["3ª IDADE", "Atividades recreativas para 3ª idade"], ["BMX", "Bicicross"], ["CAM", "Caminhada"], ["DES_INF", "Desenvolvimento motor na infância"], ["FUT_MISTO", "Futebol misto"], ["FUTS_MISTO_INF", "Futsal misto infantil"], ["GIN_3ª", "Ginástica para 3ª idade"], ["GIN_FUNC", "Ginástica funcional"], ["HAND_JUV", "Handebol juvenil (13 a 17 anos)"], ["INC_ESP", "Iniciação esportiva"], ["JUDO", "Judô"], ["KAR", "Karatê"], ["MAT_PIL", "Mat Pilates"], ["MIN_BOL", "Minobol (3ª idade)"], ["MINI_HAND", "Mini-handebol"], ["NAT", "Natação (6 a 15 anos)"], ["RIT", "Ritmos"], ["T_MESA", "Tênis de mesa"], ["VOL_INI_FEM", "Vôlei feminino iniciação 13 a 15 anos"], ["VOL_FEM", "Vôlei feminino iniciação (adultos)"], ["VOL_INI_MAS", "Vôlei masculino iniciação 13 a 15 anos"], ["VOL_MIS", "Vôlei misto iniciação 7 a 12 anos"], ["VOT_ZEN", "Projeto Votorantim Zen"], ["YOG", "Yoga"], ["HAND_MIR", "Handebol mirim (11 e 12 anos)"], ["HAND_FAM", "Handfamília"], ["GUER_FUT_FEM", "Guerreiras Futsal Feminino"], ["FUT_INST", "Futebol Instituto Viver e Evoluir"], ["BAS_3X3_INST", "Basquete 3 x 3 Instituto Viver e Evoluir"], ["BAS_INI_INST", "Basquete Iniciação Instituto Viver e Evoluir"]];
 const places = ["Associação Amigos de Bairro Jardim Serrano", "Campo da Vila Garcia", "Campo da Vila Nova", "Campo do Angelo Vial", "Campo do Cermag", "Campo do Cruzeiro", "Campo do Flamengo", "Campo do Parque Bela Vista", "Campo society do Parque Jataí", "Centro Comunitário Orlando Honório Pereira — Parque Bela Vista", "Centro Comunitário Claudinéia Correia — Vila Garcia", "Centro de Artes e Esporte — Céu das Artes", "Centro de Atenção Psicossocial — CAPES", "Centro de Treinamento de Tênis de Mesa", "Centro Esportivo e Educacional Antonio Poli — Vila Nova", "Centro Esportivo Recreativo Municipal Aldovir Gori — Cermag", "EMEIEF Professor Cândido dos Santos", "Espaço Jovem Jardim Toledo — Centro Comunitário Vital de Oliveira", "Espaço Jovem Vossoroca — Centro Comunitário", "Estádio Municipal Paulo Mitidieri", "Ginásio Poliesportivo Professor João Carlos de Camargo", "Ginásio Poliesportivo Willian de Souza Ferreira", "Lar Escola Monteiro Lobato", "Pista de Bicicross Lucas Furlani de Almeida", "PROAME Vila Garcia", "Sesi de Votorantim", "UPA Vila Garcia"];
 const $ = (s,root=document) => root.querySelector(s);
 const $$ = (s,root=document) => [...root.querySelectorAll(s)];
 const field = (form,name) => form.querySelector(`[name="${name}"]`);
 function option(select,value,label){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}
 function selectValue(select,value){if(value && ![...select.options].some(o=>o.value===value))option(select,value,`${value} (cadastro anterior)`);select.value=value||'';}
 function openClass(form,item){
  const sport=field(form,'sport'),loc=field(form,'location');
  sport.replaceChildren(); option(sport,'','Selecione uma atividade');activities.forEach(([id,name])=>option(sport,name,`${id} · ${name}`));
  loc.replaceChildren();option(loc,'','Selecione um local');places.forEach((name)=>option(loc,name,name));
  selectValue(sport,item?.sport);selectValue(loc,item?.location);
  $$('#class-days-picker input').forEach(c=>c.checked=false);
  $('#class-time-start').value='';$('#class-time-end').value='';
  const schedule=item?.schedule||'';
  const match=schedule.match(/^(.*?)\s*·\s*(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})$/);
  if(match){const days=match[1].split(/\s*,\s*/);$$('#class-days-picker input').forEach(c=>c.checked=days.includes(c.value));$('#class-time-start').value=match[2];$('#class-time-end').value=match[3];}
  else if(schedule){const note=$('#class-legacy-schedule')||document.createElement('p');note.id='class-legacy-schedule';note.className='fieldset-note';note.textContent=`Horário anterior: ${schedule}. Escolha dias e horários para atualizar.`;$('#class-days-picker').after(note);note.hidden=false;}
  const note=$('#class-legacy-schedule');if(note && match)note.hidden=true;
 }
 function prepareClass(form,values){
  const days=$$('#class-days-picker input:checked').map(c=>c.value);
  const start=$('#class-time-start').value,end=$('#class-time-end').value;
  if(!days.length && !start && !end && values.classId){return null;}
  if(!days.length || !start || !end)return 'Selecione pelo menos um dia e informe início e término.';
  if(start>=end)return 'O horário final deve ser posterior ao horário inicial.';
  values.schedule=`${days.join(', ')} · ${start}–${end}`;
  field(form,'schedule').value=values.schedule;
  return null;
 }
 function openStudent(form){
  const reg=field(form,'registrationDate');if(reg&&!reg.value)reg.value=[new Date().getFullYear(),String(new Date().getMonth()+1).padStart(2,'0'),String(new Date().getDate()).padStart(2,'0')].join('-');
  const city=field(form,'city');if(city&&!city.value)city.value='Votorantim';
 }
 // The form structure belongs to index.html. This compatibility layer must
 // never rearrange it: doing so previously detached the student fields.
 window.CensoV2={openClass,prepareClass,openStudent,places};
})();
