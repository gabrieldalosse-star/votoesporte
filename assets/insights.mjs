import {uniquePeople, normalizeGender} from './data-integrity.mjs';

export const DAYS = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
export const key = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function scheduleDays(schedule) {
  const text=key(schedule).replace(/([2-6])[ªº°]/g,'$1a').replace(/-?feiras?/g,''), patterns=[/\b(seg(?:undas?)?|2a)\b/,/\b(ter(?:cas?)?|3a)\b/,/\b(qua(?:rtas?)?|4a)\b/,/\b(qui(?:ntas?)?|5a)\b/,/\b(sex(?:tas?)?|6a)\b/,/\b(sab(?:ados?)?)\b/,/\b(dom(?:ingos?)?)\b/];
  // Numeric days must be ordinal or followed by feira, never an hour.
  const cleaned=text.replace(/\b\d{1,2}[:h]\d{0,2}\b/g,'');
  const found=patterns.flatMap((p,i)=>p.test(cleaned)?[i]:[]);
  if (found.length===2) {const first=patterns[found[0]].exec(cleaned),last=patterns[found[1]].exec(cleaned);if(first.index<last.index && /^\s*(?:a|ate)\s*$/.test(cleaned.slice(first.index+first[0].length,last.index)))return Array.from({length:found[1]-found[0]+1},(_,i)=>found[0]+i);}
  return found;
}
export function ageBand(s, today=new Date()) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s.birthDate||''))return 'Não informada';
  const d=new Date(s.birthDate+'T12:00:00');if(Number.isNaN(d.getTime())||d.getMonth()+1!==Number(s.birthDate.slice(5,7))||d.getDate()!==Number(s.birthDate.slice(8,10)))return 'Não informada';let age=today.getFullYear()-d.getFullYear();
  if(today.getMonth()<d.getMonth()||(today.getMonth()===d.getMonth()&&today.getDate()<d.getDate()))age--;
  return !Number.isFinite(age)||age<0||age>120?'Não informada':age<=6?'0 a 6':age<=11?'7 a 11':age<=14?'12 a 14':age<=17?'15 a 17':age<=29?'18 a 29':age<=59?'30 a 59':'60+';
}
export const dimensions={neighborhood:r=>r.student.neighborhood||'Não informado',activity:r=>r.cl.sport||'Não informada',gender:r=>normalizeGender(r.student.gender)||'Não informado',age:r=>ageBand(r.student),classes:r=>r.cl.name||'Sem nome',pcd:r=>r.student.pcdStatus||'Não informado',status:r=>['inactive','inativa','inativo','desativado','cancelada'].includes(key(r.student.enrollmentStatus))||r.student.active===false?'Inativa':'Ativa'};
export function filterRows(rows, filters) {
  return rows.filter(r=> (filters.day===''||filters.day==null||scheduleDays(r.cl.schedule).includes(Number(filters.day))) && Object.entries(dimensions).every(([d,fn])=>!filters[d]||key(fn(r))===key(filters[d])) && (!filters.search||key([r.student.fullName,r.student.globalStudentId,r.student.postalCode].join(' ')).includes(key(filters.search))));
}
export function rank(rows, dimension) {
  const counts=new Map();for(const row of rows){const label=dimensions[dimension](row), k=key(label);const item=counts.get(k)||[label,0];item[1]++;counts.set(k,item);}return [...counts.values()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR'));
}
export function postalPoints(rows, directory) {
  const people=uniquePeople(rows), points=[], missing=[];
  for(const row of people){const cep=String(row.student.postalCode||'').replace(/\D/g,'');const p=directory[cep];if(cep.length===8&&p&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180)points.push({latitude:p.latitude,longitude:p.longitude,cep});else missing.push(row);}
  return {points,missing,total:people.length};
}

const colors=['#1463c4','#0c867b','#9054bd','#c57710','#cf4c72','#64748b','#347c9c'];
const esc = s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createInsights({getRows, getLoading, loadJSON, loadMap}) {
  let filters={day:''}, page=0, map=null, layer=null, directory=null, generation=0, mode='heat', active=false;
  const el=id=>document.getElementById(id);
  const selected=()=>filterRows(getRows(),filters);
  function controls(host){if(!host)return;const rows=getRows();host.innerHTML=`<div class="insight-filters"><label>Dia da semana<select data-insight-filter="day"><option value="">Todos os dias</option>${DAYS.map((d,i)=>`<option value="${i}" ${String(i)===filters.day?'selected':''}>${d}</option>`).join('')}</select></label>${[['neighborhood','Bairro'],['activity','Modalidade'],['gender','Sexo']].map(([d,label])=>`<label>${label}<select data-insight-filter="${d}"><option value="">Todos</option>${rank(rows,d).map(([v])=>`<option ${key(filters[d])===key(v)?'selected':''} value="${esc(v)}">${esc(v)}</option>`).join('')}</select></label>`).join('')}<button type="button" class="button button-secondary" data-insight-clear>Limpar filtros</button></div><div class="filter-chips">${Object.entries(filters).filter(([d,v])=>v!==''&&v!=null).map(([d,v])=>`<button type="button" data-insight-remove="${d}">${esc(d==='day'?DAYS[Number(v)]:v)} ×</button>`).join('')}</div>`;}
  function chart(id, dimension, rows){const host=el(id);if(!host)return;const entries=rank(rows,dimension), total=rows.length;
    if(!total){host.innerHTML='<p class="censo-chart-empty">Nenhum cadastro neste filtro.</p>';return;}
    let offset=0;const slices=entries.map(([label,n],i)=>{const pct=n/total*100;const s=`<circle cx="60" cy="60" r="44" fill="none" stroke="${colors[i%colors.length]}" stroke-width="22" pathLength="100" stroke-dasharray="${pct} ${100-pct}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"/>`;offset+=pct;return s;}).join('');
    host.innerHTML=`${entries.length<=7?`<svg class="insight-donut" viewBox="0 0 120 120" role="img" aria-label="${total} registros; percentuais na legenda abaixo">${slices}<text x="60" y="63" text-anchor="middle">${total}</text></svg>`:''}<div class="insight-legend">${entries.map(([label,n],i)=>`<button type="button" data-insight-dimension="${dimension}" data-insight-value="${esc(label)}" aria-pressed="${key(filters[dimension])===key(label)}"><span class="insight-dot" style="background:${colors[i%colors.length]}"></span><span>${esc(label)}</span><strong>${n} <small>${(n/total*100).toLocaleString('pt-BR',{maximumFractionDigits:1})}%</small></strong></button>`).join('')}</div>`;
  }
  function renderList(rows){const host=el('insight-students');if(!host)return;const people=uniquePeople(rows);page=Math.min(page,Math.max(0,Math.ceil(people.length/30)-1));host.innerHTML=`<div class="panel-heading"><div><h3>Alunos encontrados · ${people.length}</h3><p>Dia corresponde ao horário da turma, não à presença registrada. Lista restrita ao seu acesso.</p></div><label>Buscar nome, ID ou CEP<input data-insight-search value="${esc(filters.search||'')}" placeholder="Digite e pressione Enter" type="search"/></label></div><div class="insight-table"><table><thead><tr><th>Aluno</th><th>ID</th><th>Bairro</th><th>CEP</th><th>Turma neste filtro</th></tr></thead><tbody>${people.slice(page*30,page*30+30).map(({student:s,cl})=>`<tr><td>${esc(s.fullName||'Sem nome')}</td><td>${esc(s.globalStudentId||'Pendente')}</td><td>${esc(s.neighborhood||'Não informado')}</td><td>${esc(s.postalCode||'Não informado')}</td><td>${esc(cl.name)}<br><small>${esc(cl.schedule)}</small></td></tr>`).join('')||'<tr><td colspan="5">Nenhum aluno neste filtro.</td></tr>'}</tbody></table></div><div class="insight-pagination"><button type="button" data-insight-page="-1" ${page===0?'disabled':''}>Anterior</button><span>Página ${page+1} de ${Math.max(1,Math.ceil(people.length/30))}</span><button type="button" data-insight-page="1" ${(page+1)*30>=people.length?'disabled':''}>Próxima</button></div>`;}
  function render(){const rows=selected(), people=uniquePeople(rows);controls(el('insight-controls'));controls(el('heat-controls'));const summary=el('censo-filter-summary');if(summary)summary.textContent=`${people.length} pessoas · ${rows.length} matrículas · ${new Set(rows.map(r=>r.cl.id)).size} turmas · ${getLoading()?'Dados ainda carregando; totais parciais.':'Cadastros carregados no seu perfil.'}`;
    for(const d of Object.keys(dimensions))chart('censo-chart-'+d,d,['activity','classes','status'].includes(d)?rows:people);
    renderList(rows);if(active)renderHeat();
  }
  function draw(points){if(!map)return;layer?.remove();const L=window.L;
    if(mode==='points'){layer=L.layerGroup(points.map(p=>L.circleMarker([p.latitude,p.longitude],{radius:4,weight:0,fillColor:'#1463c4',fillOpacity:.35,interactive:false}))).addTo(map);return;}
    // One contribution per distinct person; aggregate only the painting work.
    const Heat=L.Layer.extend({onAdd(m){this.canvas=L.DomUtil.create('canvas','insight-heat-canvas');this.canvas.style.pointerEvents='none';m.getPanes().overlayPane.appendChild(this.canvas);this.paint=()=>{const size=m.getSize(),c=this.canvas;c.width=size.x;c.height=size.y;L.DomUtil.setPosition(c,m.containerPointToLayerPoint([0,0]));const ctx=c.getContext('2d'),groups=new Map();points.forEach(p=>{const pt=m.latLngToContainerPoint([p.latitude,p.longitude]);const k=`${Math.round(pt.x/4)},${Math.round(pt.y/4)}`;const g=groups.get(k)||{x:pt.x,y:pt.y,n:0};g.n++;groups.set(k,g);});for(const {x,y,n} of groups.values()){const radius=26,g=ctx.createRadialGradient(x,y,0,x,y,radius);g.addColorStop(0,`rgba(233,76,39,${Math.min(.85,.18+Math.log1p(n)*.16)})`);g.addColorStop(.4,'rgba(245,166,35,.25)');g.addColorStop(1,'rgba(20,99,196,0)');ctx.fillStyle=g;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);}};m.on('moveend zoomend resize',this.paint);this.paint();},onRemove(m){m.off('moveend zoomend resize',this.paint);this.canvas.remove();}});layer=new Heat().addTo(map);
  }
  async function renderHeat(){const ticket=++generation, status=el('heat-status');try{await loadMap();if(ticket!==generation||!active)return;if(!directory){status.textContent='Carregando referências de CEP…';directory=(await loadJSON('data/votorantim-cep-coordenadas.json')).postalCodes;}if(ticket!==generation||!active)return;const result=postalPoints(selected(),directory);status.textContent=`${result.points.length} de ${result.total} pessoas localizadas por CEP · ${result.missing.length} sem referência${getLoading()?' · Dados parciais, carregando turmas':''}.`;el('heat-missing').textContent=result.missing.length?`CEPs pendentes: ${[...new Set(result.missing.map(r=>r.student.postalCode||'Não informado'))].slice(0,25).join(', ')}${result.missing.length>25?'…':''}`:'';
    if(!window.L)throw Error('Biblioteca do mapa indisponível. Recarregue a página.');if(!map){map=window.L.map('heat-map',{preferCanvas:true,scrollWheelZoom:false}).setView([-23.55,-47.44],12);window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);}map.invalidateSize();draw(result.points);
    }catch(e){if(ticket===generation)status.textContent='Mapa indisponível: '+e.message+' Use Atualizar mapa para tentar novamente.';}}
  document.addEventListener('change',e=>{const d=e.target.dataset.insightFilter;if(d){filters[d]=e.target.value;page=0;render();}if(e.target.dataset.insightMode!==undefined){mode=e.target.value;renderHeat();}});
  document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('[data-insight-search]')){filters.search=e.target.value;page=0;render();}});
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-insight-clear'))filters={day:''};else if(b.dataset.insightRemove)delete filters[b.dataset.insightRemove];else if(b.dataset.insightDimension){const d=b.dataset.insightDimension,v=b.dataset.insightValue;filters[d]=key(filters[d])===key(v)?'':v;}else if(b.dataset.insightPage){page+=Number(b.dataset.insightPage);renderList(selected());return;}else if(b.hasAttribute('data-heat-refresh')){renderHeat();return;}else return;page=0;render();});
  return {render,showHeat(){active=true;render();},hideHeat(){active=false;generation++;},reset(){active=false;generation++;filters={day:''};page=0;layer=null;map?.remove();map=null;for(const id of ['insight-students','heat-status','heat-missing'])if(el(id))el(id).replaceChildren();}};
}
