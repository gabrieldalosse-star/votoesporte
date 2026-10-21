import {normalizeGender, identityKey} from './data-integrity.mjs';
import {scheduleDays} from './insights.mjs';
export function phoneDigits(value) {
  let d=String(value||'').replace(/\D/g,'');
  if(d.startsWith('0055'))d=d.slice(2);
  if(/^0\d{10,11}$/.test(d))d=d.slice(1);
  if(/^0\d{12,13}$/.test(d))d=d.slice(3); // Brazilian carrier + DDD.
  if(d.length===10||d.length===11)d='55'+d;
  return /^55[1-9]\d(?:[2-5]\d{7}|9\d{8})$/.test(d)?d:'';
}
export function phoneNumbers(value) {
  return [...new Set(String(value||'').split(/\s*(?:\/|;|,|\n|\bou\b)\s*/i).map(phoneDigits).filter(Boolean))];
}
export function displayPhone(d) {const n=d.slice(2);return `(${n.slice(0,2)}) ${n.slice(2,-4)}-${n.slice(-4)}`;}
export function contactNumbers(student) {
  const candidates=[['Responsável',student.guardianPhone||student.contact?.guardianPhone],['Aluno',student.studentPhone||student.contact?.studentPhone],['Alternativo',student.phone||student.contact?.alternatePhone]];
  const result=new Map();for(const [label,value] of candidates)for(const number of phoneNumbers(value)){const prior=result.get(number);if(prior)prior.label+=' / '+label;else result.set(number,{number,label});}return [...result.values()];
}
export function inspectClasses(classes, studentsByClass, masters, users=[],zones=[]) {
  const changes=[],issues=[];const registry=new Map(masters.map(s=>[s.globalStudentId,s]));
  for(const cl of classes){const patch={};for(const f of ['name','sport','location','schedule','teacherName'])if(typeof cl[f]==='string'&&cl[f]!==cl[f].trim()&&cl[f].trim())patch[f]=cl[f].trim();
    const teacher=users.find(u=>u.id===cl.teacherId);if(teacher?.displayName&&teacher.displayName!==cl.teacherName)patch.teacherName=teacher.displayName;
    for(const f of ['name','sport','teacherId'])if(!String(cl[f]||'').trim())issues.push({classId:cl.id,message:`Turma sem ${f}; revisar manualmente.`});
    if(!scheduleDays(cl.schedule).length)issues.push({classId:cl.id,message:'Dias da semana ausentes ou não reconhecidos no horário.'});
    if(cl.territoryZoneId&&!zones.some(z=>z.id===cl.territoryZoneId))issues.push({classId:cl.id,message:'Bairro da turma não encontrado nas referências.'});
    if(Object.keys(patch).length)changes.push({path:`classes/${cl.id}`,before:cl,patch});
    const seen=new Set();for(const s of studentsByClass[cl.id]||[]){const k=s.globalStudentId||identityKey(s);if(k&&seen.has(k))issues.push({classId:cl.id,message:`Possível matrícula repetida: ${s.fullName||s.id}. Nenhuma exclusão automática.`});if(k)seen.add(k);
      const master=registry.get(s.globalStudentId);if(!s.globalStudentId||!master)issues.push({classId:cl.id,message:`${s.fullName||s.id}: vínculo com a base geral ausente; integrar ou revisar.`});
      if(master&&identityKey(master)&&identityKey(s)&&identityKey(master)!==identityKey(s))issues.push({classId:cl.id,message:`${s.globalStudentId}: nome/nascimento divergem da base geral; revisar.`});
      const sp={};if(normalizeGender(s.gender)!==s.gender&&s.gender)sp.gender=normalizeGender(s.gender);
      if(Object.keys(sp).length)changes.push({path:`classes/${cl.id}/students/${s.id}`,before:s,patch:sp});
    }
  }return {changes,issues};
}
export function catalogueEntry(cl) {return {name:cl.name||'',sport:cl.sport||'',location:cl.location||'',schedule:cl.schedule||'',ageGroup:cl.ageGroup||'',territoryZoneId:cl.territoryZoneId||'',teacherName:cl.teacherName||'',active:cl.active!==false};}
