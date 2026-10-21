import { normalizeGender, identityKey, uniquePeople, venueKey, completeVenueDirectory } from "./data-integrity.mjs";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  GoogleAuthProvider,
  getIdTokenResult,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  runTransaction,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  where
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

function safeStorageGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeStorageSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* preferência temporária */ }
}

const DEMO_STORE_KEY = "votorantim-esporte-chamada-demo-v1";
const APP_VERSION = "11.2.0";
const FIREBASE_REQUIRED_KEYS = ["apiKey", "authDomain", "projectId", "appId"];
const PAGE_TITLES = {
  dashboard: ["VISÃO GERAL", "Bom trabalho!"],
  classes: ["ORGANIZAÇÃO", "Minhas turmas"],
  attendance: ["PRESENÇA", "Fazer chamada"],
  reports: ["ANÁLISE", "Relatórios de presença"],
  territory: ["CENSO+ E TERRITÓRIO", "Censo+ e território"],
  import: ["MIGRAÇÃO ASSISTIDA", "Importar alunos"],
  admin: ["GESTÃO", "Visão de coordenação"],
  help: ["GUIA INTERATIVO", "Comece com segurança"]
};
const HELP_ARTICLES = [
  {
    title: "Como a chamada é salva?",
    body: "Cada chamada fica associada a uma turma e a uma data. Marque presença ou falta, revise a lista e use Salvar chamada. No Firebase configurado, a alteração é sincronizada em tempo real com seus outros navegadores autorizados."
  },
  {
    title: "Quais dados devo cadastrar?",
    body: "Comece com o mínimo necessário. Nome, vínculo com a turma e um contato de responsável geralmente bastam para a rotina. Endereço, escola e campos de referência devem ser preenchidos somente se houver finalidade institucional e autorização adequada."
  },
  {
    title: "Como funciona a evolução individual?",
    body: "No relatório mensal, o sistema soma presenças e faltas marcadas para cada aluno e compara a primeira metade com a segunda metade do período quando há registros suficientes. Isso indica uma tendência de presença; não substitui avaliação pedagógica ou técnica."
  },
  {
    title: "Quem pode ver os dados?",
    body: "O professor acessa as próprias turmas. A coordenação recebe acesso somente após provisionamento manual de uma conta administradora. As regras do Firestore devem ser publicadas antes do uso real; a interface, sozinha, não protege a base."
  },
  {
    title: "Posso importar uma planilha?",
    body: "Sim. Baixe o modelo CSV, preencha uma turma por arquivo e revise a prévia antes de importar. O campo matricula_codigo evita duplicidade numa reimportação quando estiver preenchido. O modelo não traz nomes ou cadastros de exemplo."
  },
  {
    title: "Como uso WhatsApp e ligação?",
    body: "A plataforma não envia mensagens automaticamente. Após registrar o canal autorizado pelo responsável ou aluno, o professor escolhe manualmente abrir o WhatsApp ou iniciar uma ligação. Revise a autorização antes de cada contato."
  },
  {
    title: "Como funciona o mapa de território?",
    body: "O mapa usa somente zonas ou bairros de uma camada aprovada pela gestão. Ele não mostra casas, ruas nem pinos individuais. A zona é selecionada manualmente até que exista uma regra territorial validada."
  }
];
const TOUR_STEPS = [
  { view: "dashboard", selector: "#dashboard-add-class", title: "Crie a primeira turma", body: "Dê um nome interno, indique modalidade, local e horário. A turma fica vinculada à sua conta de professor." },
  { view: "classes", selector: "#classes-content", title: "Cadastre os participantes", body: "Abra uma turma e use Cadastrar aluno. O cadastro é completo, mas você decide quais campos são realmente necessários." },
  { view: "attendance", selector: "#attendance-list", title: "Faça a chamada", body: "Escolha turma e data, marque presença ou falta e salve. Você pode corrigir uma data a qualquer momento." },
  { view: "reports", selector: "#generate-report", title: "Transforme presença em acompanhamento", body: "Selecione o mês para ver indicadores por turma e evolução individual. Exporte CSV ou use Salvar em PDF." },
  { view: "territory", selector: "#territory-map", title: "Censo+ e território com privacidade", body: "Use apenas uma camada oficial ou aprovada. O mapa trabalha com zonas agregadas e nunca exibe endereço ou marcador individual." }
];

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const ui = Object.fromEntries($$("[id]").map((element) => [element.id, element]));

const state = {
  firebaseEnabled: false,
  isDemo: false,
  isAdmin: false,
  user: null,
  profile: null,
  classes: [],
  bundledTerritoryZones: [],
  territoryZones: [],
  territoryFilter: "all",
  selectedTerritoryZoneId: null,
  selectedClassId: null,
  classDetailTab: "students",
  studentsByClass: {},
  histories: {},
  monthlyHistories: {},
  monthWatchers: new Map(),
  attendance: { classId: "", date: localDate(), sessionTime: localTime(), records: {}, dirty: false },
  report: null,
  importRows: [],
  activeView: "dashboard",
  territoryMap: null,
  googleTerritoryMap: null,
  censusHydrationId: 0,
  tourIndex: 0,
  unsubscribers: { classes: null, selectedStudents: null, territoryZones: null },
  selectedStudentsSubscriptionId: null
};

let firebase = { app: null, auth: null, db: null, provider: null };

bootstrap().catch((error) => {
  console.error("Erro ao iniciar o aplicativo:", error);
  document.getElementById("loading-screen")?.classList.add("hidden");
  document.getElementById("auth-screen")?.classList.remove("hidden");
  const warning = document.getElementById("auth-message");
  if (warning) {
    warning.textContent = "Erro na inicialização: " + (error?.message || String(error));
    warning.classList.remove("hidden");
  }
});

async function fetchJsonResource(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {...options, signal: controller.signal});
    if (!response.ok) throw Error('Recurso indisponível: ' + url);
    return await response.json();
  } finally { clearTimeout(timer); }
}

async function loadBundledTerritoryZones() {
  const urls = ['data/votorantim-setores-ibge-2022.geojson', 'data/votorantim-bairros-referencia-cnefe-2022.geojson',
    'data/votorantim-bairros-diretorio.json', 'data/votorantim-cep-bairros.json',
    'data/votorantim-bairros-complementares.geojson', 'data/votorantim-polos-esportivos.json'];
  const results = await Promise.allSettled(urls.map(url => fetchJsonResource(url)));
  const [sectors, neighborhoods, directory, postal, complementary, centers] = results.map(r => r.status === 'fulfilled' ? r.value : null);
  state.neighborhoodDirectory = directory || {neighborhoods: [], assignments: []};
  state.censusTerritoryZones = (sectors?.features || []).map(f => ({id:'ibge-'+f.properties.cd_setor,
    name:directory?.assignments?.find(a=>a.sectorCode===f.properties.cd_setor)?.neighborhood||'Localidade não identificada',
    sectorCode:f.properties.cd_setor, sector:f.properties.situacao||'Censo 2022',
    sourceVersion:'IBGE • Censo 2022 • malha definitiva v02', geometry:f.geometry, layer:'sectors'}));
  state.bundledTerritoryZones = [...(neighborhoods?.features || []), ...(complementary?.features || [])]
    .map(f => ({...f.properties, geometry:f.geometry, layer:'neighborhoods'}));
  state.territoryLayer = 'neighborhoods';
  state.postalDirectory = postal?.postalCodes || {};
  state.bundledSportsCenters = centers?.centers || [];
  state.sportsCenters = state.bundledSportsCenters.slice();
  state.territoryLoadErrors = results.flatMap((r,i) => r.status === 'rejected' ? [urls[i]] : []);
  if (state.territoryLoadErrors.length) console.warn('Dados territoriais parcialmente indisponíveis', state.territoryLoadErrors);
}

function createFirebase(config) {
  const app = initializeApp(config);
  // Production data stays in the protected Firestore service instead of
  // retaining an offline copy in a browser that may be shared. Realtime
  // synchronization still works normally whenever authorized users are online.
  return { app, auth: getAuth(app), db: getFirestore(app), provider: new GoogleAuthProvider() };
}

async function handleFirebaseUser(firebaseUser) {
  if (!firebaseUser) {
    clearWorkspaceState();
    finishLoading();
    showAuthScreen();
    return;
  }

  state.isDemo = false;
  try {
    const token = await getIdTokenResult(firebaseUser);
    const provider = token?.signInProvider || "";
    // A autorização real também é aplicada nas regras do Firestore.
    if (provider === "google.com") {
      const adminDoc = await getDoc(doc(firebase.db, "adminUsers", firebaseUser.uid));
      if (!adminDoc.exists()) {
        await signOut(firebase.auth);
        showAuthMessage("O login Google é reservado ao administrador autorizado. Professores devem entrar com e-mail e senha.");
        return;
      }
    }
    state.user = {
      uid: firebaseUser.uid,
      email: firebaseUser.email || "",
      displayName: firebaseUser.displayName || "",
      photoURL: firebaseUser.photoURL || ""
    };
    await prepareWorkspace();
  } catch (error) {
    console.error("Falha ao validar o acesso", error);
    showAuthMessage("Não foi possível validar suas permissões. " + friendlyFirebaseError(error));
    finishLoading();
    showAuthScreen();
  }
}

async function startDemo() {
  state.isDemo = true;
  state.firebaseEnabled = false;
  state.user = {
    uid: "modo-local",
    email: "",
    displayName: "",
    photoURL: ""
  };
  await prepareWorkspace();
}

function finishLoading() {
  ui["loading-screen"].classList.add("hidden");
}

function showAuthScreen() {
  ui.workspace.classList.add("hidden");
  ui["auth-screen"].classList.remove("hidden");
}

async function signInWithGoogle() {
  if (state.authBusy) return;
  if (!firebase.auth) return;
  setAuthBusy(true);
  try {
    await signInWithPopup(firebase.auth, firebase.provider);
  } catch (error) {
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"].includes(error.code)) {
      await signInWithRedirect(firebase.auth, firebase.provider);
      return;
    }
    showAuthMessage(friendlyFirebaseError(error));
  } finally {
    setAuthBusy(false);
  }
}

async function signOutUser() {
  if (!state.isDemo && firebase.auth) {
    await signOut(firebase.auth);
  } else {
    clearWorkspaceState();
    showAuthScreen();
  }
}

function showAuthMessage(message) {
  ui["auth-message"].textContent = message || "";
}

function subscribeClasses() {
  subscribeActivityCatalogue();
  state.unsubscribers.classes?.();
  if (state.isDemo) {
    state.classes = repository.getDemoClasses();
    afterClassesChanged();
    return;
  }

  const classesRef = collection(firebase.db, "classes");
  const classesQuery = state.isAdmin
    ? query(classesRef)
    : query(classesRef, where("teacherId", "==", state.user.uid));
  state.unsubscribers.classes = onSnapshot(
    classesQuery,
    (snapshot) => {
      state.classes = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
      afterClassesChanged();
    },
    (error) => toast(friendlyFirebaseError(error), "error")
  );
}

function subscribeTerritoryZones() {
  state.unsubscribers.territoryZones?.();
  if (state.isDemo) {
    state.territoryZones = mergeTerritoryZones(state.bundledTerritoryZones, repository.getDemoTerritoryZones());
    afterTerritoryZonesChanged();
    return;
  }

  state.unsubscribers.territoryZones = onSnapshot(
    query(collection(firebase.db, "territoryZones"), orderBy("name")),
    (snapshot) => {
      const remoteZones = snapshot.docs
        .map((item) => hydrateTerritoryZone({ id: item.id, ...item.data() }))
        .filter(Boolean);
      state.territoryZones = mergeTerritoryZones(state.bundledTerritoryZones, remoteZones);
      afterTerritoryZonesChanged();
    },
    (error) => toast(friendlyFirebaseError(error), "error")
  );
}

function hydrateTerritoryZone(zone) {
  if (!zone) return null;
  if (zone.geometry && geometryPoints(zone.geometry).length) return zone;
  if (typeof zone.geometryJson !== "string") return zone;
  try {
    const geometry = JSON.parse(zone.geometryJson);
    return geometryPoints(geometry).length ? { ...zone, geometry } : null;
  } catch {
    console.warn("Uma zona territorial tem geometria inválida e foi ignorada", zone.id);
    return null;
  }
}

function mergeTerritoryZones(...collections) {
  const zones = new Map();
  collections.flat().forEach((zone) => {
    const hydrated = hydrateTerritoryZone(zone);
    if (hydrated?.id) zones.set(hydrated.id, hydrated);
  });
  return [...zones.values()].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
}

function afterTerritoryZonesChanged() {
  populateTerritoryZoneOptions();
  populateClassTerritoryZoneOptions();
  if (state.activeView === "territory") {
    renderTerritory();
    renderTerritoryLinks();
  }
  renderClasses();
}

function populateTerritoryZoneOptions(selectedValue = ui["student-territory-zone"]?.value || "") {
  const select = ui["student-territory-zone"];
  if (!select) return;
  const options = state.territoryZones.map((zone) => {
    const label = [zone.name, zone.sector].filter(Boolean).join(" · ");
    return `<option value="${escapeAttr(zone.id)}">${escapeHtml(label || "Zona sem nome")}</option>`;
  }).join("");
  select.innerHTML = `<option value="">Nenhuma zona selecionada</option>${options}`;
  select.value = state.territoryZones.some((zone) => zone.id === selectedValue) ? selectedValue : "";
  ui["territory-field-help"].textContent = state.territoryZones.length
    ? `${state.territoryZones.length} ${state.territoryZones.length === 1 ? "zona de referência disponível" : "zonas de referência disponíveis"}. O CEP pode vincular o bairro automaticamente; você também pode revisar a zona.`
    : "A seleção é manual até a gestão importar uma camada territorial aprovada. Não há geocodificação de endereço.";
}

function populateClassTerritoryZoneOptions(selectedValue = ui["class-territory-zone"]?.value || "") {
  const select = ui["class-territory-zone"];
  if (!select) return;
  const options = state.territoryZones.map((zone) => {
    const label = [zone.name, zone.sector].filter(Boolean).join(" · ");
    return `<option value="${escapeAttr(zone.id)}">${escapeHtml(label || "Zona sem nome")}</option>`;
  }).join("");
  select.innerHTML = `<option value="">Definir depois</option>${options}`;
  select.value = state.territoryZones.some((zone) => zone.id === selectedValue) ? selectedValue : "";
}

function syncTerritoryFields(form) {
  const zoneId = form.elements.territoryZoneId?.value || "";
  const zone = state.territoryZones.find((item) => item.id === zoneId);
  form.elements.territoryZoneName.value = zone?.name || "";
  form.elements.territorySector.value = zone?.sector || "";
  form.elements.territorySource.value = zone?.sourceVersion || "";
}

function loadedStudents() {
  return Object.values(state.studentsByClass).flat();
}

function territoryStudentsByZone() {
  const counts={};
  censoUnique(loadedStudents().map(student=>({student}))).map(row=>row.student).filter(s=>!state.selectedNeighborhood||neighborhoodKey(s.neighborhood)===neighborhoodKey(state.selectedNeighborhood)).forEach(student=>{
    const zone=state.territoryZones.find(z=>neighborhoodKey(z.name)===neighborhoodKey(student.neighborhood));
    const id=zone?.id||student.territoryZoneId||student.geo?.zoneId;
    if(id)counts[id]=(counts[id]||0)+1;
  });
  return counts;
}

function classesForTerritoryZone(zone) {
  if (!zone) return [];
  const zoneName = neighborhoodKey(zone.name);
  return territoryActivities().filter((item) => {
    if (item.territoryZoneId === zone.id) return true;
    // Legacy classes did not have a zone field. Match only an explicit local
    // name so that an unrelated address never appears as territorial data.
    if (zoneName && neighborhoodKey(item.location).includes(zoneName)) return true;
    return allSportsCenters().some(center=>neighborhoodKey(center.neighborhood)===zoneName && [center.name,...(center.aliases||[])].some(label=>venueKey(label)===venueKey(item.location)));
  });
}

function territoryZonePopup(zone, studentCount) {
  const classes = classesForTerritoryZone(zone);
  const activities = classes.length
    ? `<ul class="territory-map-classes">${classes.map((item) => `<li><strong>${escapeHtml(item.location || "Núcleo sem local")}</strong><span>${escapeHtml([item.sport, item.name, item.schedule].filter(Boolean).join(" · ") || "Aula sem detalhes")}</span></li>`).join("")}</ul>`
    : `<p class="territory-map-empty-detail">Nenhuma aula vinculada a este bairro ainda.</p>`;
  return `<div class="territory-map-popup"><h4>${escapeHtml(zone.name || "Bairro")}</h4><p>${studentCount} cadastro${studentCount === 1 ? "" : "s"} associado${studentCount === 1 ? "" : "s"} · ${classes.length} núcleo${classes.length === 1 ? "" : "s"}</p>${zone.sectorCodes?`<p>${zone.sectorCodes.length} polígonos agrupados${zone.reviewRequired?" • inclui áreas com mais de uma localidade":""}</p>`:""}<h5>Núcleos e aulas</h5>${activities}</div>`;
}

function selectTerritoryZoneFromMap(zoneId) {
  state.selectedTerritoryZoneId = zoneId;
  const selected=(state.territoryLayer==='sectors'?state.censusTerritoryZones:state.territoryZones).find(z=>z.id===zoneId);
  state.selectedNeighborhood=selected?.name||'';
  renderNeighborhoodDirectory().catch(e=>toast(e.message,'error'));
  renderTerritory();
  $$('[data-action="select-territory-zone"]').forEach((button) => {
    button.classList.toggle("selected", button.dataset.id === zoneId);
  });
}

function filteredTerritoryZones(zones = state.territoryZones) {
  return state.territoryFilter === "all"
    ? zones
    : zones.filter((zone) => zone.sector === state.territoryFilter);
}

function renderTerritoryFilter(zones) {
  const select = ui["territory-sector-filter"];
  if (!select) return;
  const sectors = [...new Set(zones.map((zone) => zone.sector).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (!sectors.includes(state.territoryFilter)) state.territoryFilter = "all";
  select.innerHTML = `<option value="all">Todos os setores</option>${sectors.map((sector) => `<option value="${escapeAttr(sector)}">${escapeHtml(sector)}</option>`).join("")}`;
  select.value = state.territoryFilter;
  select.disabled = !sectors.length;
}

function renderTerritory() {
  if (!ui["territory-summary"]) return;
  renderSportsCenterDirectory();
  renderTerritoryLinks();
  const zones = state.territoryLayer==='sectors' ? state.censusTerritoryZones : state.territoryZones.filter(z=>!z.aliasOnly||neighborhoodKey(z.name)===neighborhoodKey(state.selectedNeighborhood));
  renderTerritoryFilter(zones);
  const selectedLocality=state.neighborhoodDirectory?.neighborhoods.find(n=>neighborhoodKey(n.name)===neighborhoodKey(state.selectedNeighborhood));
  const selectedCodes=new Set(selectedLocality?.sectorCodes||[]);
  const primaryNeighborhood=zones.filter(z=>neighborhoodKey(z.name)===neighborhoodKey(state.selectedNeighborhood));
  const visibleZones = state.selectedNeighborhood && state.territoryLayer!=='sectors' ? (primaryNeighborhood.length?primaryNeighborhood:(state.censusTerritoryZones||[]).filter(z=>selectedCodes.has(z.sectorCode))) : filteredTerritoryZones(zones).filter(z=>state.selectedNeighborhood ? selectedCodes.has(z.sectorCode) : (!state.selectedTerritoryZoneId||z.id===state.selectedTerritoryZoneId));
  const counts = territoryStudentsByZone();
  const classified = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const loaded = censoUnique(loadedStudents().map(student=>({student}))).length;
  const neighborhoods = new Set(loadedStudents().map((student) => censoText(student.neighborhood)).filter(Boolean));
  const sourceLabels = [...new Set(zones.map((zone) => zone.sourceVersion).filter(Boolean))];
  ui["territory-summary"].innerHTML = [
    [state.territoryLayer==="sectors"?"Polígonos de origem":"Áreas por bairro", zones.length, "76 agrupamentos • 215 polígonos de origem"],
    ["Cadastros por zona", classified, loaded ? `de ${loaded} aluno${loaded === 1 ? "" : "s"} carregado${loaded === 1 ? "" : "s"}` : "nenhum aluno carregado"],
    ["Localidades identificadas", state.neighborhoodDirectory?.neighborhoods.length||0, "IBGE CNEFE 2022 • diretório completo"],
    ["Referência dos bairros", "CNEFE 2022", "agrupamento por localidade predominante"]
  ].map(([label, value, note]) => `<article class="panel stat-card territory-stat"><div class="stat-label"><span>${escapeHtml(String(label))}</span><i class="stat-icon" aria-hidden="true">⌖</i></div><strong>${escapeHtml(String(value))}</strong><small>${escapeHtml(String(note))}</small></article>`).join("");
  if(state.territoryLoadErrors?.length)ui["territory-summary"].innerHTML += `<p role="status">Parte dos dados territoriais não carregou. <button type="button" class="button button-secondary" data-v11="retry-territory">Tentar carregar novamente</button></p>`;
  ui["territory-layer-status"].textContent = zones.length ? `${visibleZones.length}/${zones.length} ${state.territoryLayer==="sectors"?"polígonos":"áreas por bairro"}` : "Sem camada";
  ui["territory-layer-status"].classList.toggle("inactive", !zones.length);
  ui["territory-map"].innerHTML = renderTerritoryMap(visibleZones, counts);
  state.territoryMapReady = mountOfficialTerritoryMap(visibleZones, counts);
  ui["territory-zone-list"].innerHTML = visibleZones.length ? visibleZones.map((zone) => {
    const count = counts[zone.id] || 0;
    const classCount = classesForTerritoryZone(zone).length;
    const selected = zone.id === state.selectedTerritoryZoneId;
    return `<button class="territory-zone-row ${selected ? "selected" : ""}" data-action="select-territory-zone" data-id="${escapeAttr(zone.id)}" type="button"><span class="zone-swatch" aria-hidden="true"></span><span><strong>${escapeHtml(zone.name || "Zona sem nome")}</strong><small>${escapeHtml(zone.sector || "Setor não informado")} · ${classCount} núcleo${classCount === 1 ? "" : "s"}</small></span><b>${count}</b></button>`;
  }).join("") : `<div class="territory-empty"><span aria-hidden="true">⌖</span><strong>Nenhum setor neste filtro</strong><p>Selecione “Todos os setores” para visualizar a camada territorial completa.</p></div>`;
}

function renderTerritoryMap(zones, counts) {
  const usingGoogle = Boolean(window.GOOGLE_MAPS_CONFIG?.apiKey);
  return `<div id="official-territory-map" class="official-territory-map" aria-label="Mapa de bairros de referência de Votorantim"></div><p class="territory-map-credit">Bairros de referência: setores IBGE agrupados por localidade predominante no CNEFE 2022 • não são perímetros legais · Base: ${usingGoogle ? "Google Maps Platform" : "© OpenStreetMap contributors"}. Setores censitários do Censo 2022.</p>`;
}

async function mountOfficialTerritoryMap(zones, counts) {
  const target = document.getElementById("official-territory-map");
  if (!target) return;
  state.territoryMap?.remove();
  state.territoryMap = null;
  state.googleTerritoryMap = null;
  target.replaceChildren();
  try {
    const boundary = state.municipalBoundary || await fetchJsonResource("data/votorantim-limite-municipal-oficial.geojson", { cache: "force-cache" });
    state.municipalBoundary=boundary;
    if (!target.isConnected) return;
    if (window.GOOGLE_MAPS_CONFIG?.apiKey) {
      try {
        await loadGoogleMaps(window.GOOGLE_MAPS_CONFIG);
        if (!target.isConnected) return;
        mountGoogleTerritoryMap(target, boundary, zones, counts);
        return;
      } catch (error) {
        console.warn("Google Maps indisponível; usando mapa alternativo", error);
      }
    }
    if (!target.isConnected) return;
    if (!window.L) throw new Error("Biblioteca do mapa indisponível");
    const map = window.L.map(target, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
    state.territoryMap = map;
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
    const boundaryLayer = window.L.geoJSON(boundary, {
      style: { color: "#063b79", weight: 3, fillColor: "#2f94bf", fillOpacity: 0.07 },
      onEachFeature: (_, layer) => layer.bindTooltip("Votorantim • limite municipal IBGE", { sticky: true })
    }).addTo(map);
    map.fitBounds(boundaryLayer.getBounds(), { padding: [16, 16] });
    mountSportsCentersLeaflet(map);
    if(state.mapExtent!=="municipality"&&!state.selectedNeighborhood&&!state.selectedTerritoryZoneId){const centers=visibleSportsCenters();if(centers.length>1)map.fitBounds(window.L.latLngBounds(centers.map(c=>[c.latitude,c.longitude])),{padding:[38,38],maxZoom:14});}
    zones.filter((zone) => geometryPoints(zone.geometry).length).forEach((zone) => {
      const total = counts[zone.id] || 0;
      const selected = zone.id === state.selectedTerritoryZoneId || neighborhoodKey(zone.name)===neighborhoodKey(state.selectedNeighborhood);
      const palette=['#187d88','#4267a5','#738c4e','#a27835','#8c6591','#417f71'];
      const color=palette[[...zone.name].reduce((v,c)=>v+c.charCodeAt(0),0)%palette.length];
      const layer = window.L.geoJSON({ type: "Feature", properties: {}, geometry: zone.geometry }, {
        style: { color: selected ? "#9e1f2a" : color, weight: selected ? 3 : 1.4, fillColor: selected ? "#c62d37" : color, fillOpacity: selected ? 0.33 : 0.18 }
      }).addTo(map);
      layer.bindTooltip(`${zone.name || "Zona"} · ${total} cadastro${total === 1 ? "" : "s"}`, { sticky: true });
      layer.bindPopup(territoryZonePopup(zone, total), { maxWidth: 360 });
      layer.on("click", () => selectTerritoryZoneFromMap(zone.id));
    });
    if ((state.selectedNeighborhood || state.selectedTerritoryZoneId) && zones.length) { const focus=window.L.geoJSON({type:"FeatureCollection",features:zones.map(z=>({type:"Feature",properties:{},geometry:z.geometry}))});map.fitBounds(focus.getBounds(),{padding:[28,28],maxZoom:15}); }
  } catch (error) {
    console.error("Falha ao carregar a geometria ilustrativa", error);
    if (!target.isConnected) return;
    target.innerHTML = `<div class="territory-map-empty"><span aria-hidden="true">!</span><h4>Mapa não disponível</h4><p>Verifique os dados territoriais e a conexão com a base cartográfica.</p></div>`;
  }
}

function loadGoogleMaps(config) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (state.googleMapsPromise) return state.googleMapsPromise;
  state.googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.dataset.googleMapsPlatform = 'true';
    const timer = setTimeout(() => fail(), 8000);
    const fail = () => { clearTimeout(timer); script.remove(); state.googleMapsPromise = null; reject(Error('Google Maps indisponível')); };
    script.onload = () => { clearTimeout(timer); window.google?.maps ? resolve(window.google.maps) : fail(); };
    script.onerror = fail;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.apiKey)}&v=weekly&language=pt-BR&region=BR`;
    script.async = true; document.head.append(script);
  });
  return state.googleMapsPromise;
}

function mountGoogleTerritoryMap(target, boundary, zones, counts) {
  const maps = window.google.maps;
  const map = new maps.Map(target, {
    center: { lat: -23.544, lng: -47.452 }, zoom: 12,
    mapId: window.GOOGLE_MAPS_CONFIG?.mapId || undefined,
    streetViewControl: false, fullscreenControl: true, mapTypeControl: true
  });
  state.googleTerritoryMap = map;
  mountSportsCentersGoogle(map, maps);
  const features = [{ type: "Feature", properties: { appLayer: "municipal" }, geometry: boundary.features?.[0]?.geometry }, ...zones.filter((zone) => geometryPoints(zone.geometry).length).map((zone) => ({ type: "Feature", properties: { appLayer: "zone", zoneId: zone.id, zoneName: zone.name || "Zona", total: counts[zone.id] || 0, popup: territoryZonePopup(zone, counts[zone.id] || 0) }, geometry: zone.geometry }))].filter((feature) => feature.geometry);
  map.data.addGeoJson({ type: "FeatureCollection", features });
  map.data.setStyle((feature) => {
    if (feature.getProperty("appLayer") === "municipal") return { strokeColor: "#063b79", strokeWeight: 3, fillColor: "#2f94bf", fillOpacity: 0.07, clickable: false };
    const selected = feature.getProperty("zoneId") === state.selectedTerritoryZoneId;
    return { strokeColor: selected ? "#9e1f2a" : "#1268b2", strokeWeight: selected ? 3 : 2, fillColor: selected ? "#c62d37" : "#2f94bf", fillOpacity: selected ? 0.38 : 0.22 };
  });
  map.data.addListener("click", (event) => {
    const zoneId = event.feature.getProperty("zoneId");
    if (!zoneId) return;
    const popup = new maps.InfoWindow({ content: event.feature.getProperty("popup"), position: event.latLng });
    popup.open({ map });
    selectTerritoryZoneFromMap(zoneId);
  });
  const points = geometryPoints(boundary.features?.[0]?.geometry);
  if (points.length) {
    const bounds = new maps.LatLngBounds();
    points.forEach(([longitude, latitude]) => bounds.extend({ lat: Number(latitude), lng: Number(longitude) }));
    map.fitBounds(bounds, 18);
    if(state.selectedNeighborhood&&zones.length){const focus=new maps.LatLngBounds();zones.flatMap(z=>geometryPoints(z.geometry)).forEach(([lng,lat])=>focus.extend({lat,lng}));map.fitBounds(focus,28);}
    else if(state.mapExtent!=="municipality"){const centers=visibleSportsCenters();if(centers.length>1){const focus=new maps.LatLngBounds();centers.forEach(c=>focus.extend({lat:c.latitude,lng:c.longitude}));map.fitBounds(focus,38);}}
  }
}

function geometryCoordinates(geometry) {
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type) || !Array.isArray(geometry.coordinates)) return [];
  return geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
}

function geometryPoints(geometry) {
  return geometryCoordinates(geometry).flat().filter((point) => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])));
}

function geometryBounds(geometries) {
  const points = geometries.flatMap((geometry) => geometryPoints(geometry));
  const longitudes = points.map((point) => Number(point[0]));
  const latitudes = points.map((point) => Number(point[1]));
  const west = Math.min(...longitudes), east = Math.max(...longitudes), south = Math.min(...latitudes), north = Math.max(...latitudes);
  return { west, east: east === west ? east + 0.01 : east, south, north: north === south ? north + 0.01 : north };
}

function geoPath(geometry, bounds) {
  return geometryCoordinates(geometry).map((ring) => ring.map((point, index) => {
    const x = 55 + ((Number(point[0]) - bounds.west) / (bounds.east - bounds.west)) * 890;
    const y = 565 - ((Number(point[1]) - bounds.south) / (bounds.north - bounds.south)) * 510;
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ") + " Z").join(" ");
}

async function hydrateCensusStudents() {
  const requestId = ++state.censusHydrationId;
  const validIds = new Set(state.classes.map((item) => item.id));
  Object.keys(state.studentsByClass).forEach((id) => {
    if (!validIds.has(id)) delete state.studentsByClass[id];
  });
  // Loads only newly accessible classes; later edits to the selected class use
  // the live listener. Admin may refresh all via the dashboard control.
  const pending = state.classes.filter((item) => item.id !== state.selectedClassId && !(item.id in state.studentsByClass));
  if (!pending.length) return;
  let cursor = 0;
  const worker = async () => {
    while (cursor < pending.length) {
      const item = pending[cursor++];
      if (requestId !== state.censusHydrationId) return;
      try { await loadStudents(item.id); }
      catch (error) { console.warn("Falha ao carregar indicadores da turma", item.id, error); }
    }
  };
  await Promise.all(Array.from({length: Math.min(6, pending.length)}, () => worker()));
  if (requestId !== state.censusHydrationId) return;
  renderDashboard();
  if (state.activeView === "territory") { renderTerritory(); renderTerritoryLinks(); }
}

async function refreshIndicators() {
  const button = ui["dashboard-refresh"];
  if (button) { button.disabled = true; button.textContent = "Atualizando…"; }
  try {
    // Avoid uncontrolled burst of requests when many classes are accessible.
    const items = [...state.classes];
    let cursor = 0;
    await Promise.all(Array.from({length: Math.min(6, items.length)}, async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        await loadStudents(item.id);
      }
    }));
    renderDashboard();
    toast("Indicadores de alunos atualizados.");
  } catch (error) { toast(friendlyFirebaseError(error), "error"); }
  finally { if (button) { button.disabled = false; button.textContent = "Atualizar indicadores"; } }
}

function ensureClassSelection() {
  if (!state.selectedClassId && state.classes.length) selectClass(state.classes[0].id);
}

function selectClass(classId) {
  if (!classId || classId === state.selectedClassId && state.selectedStudentsSubscriptionId === classId) {
    renderClasses();
    return;
  }
  state.selectedClassId = classId;
  migrateEnrollments(classId).catch(e=>toast(friendlyFirebaseError(e), "error"));
  observeSelectedStudents(classId);
  loadHistory(classId);
  renderClasses();
}

function observeSelectedStudents(classId) {
  state.unsubscribers.selectedStudents?.();
  state.selectedStudentsSubscriptionId = classId;
  if (state.isDemo) {
    state.studentsByClass[classId] = repository.getDemoStudents(classId);
    renderClasses();
    renderAttendance();
    return;
  }
  state.unsubscribers.selectedStudents = onSnapshot(
    query(collection(firebase.db, "classes", classId, "students"), orderBy("fullName")),
    (snapshot) => {
      state.studentsByClass[classId] = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderClasses();
      renderAttendance();
      renderDashboard();
      if (state.activeView === "territory") { renderTerritory(); renderTerritoryLinks(); }
    },
    (error) => toast(friendlyFirebaseError(error), "error")
  );
}

async function loadStudents(classId) {
  if (!classId) return [];
  if (state.isDemo) {
    const rows = repository.getDemoStudents(classId);
    state.studentsByClass[classId] = rows;
    return rows;
  }
  const snapshot = await getDocs(query(collection(firebase.db, "classes", classId, "students"), orderBy("fullName")));
  const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  state.studentsByClass[classId] = rows;
  return rows;
}

async function loadHistory(classId) {
  if (!classId) return;
  try {
    if (state.isDemo) {
      state.histories[classId] = repository.getDemoAttendance(classId).slice(0, 30);
    } else {
      const historyQuery = query(
        collection(firebase.db, "classes", classId, "attendance"),
        orderBy("date", "desc"),
        limit(30)
      );
      const snapshot = await getDocs(historyQuery);
      state.histories[classId] = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    }
    if (state.selectedClassId === classId) renderClasses();
  } catch (error) {
    console.error(error);
  }
}

let censoDashboardBairro = "";
function censoText(value) { return String(value ?? "").trim(); }
function censoKey(value) { return censoText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " "); }
function censoPersonKey(student) { return String(student.globalStudentId || '').trim() || identityKey(student); }
function censoUnique(rows) { return uniquePeople(rows); }
function censoAge(student) { const birth = censoText(student.birthDate); if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null; const date = new Date(`${birth}T12:00:00`); if (Number.isNaN(date.getTime())) return null; const now = new Date(); let age = now.getFullYear() - date.getFullYear(); if (now.getMonth() < date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() < date.getDate())) age--; return age >= 0 && age <= 120 ? age : null; }
function censoPlot(target, entries, total, empty) {
  const node = document.getElementById(target); if (!node) return;
  if (!entries.length) { node.innerHTML = `<p class="censo-chart-empty">${escapeHtml(empty)}</p>`; return; }
  const max = Math.max(...entries.map(([,n]) => n), 1);
  node.innerHTML = entries.slice(0,12).map(([label,n]) => `<div class="censo-bar-row"><div class="censo-bar-label"><span title="${escapeAttr(label)}">${escapeHtml(label)}</span><strong>${n}</strong></div><div class="censo-bar-track" role="img" aria-label="${escapeAttr(label)}: ${n} de ${total}"><span style="width:${Math.max(2,Math.round(n/max*100))}%"></span></div></div>`).join("");
}
function censoRank(rows, selector) { const map = new Map(); rows.forEach(row => { const key = selector(row); if (key) map.set(key, (map.get(key)||0)+1); }); return [...map].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0],"pt-BR")); }
function renderCensoAnalytics() {
  const filter = document.getElementById("censo-neighborhood-filter"); if (!filter) return;
  const all = state.classes.flatMap(cl => (state.studentsByClass[cl.id] || []).map(student => ({student,cl})));
  const distinct = censoUnique(all);
  const bairros = [...new Set(distinct.map(({student})=>censoText(student.neighborhood)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const old = censoDashboardBairro;
  filter.replaceChildren(new Option("Todos os bairros", ""));
  bairros.forEach(b=>filter.add(new Option(b,b)));
  if (old && bairros.some(b=>censoKey(b)===censoKey(old))) { filter.value=bairros.find(b=>censoKey(b)===censoKey(old)); } else { censoDashboardBairro=""; filter.value=""; }
  const matches = ({student}) => !censoDashboardBairro || censoKey(student.neighborhood)===censoKey(censoDashboardBairro);
  const filtered = all.filter(matches), people = distinct.filter(matches);
  const summary=document.getElementById("censo-filter-summary");
  if (summary) summary.innerHTML = `<strong>${people.length}</strong> participante${people.length===1?"":"s"} identificado${people.length===1?"":"s"} · <strong>${filtered.length}</strong> vínculo${filtered.length===1?"":"s"} em turma · <strong>${bairros.length}</strong> bairro${bairros.length===1?"":"s"} com cadastro`;
  const byBairro = censoRank(people,({student})=>censoText(student.neighborhood)||"Bairro não informado");
  const byActivity = censoRank(filtered,({cl})=>censoText(cl.sport)||"Atividade não informada");
  const byAge = censoRank(people,({student})=>{const a=censoAge(student);return a===null?"Idade não informada":a<=6?"0 a 6 anos":a<=11?"7 a 11 anos":a<=14?"12 a 14 anos":a<=17?"15 a 17 anos":a<=29?"18 a 29 anos":a<=59?"30 a 59 anos":"60 anos ou mais";});
  const ageOrder=["0 a 6 anos","7 a 11 anos","12 a 14 anos","15 a 17 anos","18 a 29 anos","30 a 59 anos","60 anos ou mais","Idade não informada"];
  byAge.sort((a,b)=>ageOrder.indexOf(a[0])-ageOrder.indexOf(b[0]));
  const byGender = censoRank(people,({student})=>normalizeGender(student.gender)||"Não informado");
  censoPlot("censo-chart-neighborhood",byBairro,people.length,"Cadastre participantes com bairro para visualizar a distribuição.");
  censoPlot("censo-chart-activity",byActivity,filtered.length,"Não há matrículas neste filtro.");
  censoPlot("censo-chart-age",byAge,people.length,"Não há participantes neste filtro.");
  censoPlot("censo-chart-gender",byGender,people.length,"Não há participantes neste filtro.");
  censoPlot("censo-chart-status",censoRank(filtered,({student})=>studentIsActive(student)?"Ativa":"Inativa"),filtered.length,"Sem matrículas.");
  censoPlot("censo-chart-classes",censoRank(filtered,({cl})=>cl.name||"Turma"),filtered.length,"Sem matrículas.");
  censoPlot("censo-chart-pcd",censoRank(people,({student})=>student.pcdStatus||"Não informado"),people.length,"Sem cadastros.");
}
document.addEventListener("change",event=>{ if(event.target?.id==="censo-neighborhood-filter"){censoDashboardBairro=event.target.value;renderCensoAnalytics();} });

function renderClasses() {
  if (!state.classes.length) {
    ui["classes-content"].innerHTML = `<div class="empty-state panel"><span aria-hidden="true">◒</span><h3>Sua primeira turma começa aqui</h3><p>Cadastre a turma antes de incluir alunos ou fazer a chamada. Nenhum nome é criado automaticamente.</p><button class="button button-primary" data-action="open-class-dialog" type="button">Cadastrar turma</button></div>`;
    return;
  }
  const selected = state.classes.find((item) => item.id === state.selectedClassId) || state.classes[0];
  const cards = state.classes.map((item) => `
    <button class="class-card ${item.id === selected.id ? "selected" : ""}" data-action="select-class" data-id="${escapeAttr(item.id)}" type="button">
      <div class="class-card-title"><div><h3>${escapeHtml(item.name || "Turma sem nome")}</h3><p>${escapeHtml(item.sport || "Modalidade não informada")}</p></div><span class="class-chevron" aria-hidden="true">›</span></div>
      <div class="class-meta"><span class="pill">${escapeHtml(item.location || "Local não informado")}</span><span class="pill ${item.active === false ? "inactive" : ""}">${item.active === false ? "Inativa" : "Ativa"}</span></div>
    </button>`).join("");
  ui["classes-content"].innerHTML = `<div class="class-cards">${cards}</div>${renderClassDetail(selected)}`;
}

function isContactAllowed(permission, channel) {
  if (channel === "whatsapp") return ["whatsapp", "both"].includes(permission);
  return ["call", "both"].includes(permission);
}

function renderTerritoryPill(student) {
  const label = student.territoryZoneName || student.geo?.zoneLabel || "Sem zona";
  const sector = student.territorySector || student.geo?.sector || "";
  return `<span class="territory-pill" title="${escapeAttr(sector || label)}">${escapeHtml(label)}${sector ? `<small>${escapeHtml(sector)}</small>` : ""}</span>`;
}

function renderClassDetail(classItem) {
  const students = state.studentsByClass[classItem.id] || [];
  const history = state.histories[classItem.id] || [];
  const studentContent = students.length
    ? `<div class="student-table-wrap"><table class="student-table"><thead><tr><th>Aluno</th><th>Aluno ID</th><th>Matrícula</th><th>Responsável</th><th>Território</th><th>Situação</th><th>Contato</th><th aria-label="Ações"></th></tr></thead><tbody>${students.map((student) => `
      <tr><td><div class="student-name"><span class="student-initial">${initials(student.preferredName || student.fullName)}</span><span>${escapeHtml(student.preferredName || student.fullName || "Sem nome")}</span></div></td><td><strong>${escapeHtml(student.globalStudentId || "ID pendente")}</strong></td><td>${escapeHtml(student.enrollmentCode || "—")}</td><td>${escapeHtml(student.guardianName || "—")}</td><td>${renderTerritoryPill(student)}</td><td><span class="pill">${escapeHtml(student.enrollmentStatus || "Ativa")}</span></td><td>${renderContactActions(student, classItem.id)}</td><td><div class="row-actions"><button class="row-action" data-action="toggle-student" data-id="${escapeAttr(student.id)}" data-class-id="${escapeAttr(classItem.id)}" type="button">${studentIsActive(student) ? "Desativar" : "Ativar"}</button><button class="row-action" data-action="edit-student" data-id="${escapeAttr(student.id)}" data-class-id="${escapeAttr(classItem.id)}" type="button">Editar</button>${state.isAdmin ? `<button class="row-action danger" data-action="delete-student" data-id="${escapeAttr(student.id)}" data-class-id="${escapeAttr(classItem.id)}" type="button">Excluir</button>` : ""}</div></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty-state"><span aria-hidden="true">+</span><h3>Lista vazia, por enquanto</h3><p>Cadastre um aluno por vez ou importe uma planilha CSV revisada.</p><button class="button button-secondary" data-action="open-student-dialog" data-class-id="${escapeAttr(classItem.id)}" type="button">Cadastrar aluno</button></div>`;
  const historyContent = history.length ? `<div class="history-list">${history.map((entry) => {
    const marked = Number(entry.markedCount || countMarked(entry.records));
    const present = Number(entry.presentCount || countPresent(entry.records));
    const rate = marked ? Math.round((present / marked) * 100) : 0;
    return `<div class="history-row"><div><strong>${formatDate(entry.date)}${entry.sessionTime ? ` · ${escapeHtml(entry.sessionTime)}` : ""}</strong><small>${marked} marcação${marked === 1 ? "" : "ões"}</small></div><span class="pill">${present} presença${present === 1 ? "" : "s"}</span><span class="history-rate">${marked ? `${rate}%` : "—"}</span></div>`;
  }).join("")}</div>` : `<div class="empty-state"><span aria-hidden="true">✓</span><h3>Ainda não há histórico</h3><p>A primeira chamada salva aparecerá aqui, com data e percentual de presença.</p><button class="button button-secondary" data-action="open-attendance" data-id="${escapeAttr(classItem.id)}" type="button">Fazer chamada</button></div>`;
  const content = state.classDetailTab === "history" ? historyContent : studentContent;
  const countText = students.length ? `${students.length} aluno${students.length === 1 ? "" : "s"} carregado${students.length === 1 ? "" : "s"}` : "Sem alunos cadastrados";
  return `<article class="panel class-detail"><div class="class-detail-header"><div><h3>${escapeHtml(classItem.name || "Turma sem nome")}</h3><p>${escapeHtml([classItem.sport, classItem.ageGroup, classItem.location, classItem.schedule].filter(Boolean).join(" · ") || "Complete os dados operacionais da turma.")}</p></div><div class="class-detail-actions"><button class="button button-secondary button-compact" data-action="toggle-class" data-id="${escapeAttr(classItem.id)}" type="button">${classItem.active === false ? "Ativar turma" : "Desativar turma"}</button><button class="button button-secondary button-compact" data-action="number-students" data-id="${escapeAttr(classItem.id)}" type="button">Gerar matrículas pendentes</button><button class="button button-ghost button-compact" data-action="edit-class" data-id="${escapeAttr(classItem.id)}" type="button">Editar turma</button>${state.isAdmin ? `<button class="button button-ghost button-compact" style="color:#b42318" data-action="delete-class-admin" data-id="${escapeAttr(classItem.id)}" type="button">Excluir turma e dados</button>` : ""}<button class="button button-primary button-compact" data-action="open-attendance" data-id="${escapeAttr(classItem.id)}" type="button">Fazer chamada</button></div></div><div class="class-detail-tabs"><button class="detail-tab ${state.classDetailTab === "students" ? "active" : ""}" data-action="detail-tab" data-tab="students" type="button">Alunos <span>(${students.length})</span></button><button class="detail-tab ${state.classDetailTab === "history" ? "active" : ""}" data-action="detail-tab" data-tab="history" type="button">Histórico <span>(${history.length})</span></button></div><div class="student-toolbar"><p>${state.classDetailTab === "students" ? countText : "Últimas 30 chamadas desta turma"}</p>${state.classDetailTab === "students" ? `<button class="button button-secondary button-compact" data-action="open-student-dialog" data-class-id="${escapeAttr(classItem.id)}" type="button">+ Cadastrar aluno</button>` : ""}</div>${content}</article>`;
}

async function ensureAttendanceReady() {
  if (!state.classes.length) {
    renderAttendance();
    return;
  }
  const classId = state.attendance.classId || state.selectedClassId || state.classes[0].id;
  state.attendance.classId = classId;
  ui["attendance-class"].value = classId;
  await loadStudents(classId);
  await loadAttendance();
}

async function onAttendanceFilterChange() {
  state.attendance.classId = ui["attendance-class"].value;
  state.attendance.date = ui["attendance-date"].value || localDate();
  state.attendance.sessionTime = ui["attendance-time"].value || localTime();
  state.attendance.dirty = false;
  if (state.attendance.classId) {
    selectClass(state.attendance.classId);
    await loadStudents(state.attendance.classId);
  }
  await loadAttendance();
}

async function loadAttendance() {
  const { classId, date } = state.attendance;
  if (!classId || !date) {
    renderAttendance();
    return;
  }
  try {
    let entry;
    if (state.isDemo) {
      entry = repository.getDemoAttendance(classId).find((item) => item.date === date);
    } else {
      const snapshot = await getDoc(doc(firebase.db, "classes", classId, "attendance", date));
      entry = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
    }
    state.attendance = { sessionKind: entry?.sessionKind || "regular", sessionNote: entry?.sessionNote || "", classId, date, sessionTime: entry?.sessionTime || state.attendance.sessionTime || localTime(), records: structuredClone(entry?.records || {}), dirty: false };
    renderAttendance();
  } catch (error) {
    toast(friendlyFirebaseError(error), "error");
  }
}

async function openAttendanceFor(classId) {
  if (!classId) {
    toast("Cadastre uma turma antes de iniciar uma chamada.", "error");
    return;
  }
  state.attendance.classId = classId;
  selectClass(classId);
  ui["attendance-class"].value = classId;
  setActiveView("attendance");
  await ensureAttendanceReady();
}

function openProfileDialog() {
  const form = ui["profile-form"];
  form.elements.displayName.value = state.profile?.displayName || state.user?.displayName || "";
  form.elements.phone.value = state.profile?.phone || "";
  form.elements.specialty.value = state.profile?.specialty || "";
  form.elements.organization.value = state.profile?.organization || "";
  ui["profile-form-message"].textContent = "";
  showDialog("profile-dialog");
}

async function saveProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  if (!values.displayName) {
    setFormMessage("profile-form-message", "Informe seu nome profissional.");
    return;
  }
  setFormMessage("profile-form-message", "Salvando…", true);
  try {
    await repository.saveProfile(values);
    state.profile = { ...(state.profile || {}), ...values };
    updateProfileUi();
    closeDialog("profile-dialog");
    toast("Perfil profissional atualizado.");
  } catch (error) {
    setFormMessage("profile-form-message", friendlyFirebaseError(error));
  }
}

function openClassDialog(classId = "") {
  if (!requireProfile()) return;
  const form = ui["class-form"];
  form.reset();
  const item = state.classes.find((row) => row.id === classId);
  form.elements.classId.value = classId;
  populateClassTerritoryZoneOptions(item?.territoryZoneId || "");
  if (item) {
    ui["class-dialog-title"].textContent = "Editar turma";
    ["name", "sport", "ageGroup", "location", "territoryZoneId", "schedule", "notes"].forEach((key) => { form.elements[key].value = item[key] || ""; });
  } else {
    ui["class-dialog-title"].textContent = "Cadastrar turma";
  }
  window.CensoV2?.openClass(form, item);
  setFormMessage("class-form-message", "");
  showDialog("class-dialog");
}

async function saveClass(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  if (!values.name || !values.sport) {
    setFormMessage("class-form-message", "Nome da turma e modalidade são obrigatórios.");
    return;
  }
  const scheduleError = window.CensoV2?.prepareClass(form, values);
  if (scheduleError) { setFormMessage("class-form-message", scheduleError); return; }
  setFormMessage("class-form-message", "Salvando…", true);
  try {
    const id = await repository.saveClass(values);
    closeDialog("class-dialog");
    toast(values.classId ? "Turma atualizada." : "Turma cadastrada.");
    if (!values.classId && id) selectClass(id);
  } catch (error) {
    setFormMessage("class-form-message", friendlyFirebaseError(error));
  }
}

function openStudentDialog(classId, studentId = "") {
  if (!requireProfile()) return;
  const form = ui["student-form"];
  form.reset();
  document.getElementById('find-existing-student').hidden=true;
  state.lastPostalLookup='';state.postalRequestId=(state.postalRequestId||0)+1;
  document.getElementById('postal-neighborhood-choice').hidden=true;
  ui['postal-code-help'].textContent='O CEP identifica o bairro e sugere a zona automaticamente.';
  ui['lookup-postal-code'].disabled=false;
  form.elements.classId.value = classId;
  form.elements.studentId.value = studentId;
  const student = (state.studentsByClass[classId] || []).find((item) => item.id === studentId);
  populateTerritoryZoneOptions(student?.territoryZoneId || student?.geo?.zoneId || "");
  if (student) {
    ui["student-dialog-title"].textContent = "Editar aluno";
    form.elements.territoryMatchMethod.value=student.geo?.matchMethod||"manual-zone-selection";
    Object.entries(student).forEach(([key, value]) => {
      if (form.elements[key] && typeof value === "string") form.elements[key].value = key === "gender" ? normalizeGender(value) : value;
    });
  } else {
    ui["student-dialog-title"].textContent = "Cadastrar aluno";
    form.elements.enrollmentStatus.value = "Ativa";
    form.elements.contactTarget.value = "guardian";
    form.elements.contactPermission.value = "not_informed";
    form.elements.censusReviewStatus.value = "pending";
  }
  syncTerritoryFields(form);
  window.CensoV2?.openStudent(form);
  updateStudentAgePreview();
  const classDisplay = document.getElementById("student-class-display");
  if (classDisplay) classDisplay.value = state.classes.find((item) => item.id === classId)?.name || classId || "";
  setFormMessage("student-form-message", "");
  showDialog("student-dialog");
  if(state.isAdmin) readRegistry().then(rows=>{
    const master=student?.globalStudentId?rows.find(r=>r.globalStudentId===student.globalStudentId):null;
    if(master&&form.elements.studentId.value===studentId&&form.elements.fullName.value===student.fullName&&form.elements.birthDate.value===(student.birthDate||'')){form.elements.fullName.value=master.fullName;form.elements.birthDate.value=master.birthDate||'';updateStudentAgePreview();}
    document.getElementById("registry-id-options").innerHTML=rows.map(s=>`<option value="${escapeAttr(s.globalStudentId)}">${escapeHtml(s.fullName)}${s.birthDate?" • "+formatDate(s.birthDate):""}</option>`).join("");}).catch(e=>toast(e.message,"error"));
}

async function saveStudent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  if (!values.fullName || !values.classId) {
    setFormMessage("student-form-message", "Informe o nome completo e a turma do aluno.");
    return;
  }
  syncTerritoryFields(form);
  Object.assign(values, formValues(form));
  values.state = values.state.toUpperCase();
  if (values.birthDate && !ageExactToday(values.birthDate)) {
    setFormMessage("student-form-message", "Confira a data de nascimento: informe uma data válida que não esteja no futuro.");
    return;
  }
  values.guardianPhone = formatPhone(values.guardianPhone || "");
  values.studentPhone = formatPhone(values.studentPhone || "");
  values.phone = formatPhone(values.phone || "");
  const enrollmentCode = (values.enrollmentCode || "").trim().toLocaleLowerCase("pt-BR");
  if (enrollmentCode && (state.studentsByClass[values.classId] || []).some((row) =>
    row.id !== values.studentId && (row.enrollmentCode || "").trim().toLocaleLowerCase("pt-BR") === enrollmentCode)) {
    setFormMessage("student-form-message", "Este código de matrícula já está em uso nesta turma.");
    return;
  }
  setFormMessage("student-form-message", "Salvando…", true);
  try {
    await repository.saveStudent(values);
    closeDialog("student-dialog");
    toast(values.studentId ? "Cadastro do aluno atualizado." : "Aluno cadastrado.");
    if (state.isDemo || state.selectedClassId !== values.classId) await loadStudents(values.classId);
    renderClasses();
    renderAttendance();
  } catch (error) {
    setFormMessage("student-form-message", friendlyFirebaseError(error) + (error?.code === "permission-denied" ? " Confirme se as regras firestore.rules desta versão foram publicadas no Firebase e se a turma pertence à sua conta." : ""));
  }
}

function confirmarExclusaoTurma(nome) {
  return new Promise((resolve) => {
    const dialogo = document.createElement("dialog");
    dialogo.className = "dialog";
    dialogo.setAttribute("aria-label", "Confirmar exclusão da turma");
    dialogo.innerHTML = `<div class="dialog-heading"><h2>Excluir turma?</h2></div>
      <p>Deseja realmente excluir <strong data-nome-turma></strong>?</p>
      <p>Os alunos e o histórico de chamadas vinculados também serão excluídos permanentemente.</p>
      <div class="dialog-actions">
        <button type="button" class="button button-secondary" data-resposta="nao">Não</button>
        <button type="button" class="button button-primary" data-resposta="sim">Sim, excluir</button>
      </div>`;
    dialogo.querySelector("[data-nome-turma]").textContent = nome;
    let confirmou = false;
    dialogo.querySelector('[data-resposta="nao"]').addEventListener("click", () => dialogo.close());
    dialogo.querySelector('[data-resposta="sim"]').addEventListener("click", () => { confirmou = true; dialogo.close(); });
    dialogo.addEventListener("close", () => { dialogo.remove(); resolve(confirmou); }, { once: true });
    document.body.appendChild(dialogo);
    dialogo.showModal();
  });
}

async function deleteClassAsAdmin(classId) {
  if (!state.isAdmin) { toast("Operação exclusiva da administração.", "error"); return; }
  const item = state.classes.find((entry) => entry.id === classId);
  if (!item) return;
  const name = item.name || "Turma sem nome";
  if (!(await confirmarExclusaoTurma(name))) return;
  try {
    await repository.createDeletionAudit({ action: "delete_class", classId, className: name, backupReference: "Backup não informado; exclusão confirmada no aplicativo" });
    await repository.deleteClassAsAdmin(classId);
    state.selectedClassId = null;
    delete state.studentsByClass[classId];
    delete state.histories[classId];
    toast("Turma e seus dados vinculados excluídos.");
    if (state.isDemo) subscribeClasses();
  } catch (error) { toast(friendlyFirebaseError(error), "error"); }
}

async function deleteStudent(classId, studentId) {
  if (!state.isAdmin) { toast("A exclusão de cadastros é exclusiva da administração.", "error"); return; }
  const student = (state.studentsByClass[classId] || []).find((row) => row.id === studentId);
  if (!student) return;
  const studentName = student.preferredName || student.fullName || "este aluno";
  const confirmed = window.confirm(`Excluir definitivamente o cadastro de ${studentName}? As chamadas já gravadas não serão apagadas.`);
  if (!confirmed) return;
  const typed = window.prompt(`Para confirmar, digite exatamente:\nEXCLUIR ${studentName}`);
  if (typed !== `EXCLUIR ${studentName}`) { toast("Exclusão cancelada: confirmação não corresponde."); return; }
  try {
    await repository.createDeletionAudit({ action: "delete_student", classId, studentId, studentName, backupReference: "Cadastro removido sem exclusão do histórico de chamadas" });
    await repository.deleteStudent(classId, studentId);
    toast("Cadastro removido. O histórico de chamada foi preservado.");
    if (state.isDemo || state.selectedClassId !== classId) await loadStudents(classId);
    renderClasses();
    renderAttendance();
  } catch (error) {
    toast(friendlyFirebaseError(error), "error");
  }
}

function openTerritoryImportDialog() {
  if (!state.isAdmin) {
    toast("A importação de zonas é restrita à gestão autorizada.", "error");
    return;
  }
  const form = ui["territory-import-form"];
  form.reset();
  form.elements.zoneNameProperty.value = "name";
  form.elements.sectorProperty.value = "sector";
  setFormMessage("territory-import-message", "");
  showDialog("territory-import-dialog");
}

async function importTerritoryZones(event) {
  event.preventDefault();
  if (!state.isAdmin) {
    setFormMessage("territory-import-message", "A importação de zonas é restrita à gestão autorizada.");
    return;
  }
  const form = event.currentTarget;
  const file = ui["territory-geojson-file"].files?.[0];
  const values = formValues(form);
  if (!file || !values.sourceVersion) {
    setFormMessage("territory-import-message", "Selecione o GeoJSON e informe a fonte/versão aprovada.");
    return;
  }
  setFormMessage("territory-import-message", "Validando a camada…", true);
  try {
    const source = JSON.parse(await file.text());
    const zones = normalizeTerritoryFeatures(source, values);
    await repository.importTerritoryZones(zones);
    closeDialog("territory-import-dialog");
    toast(`${zones.length} zona${zones.length === 1 ? "" : "s"} atualizada${zones.length === 1 ? "" : "s"}. A camada anterior não foi excluída automaticamente.`);
  } catch (error) {
    setFormMessage("territory-import-message", error.message || "Não foi possível importar a camada territorial.");
  }
}

function normalizeTerritoryFeatures(source, values) {
  if (source?.type !== "FeatureCollection" || !Array.isArray(source.features)) {
    throw new Error("Use um GeoJSON do tipo FeatureCollection.");
  }
  if (!source.features.length) throw new Error("O GeoJSON não contém zonas para importar.");
  if (source.features.length > 350) throw new Error("Importe no máximo 350 zonas por vez para revisão segura.");
  const seen = new Set();
  return source.features.map((feature, index) => {
    const properties = feature?.properties || {};
    const name = String(properties[values.zoneNameProperty] ?? properties.name ?? properties.nome ?? properties.bairro ?? "").trim();
    const sector = String(properties[values.sectorProperty] ?? properties.sector ?? properties.setor ?? properties.zona ?? "").trim();
    const geometry = feature?.geometry;
    if (!name) throw new Error(`A zona da linha ${index + 1} não tem nome.`);
    if (!geometryPoints(geometry).length) throw new Error(`A zona “${name}” não possui polígono válido em EPSG:4326.`);
    const geometryJson = JSON.stringify(geometry);
    if (geometryJson.length > 750000) throw new Error(`A geometria da zona “${name}” é grande demais para um documento Firestore.`);
    let id = `zone-${safeId(name)}`;
    let suffix = 2;
    while (seen.has(id)) { id = `zone-${safeId(name)}-${suffix}`; suffix += 1; }
    seen.add(id);
    return {
      id,
      name: name.slice(0, 120),
      sector: sector.slice(0, 100),
      sourceVersion: String(values.sourceVersion).trim().slice(0, 180),
      // Firestore rejects nested arrays. GeoJSON coordinates are therefore
      // serialized for storage and rehydrated only when the map needs them.
      geometry,
      geometryJson,
      geometryType: geometry.type,
      importedFrom: values.importedFrom || "geojson-approved",
      importedAtClient: new Date().toISOString()
    };
  });
}

function findStudent(classId, studentId) {
  return (state.studentsByClass[classId] || []).find((student) => student.id === studentId);
}

function contactStudent(classId, studentId, channel) {
  const student = findStudent(classId, studentId);
  if (!student) return;
  const contact = getStudentContact(student);
  if (!contact.phone || !isContactAllowed(contact.permission, channel)) {
    toast("Registre o telefone e a autorização do canal antes de fazer contato.", "error");
    return;
  }
  const phone = brazilPhoneDigits(contact.phone);
  if (!phone) {
    toast("O telefone cadastrado não parece válido. Revise antes de fazer contato.", "error");
    return;
  }
  const studentName = student.preferredName || student.fullName || "este aluno";
  if (channel === "whatsapp") {
    if (!window.confirm(`Abrir uma conversa de WhatsApp com ${contact.label} sobre ${studentName}? Nenhuma mensagem será enviada automaticamente.`)) return;
    window.open(`https://wa.me/${phone}`, "_blank", "noopener,noreferrer");
    return;
  }
  if (!window.confirm(`Iniciar uma ligação para ${contact.label} sobre ${studentName}?`)) return;
  window.location.href = `tel:+${phone}`;
}

async function generateReport() {
  const mode = ui["report-period-type"]?.value || "month";
  if (mode === "students") { try { await generateStudentReport(); } catch(e) { toast(friendlyFirebaseError(e), "error"); } return; }
  const month = mode === "week" ? ui["report-week"]?.value : ui["report-month"].value;
  const classId = ui["report-class"].value;
  if (!month) {
    toast("Selecione o período do relatório.", "error");
    return;
  }
  const targets = classId === "all" ? state.classes : state.classes.filter((item) => item.id === classId);
  if (!targets.length) {
    toast("Não há turmas disponíveis neste escopo.", "error");
    return;
  }
  const button = ui["generate-report"];
  button.disabled = true;
  button.textContent = "Gerando…";
  try {
    const report = await buildReport(month, targets, mode);
    state.report = report;
    renderReport();
    toast("Relatório gerado.");
  } catch (error) {
    console.error(error);
    toast(friendlyFirebaseError(error), "error");
  } finally {
    button.disabled = false;
    button.textContent = "Gerar relatório";
  }
}

function isoWeekBounds(week) {
  const match = /^(\d{4})-W(\d{2})$/.exec(week || "");
  if (!match) throw new Error("Semana inválida.");
  const year = Number(match[1]), number = Number(match[2]);
  if (number < 1 || number > 53) throw new Error("Semana inválida.");
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (number - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const iso = date => date.toISOString().slice(0, 10);
  return { start: iso(monday), end: iso(sunday) };
}

function printReport() {
  if (!state.report) {
    toast("Gere um relatório antes de salvar em PDF.", "error");
    return;
  }
  window.print();
}

async function handleCsvFile(event) {
  const file = event.target.files?.[0];
  const small = $("small", event.currentTarget.parentElement);
  if (!file) return;
  small.textContent = file.name;
  try {
    const text = await file.text();
    const rows = parseCsv(text);
    const normalized = normalizeCsvRows(rows);
    if (!normalized.length) throw new Error("Não encontramos linhas válidas com a coluna nome preenchida.");
    if (normalized.length > 400) throw new Error("Importe no máximo 400 alunos por arquivo para revisar com segurança.");
    state.importRows = normalized;
    updateImportReadiness();
    renderImportPreview();
  } catch (error) {
    state.importRows = [];
    updateImportReadiness();
    ui["import-summary"].textContent = error.message || "Não foi possível ler o arquivo.";
    ui["import-preview"].classList.add("hidden");
    toast(error.message || "Arquivo inválido.", "error");
  }
}

function updateImportReadiness() {
  const classId = ui["import-class"]?.value;
  const reviewed = Boolean(ui["import-reviewed"]?.checked);
  const rows = state.importRows.length;
  const messages = !classId
    ? "Escolha primeiro a turma de destino."
    : !rows
      ? "Carregue um CSV para revisar as linhas antes de importar."
      : !reviewed
        ? `${rows} linha${rows === 1 ? "" : "s"} lida${rows === 1 ? "" : "s"}. Marque que a revisão foi concluída para liberar a importação.`
        : `${rows} cadastro${rows === 1 ? "" : "s"} revisado${rows === 1 ? "" : "s"}, pronto${rows === 1 ? "" : "s"} para importar nesta turma.`;
  ui["confirm-import"].disabled = !(classId && rows && reviewed);
  if (ui["import-summary"]) ui["import-summary"].textContent = messages;
}

function renderImportPreview() {
  const preview = state.importRows.slice(0, 5);
  ui["import-preview"].classList.remove("hidden");
  const duplicates = state.importRows.length - new Set(state.importRows.map((row) => `${censoKey(row.fullName)}|${row.birthDate || ""}`)).size;
  ui["import-preview"].innerHTML = `<h3>Prévia de importação</h3><p>Mostrando ${preview.length} de ${state.importRows.length} linha${state.importRows.length === 1 ? "" : "s"}. Confira antes de salvar.${duplicates ? ` Atenção: há ${duplicates} possível${duplicates === 1 ? "" : "is"} duplicidade${duplicates === 1 ? "" : "s"} no próprio arquivo.` : ""}</p><table class="preview-table"><thead><tr><th>Nome</th><th>Nascimento</th><th>Bairro</th><th>Responsável</th><th>Telefone</th><th>Cadastro</th></tr></thead><tbody>${preview.map((row) => `<tr><td>${escapeHtml(row.fullName)}</td><td>${escapeHtml(row.birthDate || "—")}</td><td>${escapeHtml(row.neighborhood || "Bairro não informado")}</td><td>${escapeHtml(row.guardianName || "—")}</td><td>${escapeHtml(row.phone || row.guardianPhone || "—")}</td><td>${escapeHtml(row.registrationDate || "—")}</td></tr>`).join("")}</tbody></table>`;
}

async function importStudents() {
  const classId = ui["import-class"].value;
  if (!classId || !state.importRows.length || !ui["import-reviewed"].checked) {
    updateImportReadiness();
    toast("Escolha a turma, carregue o CSV e confirme que revisou a importação.", "error");
    return;
  }
  const button = ui["confirm-import"];
  button.disabled = true;
  button.textContent = "Importando…";
  try {
    await repository.importStudents(classId, state.importRows);
    toast(`${state.importRows.length} cadastro${state.importRows.length === 1 ? "" : "s"} importado${state.importRows.length === 1 ? "" : "s"}.`);
    state.importRows = [];
    ui["import-file"].value = "";
    $("small", ui["import-file"].parentElement).textContent = "Nenhum arquivo selecionado";
    ui["import-reviewed"].checked = false;
    ui["import-summary"].textContent = "Importação concluída. Carregue outro arquivo se necessário.";
    ui["import-preview"].classList.add("hidden");
    if (state.isDemo || state.selectedClassId !== classId) await loadStudents(classId);
    renderClasses();
    renderAttendance();
  } catch (error) {
    if (["permission-denied", "firestore/permission-denied"].includes(error?.code)) {
      ui["import-summary"].textContent = "O Firebase recusou esta importação. Confirme que esta turma pertence à sua conta ou que a conta administradora e as regras publicadas estão corretas.";
      toast("Importação recusada pelo Firebase. Consulte a gestão da turma e as regras de acesso.", "error");
    } else {
      toast(friendlyFirebaseError(error), "error");
    }
  } finally {
    button.textContent = "Importar alunos revisados";
    updateImportReadiness();
  }
}

function startTour() {
  state.tourIndex = 0;
  renderTour();
  showDialog("tour-dialog");
}

function advanceTour(direction) {
  const next = state.tourIndex + direction;
  if (next < 0) return;
  if (next >= TOUR_STEPS.length) {
    closeDialog("tour-dialog");
    removeTourHighlight();
    toast("Tour concluído. Você já pode iniciar sua rotina.");
    return;
  }
  state.tourIndex = next;
  renderTour();
}

function renderTour() {
  removeTourHighlight();
  const step = TOUR_STEPS[state.tourIndex];
  ui["tour-step"].textContent = `TOUR ${state.tourIndex + 1} DE ${TOUR_STEPS.length}`;
  ui["tour-title"].textContent = step.title;
  ui["tour-body"].textContent = step.body;
  ui["tour-progress-bar"].style.width = `${((state.tourIndex + 1) / TOUR_STEPS.length) * 100}%`;
  ui["tour-back"].disabled = state.tourIndex === 0;
  ui["tour-next"].textContent = state.tourIndex === TOUR_STEPS.length - 1 ? "Concluir" : "Próximo";
  setActiveView(step.view, { preserveScroll: true });
  window.setTimeout(() => {
    const target = $(step.selector);
    target?.classList.add("tour-target");
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 50);
}

function removeTourHighlight() {
  $$(".tour-target").forEach((element) => element.classList.remove("tour-target"));
}

async function lookupPostalCode() {
  const form=ui['student-form'], helper=ui['postal-code-help'];
  const postalCode=String(form.elements.postalCode.value||'').replace(/\D/g,'');
  if(postalCode.length!==8){helper.textContent='Informe os 8 dígitos do CEP.';return;}
  const requestId=(state.postalRequestId||0)+1;state.postalRequestId=requestId;
  const button=ui['lookup-postal-code'];button.disabled=true;helper.textContent='Buscando endereço, bairro e zona…';
  const choice=document.getElementById('postal-neighborhood-choice');choice.hidden=true;choice.replaceChildren();
  try {
    let result=null;
    try {const response=await fetch('https://viacep.com.br/ws/'+postalCode+'/json/',{signal:AbortSignal.timeout(10000)});if(response.ok){const data=await response.json();if(!data.erro)result=data;}}catch{}
    if(requestId!==state.postalRequestId||String(form.elements.postalCode.value).replace(/\D/g,'')!==postalCode)return;
    if(result){for(const [field,value]of Object.entries({street:result.logradouro,city:result.localidade,state:result.uf}))if(value)form.elements[field].value=value;}
    const assignment=resolvePostalTerritory(postalCode,result?.bairro||'',result?.ibge||'');
    form.elements.postalCode.value=formatPostalCode(postalCode);
    if(assignment.zone){applyPostalTerritory(form,assignment.neighborhood,assignment.zone,'cep-cnefe-2022');helper.textContent='Bairro: '+assignment.neighborhood+' • zona vinculada: '+assignment.zone.name+'. Confira o endereço antes de salvar.';}
    else {
      form.elements.territoryZoneId.value='';form.elements.territoryMatchMethod.value='not-classified';syncTerritoryFields(form);
      if(result?.bairro)form.elements.neighborhood.value=result.bairro;
      if(assignment.candidates.length){choice.add(new Option('Selecione o bairro para confirmar a zona',''));assignment.candidates.forEach(name=>choice.add(new Option(name,name)));choice.hidden=false;helper.textContent='Este CEP tem mais de uma referência de bairro. Selecione o bairro correto para vincular a zona.';}
      else helper.textContent=assignment.outside?'CEP de outro município: nenhuma zona de Votorantim foi vinculada.':result?'Endereço localizado. Selecione o bairro ou a zona manualmente; não há correspondência segura na base.':'CEP não localizado na consulta ou na base local. Informe o endereço e a zona manualmente.';
    }
  }finally{if(requestId===state.postalRequestId)button.disabled=false;}
}

function requireProfile() {
  if (state.profile?.displayName) return true;
  toast("Confirme seu perfil profissional antes de continuar.", "error");
  openProfileDialog();
  return false;
}

function showDialog(id) {
  const dialog = ui[id];
  if (dialog && !dialog.open) dialog.showModal();
}

function closeDialog(id) {
  const dialog = ui[id];
  if (dialog?.open) dialog.close();
  if (id === "tour-dialog") removeTourHighlight();
}

function setFormMessage(id, message, success = false) {
  ui[id].textContent = message || "";
  ui[id].classList.toggle("success", Boolean(success));
}

async function runFormSubmission(event, handler) {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.submitting === 'true') return;
  form.dataset.submitting = 'true';
  const buttons = [...form.querySelectorAll('[type="submit"]')];
  const previous = buttons.map(button => ({button, disabled:button.disabled, text:button.textContent}));
  buttons.forEach(button => {button.disabled = true;button.textContent = 'Salvando…';});
  try { await handler(event); }
  catch(error) { toast(friendlyFirebaseError(error), 'error'); }
  finally {
    form.dataset.submitting = 'false';
    previous.forEach(({button, disabled, text}) => {button.disabled = disabled;button.textContent = text;});
  }
}

function toast(message, type = "success") {
  const element = document.createElement("div");
  element.className = `toast ${type === "error" ? "error" : ""}`;
  element.innerHTML = `<span class="toast-icon">${type === "error" ? "!" : "✓"}</span><span>${escapeHtml(message)}</span>`;
  ui["toast-region"].append(element);
  window.setTimeout(() => element.remove(), 4800);
}

const repository = {
  async getProfile() {
    if (state.isDemo) return demoData().profile;
    const snapshot = await getDoc(doc(firebase.db, "users", state.user.uid));
    return snapshot.exists() ? snapshot.data() : null;
  },
  async isAdmin() {
    const snapshot = await getDoc(doc(firebase.db, "adminUsers", state.user.uid));
    return snapshot.exists();
  },
  async saveProfile(values) {
    const profile = {
      displayName: values.displayName,
      phone: values.phone,
      specialty: values.specialty,
      organization: values.organization,
      email: state.user.email || "",
      photoURL: state.user.photoURL || ""
    };
    if (state.isDemo) {
      const data = demoData();
      data.profile = { ...(data.profile || {}), ...profile, updatedAt: new Date().toISOString() };
      writeDemoData(data);
      return;
    }
    const ref = doc(firebase.db, "users", state.user.uid);
    const prior = state.profile;
    await setDoc(ref, {
      ...profile,
      ...(prior ? {} : { role: "teacher", createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp()
    }, { merge: true });
  },
  getDemoClasses() {
    return Object.entries(demoData().classes).map(([id, row]) => ({ id, ...row })).sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
  },
  async saveClass(values) {
    const existing = state.classes.find((item) => item.id === values.classId);
    const payload = {
      name: values.name,
      sport: values.sport,
      ageGroup: values.ageGroup,
      location: values.location,
      territoryZoneId: values.territoryZoneId || "",
      schedule: values.schedule,
      notes: values.notes,
      active: existing?.active ?? true,
      teacherId: state.user.uid,
      teacherName: state.profile?.displayName || state.user.displayName || ""
    };
    if (state.isDemo) {
      const data = demoData();
      const id = values.classId || createId();
      data.classes[id] = { ...(data.classes[id] || {}), ...payload, createdAt: data.classes[id]?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
      data.students[id] ||= {};
      data.attendance[id] ||= {};
      writeDemoData(data);
      subscribeClasses();
      return id;
    }
    if (values.classId) {
      await setDoc(doc(firebase.db, "classes", values.classId), { ...payload, teacherId: existing?.teacherId || state.user.uid, teacherName: existing?.teacherName || payload.teacherName, updatedAt: serverTimestamp() }, { merge: true });
      return values.classId;
    }
    const result = await addDoc(collection(firebase.db, "classes"), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return result.id;
  },
  getDemoStudents(classId) {
    return Object.entries(demoData().students[classId] || {}).map(([id, row]) => ({ id, ...row })).sort((a, b) => String(a.fullName).localeCompare(String(b.fullName), "pt-BR"));
  },
  getDemoTerritoryZones() {
    return Object.entries(demoData().territoryZones || {}).map(([id, row]) => ({ id, ...row })).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
  },
  async saveStudent(values) { return saveRegisteredStudent(values); },
  async deleteClassAsAdmin(classId) {
    if (!state.isAdmin) throw new Error("A exclusão de turmas é exclusiva do administrador.");
    if (state.isDemo) {
      const data = demoData();
      delete data.students[classId];
      delete data.attendance[classId];
      delete data.classes[classId];
      Object.keys(data.occurrences || {}).forEach((id) => { if (data.occurrences[id].classId === classId) delete data.occurrences[id]; });
      writeDemoData(data);
      return;
    }
    // Firestore não exclui subcoleções automaticamente. Remova-as antes do documento pai.
    // Lotes limitados a 300 operações, com leitura paginada para evitar estourar limites.
    for (const subcollection of ["students", "attendance"]) {
      for (;;) {
        const page = await getDocs(query(collection(firebase.db, "classes", classId, subcollection), limit(300)));
        if (page.empty) break;
        const batch = writeBatch(firebase.db);
        page.docs.forEach((entry) => batch.delete(entry.ref));
        await batch.commit();
      }
    }
    for (;;) {
      const entries = await getDocs(query(collection(firebase.db, "occurrences"), where("classId", "==", classId), limit(300)));
      if (entries.empty) break;
      const batch = writeBatch(firebase.db);
      entries.docs.forEach((entry) => batch.delete(entry.ref));
      await batch.commit();
    }
    await deleteDoc(doc(firebase.db, "classes", classId));
  },
  async deleteStudent(classId, studentId) {
    if (state.isDemo) {
      const data = demoData();
      delete data.students[classId]?.[studentId];
      writeDemoData(data);
      if (state.selectedClassId === classId) observeSelectedStudents(classId);
      return;
    }
    await deleteDoc(doc(firebase.db, "classes", classId, "students", studentId));
  },
  async createDeletionAudit(entry) {
    const payload = { ...entry, actorUid: state.user.uid, actorEmail: state.user.email || "", appVersion: APP_VERSION };
    if (state.isDemo) {
      const data = demoData();
      data.deletionAudit ||= {};
      data.deletionAudit[createId()] = { ...payload, createdAt: new Date().toISOString() };
      writeDemoData(data);
      return;
    }
    await addDoc(collection(firebase.db, "deletionAudit"), { ...payload, createdAt: serverTimestamp() });
  },
  async importTerritoryZones(zones) {
    if (!state.isAdmin) throw new Error("A importação de zonas é restrita à gestão autorizada.");
    if (state.isDemo) {
      const data = demoData();
      data.territoryZones ||= {};
      zones.forEach(({ id, geometry, ...zone }) => {
        data.territoryZones[id] = { ...zone, updatedAt: new Date().toISOString() };
      });
      writeDemoData(data);
      subscribeTerritoryZones();
    subscribeSportsCenters();
      return;
    }
    const batch = writeBatch(firebase.db);
    zones.forEach(({ id, geometry, ...zone }) => {
      // Replace the document so a legacy `geometry` field cannot remain beside
      // `geometryJson` and fail the strict Firestore rule validation.
      batch.set(doc(firebase.db, "territoryZones", id), { ...zone, updatedAt: serverTimestamp() });
    });
    await batch.commit();
  },
  getDemoAttendance(classId) {
    return Object.entries(demoData().attendance[classId] || {}).map(([id, row]) => ({ id, ...row })).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  },
  async saveAttendance(entry) {
    if (state.isDemo) {
      const data = demoData();
      data.attendance[entry.classId] ||= {};
      data.attendance[entry.classId][entry.date] = entry;
      writeDemoData(data);
      return;
    }
    await setDoc(doc(firebase.db, "classes", entry.classId, "attendance", entry.date), entry);
  },
  async getAttendanceRange(classId, start, end) {
    if (state.isDemo) return this.getDemoAttendance(classId).filter((entry) => entry.date >= start && entry.date <= end);
    const reportQuery = query(
      collection(firebase.db, "classes", classId, "attendance"),
      where("date", ">=", start),
      where("date", "<=", end)
    );
    const snapshot = await getDocs(reportQuery);
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  },
  async importStudents(classId, rows) {
    for (const row of rows) {
      const existing = await loadStudents(classId);
      const matches = existing.filter(s => row.enrollmentCode ? s.enrollmentCode === row.enrollmentCode : row.globalStudentId ? s.globalStudentId === row.globalStudentId : censoKey(s.fullName) === censoKey(row.fullName) && (s.birthDate||"") === (row.birthDate||""));
      if(matches.length > 1) throw new Error('Há homônimos na turma. Informe aluno_id e matricula_codigo para identificar o vínculo.');
      await this.saveStudent({ ...row, classId, studentId: matches[0]?.id || '' });
    }
    await loadStudents(classId);
    if (state.selectedClassId === classId) observeSelectedStudents(classId);
  }
};

function demoData() {
  try {
    const raw = localStorage.getItem(DEMO_STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.warn("Local demo storage unavailable", error);
  }
  return { profile: null, classes: {}, students: {}, territoryZones: {}, attendance: {}, deletionAudit: {} };
}

function writeDemoData(data) {
  localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(data));
}

// Allowlist shared by individual registration and CSV import. Never persist UI-only keys.
const STUDENT_ALLOWED_FIELDS = new Set([
  "territoryMatchMethod", "globalStudentId", "fullName", "preferredName", "enrollmentCode", "birthDate", "gender",
  "guardianName", "guardianPhone", "studentPhone", "phone", "guardianEmail",
  "contactTarget", "contactPermission", "contactConsentDate", "postalCode",
  "state", "street", "number", "complement", "neighborhood", "city",
  "school", "shift", "censusCode", "censusIntegrationId", "censusReferenceDate",
  "censusReviewStatus", "territoryZoneId", "territoryZoneName",
  "territorySector", "territorySource", "enrollmentStatus", "notes",
  "pcdStatus", "registrationDate"
]);

function ageAtEndOf2026(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate || "")) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || year > 2026 || year < 1900) return "";
  return String(2026 - year);
}
function ageExactToday(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate || "")) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  const birth = new Date(year, month - 1, day, 12);
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (birth > today || year < 1900) return "";
  let years = today.getFullYear() - year;
  let months = today.getMonth() - (month - 1);
  let days = today.getDate() - day;
  if (days < 0) {
    months--;
    // A data de referência do mês anterior determina o empréstimo de dias.
    days += new Date(today.getFullYear(), today.getMonth(), 0).getDate();
  }
  if (months < 0) { years--; months += 12; }
  // Ajusta aniversários no fim do mês sem produzir dias negativos.
  if (days < 0) { months--; days += new Date(today.getFullYear(), today.getMonth() - 1, 0).getDate(); }
  if (months < 0) { years--; months += 12; }
  if (years < 0 || years > 125) return "";
  return `${years} ${years === 1 ? "ano" : "anos"}, ${months} ${months === 1 ? "mês" : "meses"} e ${days} ${days === 1 ? "dia" : "dias"}`;
}
function updateStudentAgePreview() {
  const input = ui["student-age-preview"];
  if (input) input.value = ageExactToday(ui["student-form"]?.elements.birthDate?.value);
}
ui["student-form"]?.elements.birthDate?.addEventListener("input", updateStudentAgePreview);

function buildStudentPayload(fields, timestamp) {
  const automatic=(!fields.territoryZoneId&&!fields.geo?.zoneId)?resolvePostalTerritory(fields.postalCode,fields.neighborhood):null;
  const requestedZoneId = fields.territoryZoneId || fields.geo?.zoneId || automatic?.zone?.id || "";
  if(automatic?.zone)fields={...fields,neighborhood:automatic.neighborhood,territoryMatchMethod:"cep-cnefe-2022"};
  const requestedZoneName = fields.territoryZoneName || fields.geo?.zoneLabel || "";
  const zone = state.territoryZones.find((item) => item.id === requestedZoneId) || state.territoryZones.find((item) => comparableText(item.name) === comparableText(requestedZoneName));
  const zoneId = zone?.id || requestedZoneId;
  const territoryZoneName = zone?.name || fields.territoryZoneName || fields.geo?.zoneLabel || "";
  const territorySector = zone?.sector || fields.territorySector || fields.geo?.sector || "";
  const territorySource = zone?.sourceVersion || fields.territorySource || fields.geo?.sourceVersion || "";
  const guardianPhone = formatPhone(fields.guardianPhone || fields.contact?.guardianPhone || "");
  const studentPhone = formatPhone(fields.studentPhone || fields.contact?.studentPhone || "");
  const phone = formatPhone(fields.phone || fields.contact?.alternatePhone || "");
  const contactTarget = fields.contactTarget || fields.contact?.target || "guardian";
  const contactPermission = fields.contactPermission || fields.contact?.permission || "not_informed";
  const censusReviewStatus = fields.censusReviewStatus || fields.census?.reviewStatus || "pending";
  return {
    ...Object.fromEntries(Object.entries(fields).filter(([key]) => STUDENT_ALLOWED_FIELDS.has(key))),
    gender: normalizeGender(fields.gender),
    guardianPhone,
    studentPhone,
    phone,
    territoryZoneId: zoneId,
    territoryZoneName,
    territorySector,
    territorySource,
    contact: {
      target: contactTarget,
      permission: contactPermission,
      consentDate: fields.contactConsentDate || fields.contact?.consentDate || "",
      guardianPhone,
      studentPhone,
      alternatePhone: phone
    },
    census: {
      version: "censo-plus-base-1",
      integrationId: fields.censusIntegrationId || fields.census?.integrationId || "",
      referenceDate: fields.censusReferenceDate || fields.census?.referenceDate || "",
      reviewStatus: censusReviewStatus,
      externalCode: fields.censusCode || fields.census?.externalCode || ""
    },
    geo: {
      zoneId,
      zoneLabel: territoryZoneName,
      sector: territorySector,
      sourceVersion: territorySource,
      matchMethod: zone ? (fields.territoryMatchMethod || fields.geo?.matchMethod || "manual-zone-selection") : "not-classified"
    },
    updatedAt: timestamp
  };
}

function parseCsv(input) {
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const separator = detectSeparator(text);
  const rows = [];
  let current = "";
  let row = [];
  let quote = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quote && next === '"') { current += '"'; index += 1; continue; }
    if (character === '"') { quote = !quote; continue; }
    if (character === separator && !quote) { row.push(current.trim()); current = ""; continue; }
    if (character === "\n" && !quote) { row.push(current.trim()); if (row.some(Boolean)) rows.push(row); row = []; current = ""; continue; }
    current += character;
  }
  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows.shift().map(normalizeHeader);
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() || ""])));
}

function normalizeCsvRows(rows) {
  const aliases = {
    nome_completo: "fullName", nome: "fullName", full_name: "fullName",
    pcd: "pcdStatus", pessoa_com_deficiencia: "pcdStatus", data_cadastro: "registrationDate",
    nome_social: "preferredName", nome_preferido: "preferredName",
    aluno_id: "globalStudentId", id_aluno: "globalStudentId", matricula_codigo: "enrollmentCode", codigo_matricula: "enrollmentCode", matricula: "enrollmentCode",
    data_nascimento: "birthDate", nascimento: "birthDate",
    genero: "gender", sexo: "gender",
    responsavel_nome: "guardianName", nome_responsavel: "guardianName",
    telefone_responsavel: "guardianPhone", celular_responsavel: "guardianPhone",
    telefone_aluno: "studentPhone", celular_aluno: "studentPhone", telefone_participante: "studentPhone",
    telefone: "phone", telefone_alternativo: "phone",
    email_responsavel: "guardianEmail",
    contato_preferencial: "contactTarget", contato_destino: "contactTarget",
    canal_contato_autorizado: "contactPermission", contato_autorizado: "contactPermission", permissao_contato: "contactPermission",
    data_consentimento: "contactConsentDate", consentimento_contato_data: "contactConsentDate",
    cep: "postalCode", codigo_postal: "postalCode",
    logradouro: "street", endereco: "street", rua: "street",
    numero: "number", complemento: "complement", bairro: "neighborhood", cidade: "city", municipio: "city", uf: "state", estado: "state",
    escola: "school", unidade_referencia: "school", turno: "shift",
    codigo_censo: "censusCode", codigo_externo: "censusCode",
    identificador_censo: "censusIntegrationId", identificador_censo_mais: "censusIntegrationId",
    referencia_coleta_censo: "censusReferenceDate", data_referencia_censo: "censusReferenceDate",
    status_revisao_censo: "censusReviewStatus",
    zona_territorial: "territoryZoneName", zona: "territoryZoneName", setor_territorial: "territorySector", setor: "territorySector",
    fonte_territorial: "territorySource",
    situacao_matricula: "enrollmentStatus", status_matricula: "enrollmentStatus",
    observacoes: "notes", observacao: "notes"
  };
  const maxLength = {
    globalStudentId: 30, fullName: 120, preferredName: 120, enrollmentCode: 80, birthDate: 10, gender: 40, pcdStatus: 3, registrationDate: 10,
    guardianName: 120, guardianPhone: 20, studentPhone: 20, phone: 20, guardianEmail: 120,
    contactTarget: 20, contactPermission: 30, contactConsentDate: 10,
    postalCode: 10, street: 140, number: 20, complement: 80, neighborhood: 100,
    city: 100, state: 2, school: 140, shift: 30, censusCode: 80,
    censusIntegrationId: 80, censusReferenceDate: 10, censusReviewStatus: 30,
    territoryZoneId: 100, territoryZoneName: 120, territorySector: 100, territorySource: 180,
    enrollmentStatus: 30, notes: 500
  };
  return rows.map((raw) => {
    const normalized = { enrollmentStatus: "Ativa" };
    Object.entries(raw).forEach(([key, value]) => {
      const target = aliases[key];
      if (target && value) normalized[target] = value;
    });
    if (normalized.pcdStatus) {
      const pcd = normalizeHeader(normalized.pcdStatus);
      normalized.pcdStatus = ["sim", "s"].includes(pcd) ? "Sim" : ["nao", "n"].includes(pcd) ? "Não" : "";
    }
    normalized.gender = normalizeGender(normalized.gender);
    normalized.postalCode = formatPostalCode(normalized.postalCode || "");
    normalized.birthDate = normalizeImportDate(normalized.birthDate || "");
    normalized.registrationDate = normalizeImportDate(normalized.registrationDate || "");
    normalized.guardianPhone = formatPhone(normalized.guardianPhone || "");
    normalized.studentPhone = formatPhone(normalized.studentPhone || "");
    normalized.phone = formatPhone(normalized.phone || "");
    normalized.state = (normalized.state || "").toUpperCase().slice(0, 2);
    Object.entries(maxLength).forEach(([key, size]) => {
      if (normalized[key]) normalized[key] = String(normalized[key]).trim().slice(0, size);
    });
    return normalized;
  }).filter((row) => row.fullName);
}

function normalizeImportDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const candidate = iso ? raw : br ? `${br[3]}-${br[2]}-${br[1]}` : "";
  if (!candidate) return "";
  const [year, month, day] = candidate.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? candidate : "";
}

function detectSeparator(text) {
  const header = text.split("\n")[0] || "";
  return (header.match(/;/g) || []).length > (header.match(/,/g) || []).length ? ";" : ",";
}

function normalizeHeader(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function calculateTrend(sessions) {
  if (sessions.length < 4) return { value: 0, label: "Sem base" };
  const midpoint = Math.ceil(sessions.length / 2);
  const first = sessions.slice(0, midpoint);
  const last = sessions.slice(midpoint);
  const rate = (rows) => rows.length ? Math.round((rows.filter((item) => item.status === "P").length / rows.length) * 100) : 0;
  const diff = rate(last) - rate(first);
  return { value: diff, label: diff > 0 ? `+${diff} pp` : diff < 0 ? `${diff} pp` : "Estável" };
}

function isFirebaseConfigured(config) {
  return Boolean(config) && FIREBASE_REQUIRED_KEYS.every((key) => {
    const value = String(config[key] || "").trim();
    return value && !/COLE_AQUI|SEU_PROJETO/i.test(value);
  });
}

function friendlyFirebaseError(error) {
  if(!error?.code && error?.message)return error.message;
  const code = error?.code || "";
  const messages = {
    "auth/popup-closed-by-user": "A janela de acesso foi fechada antes da conclusão.",
    "auth/popup-blocked": "O navegador bloqueou a janela de acesso. Permita pop-ups e tente novamente.",
    "auth/unauthorized-domain": "Este domínio ainda não está autorizado no Firebase Authentication.",
    "auth/network-request-failed": "Não foi possível conectar ao Firebase. Verifique sua rede.",
    "auth/invalid-credential": "Não foi possível entrar com este e-mail e senha. Confira os dados ou use Esqueci minha senha.",
    "auth/wrong-password": "Não foi possível entrar com este e-mail e senha. Confira os dados ou use Esqueci minha senha.",
    "auth/user-not-found": "Não foi possível entrar com este e-mail e senha. Confira os dados ou crie uma conta se este for seu primeiro acesso.",
    "auth/invalid-email": "Informe um e-mail válido.",
    "auth/email-already-in-use": "Este e-mail já possui uma conta. Use Entrar na plataforma com sua senha atual. Se não lembrar a senha, clique em Esqueci minha senha.",
    "auth/user-disabled": "Esta conta foi desativada. Solicite à coordenação a revisão do acesso no Firebase Authentication.",
    "auth/too-many-requests": "Muitas tentativas de acesso. Aguarde alguns minutos antes de tentar novamente.",
    "auth/missing-password": "Informe sua senha para entrar.",
    "auth/weak-password": "Use uma senha mais forte.",
    "auth/operation-not-allowed": "O método de login ainda não foi ativado no Firebase Authentication.",
    "permission-denied": "Seu perfil não tem permissão para esta operação. Verifique as regras do Firestore.",
    "firestore/permission-denied": "Seu perfil não tem permissão para esta operação. Verifique as regras do Firestore.",
    "unavailable": "O serviço está temporariamente indisponível. Tente novamente.",
    "firestore/unavailable": "O serviço está temporariamente indisponível. Tente novamente."
  };
  return messages[code] || "Não foi possível concluir a operação. Consulte o guia de configuração se o problema persistir.";
}

function formValues(form) {
  return Object.fromEntries([...new FormData(form).entries()].map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]));
}

function localDate() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function localTime() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(11, 16);
}

function localMonth() { return localDate().slice(0, 7); }

function monthBounds(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function formatDate(value) {
  if (!value) return "Data não informada";
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(value instanceof Date ? value : new Date(value));
}

function formatMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1, 1);
  const text = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function initials(text = "") {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((word) => word[0]).join("") || "?").toUpperCase();
}

function formatPostalCode(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function formatPhone(value) {
  const raw = String(value || "").replace(/\D/g, "");
  const digits = (/^55\d{10,11}$/.test(raw) ? raw.slice(2) : raw).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function brazilPhoneDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(digits)) return digits;
  if (/^\d{10,11}$/.test(digits)) return `55${digits}`;
  return "";
}

function comparableText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
}

function contactPermissionLabel(value) {
  const labels = {
    whatsapp: "WhatsApp",
    call: "Ligação",
    both: "WhatsApp e ligação",
    no_contact: "Não autoriza",
    not_informed: "Não informado"
  };
  return labels[value] || "Não informado";
}

function safeId(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || createId();
}

function createId() {
  return typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadBlob(content, filename, type) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 500);
}

function emptyInline(title, text, actionLabel, action) {
  return `<div class="empty-state" style="min-height:190px"><span aria-hidden="true">+</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p><button class="button button-secondary" data-action="${escapeAttr(action)}" type="button">${escapeHtml(actionLabel)}</button></div>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function escapeAttr(value) { return escapeHtml(value); }

/* ===== V8 upgrade: institutional UX, occurrences, auth email/senha, P/J/F ===== */
PAGE_TITLES.modalities = ["MODALIDADES", "Modalidades e núcleos"];
PAGE_TITLES.occurrences = ["OCORRÊNCIAS", "Registro de ocorrências"];
PAGE_TITLES.settings = ["APARÊNCIA", "Tema e experiência"];
HELP_ARTICLES.splice(0, HELP_ARTICLES.length,
  {
    title: "Como usar a frequência P / J / F?",
    body: "P indica presente, F indica falta e J indica falta justificada. Sempre que marcar J, descreva o motivo no campo da linha antes de salvar a chamada."
  },
  {
    title: "Como funcionam as ocorrências?",
    body: "Na aba Ocorrências, escolha a turma, informe data, horário, o tipo do registro e escreva o ocorrido. O vínculo com aluno é opcional."
  },
  {
    title: "Como vincular professor a uma turma?",
    body: "Na visão de gestão, o administrador pode reatribuir uma turma para um professor que já tenha criado a própria conta. O professor passa a enxergar apenas as turmas atribuídas a ele."
  },
  {
    title: "Quem pode entrar com Google e quem usa e-mail/senha?",
    body: "O acesso administrativo pode continuar pelo Google, desde que a conta esteja cadastrada em adminUsers. Professores podem entrar com e-mail e senha após a ativação do provedor no Firebase Authentication."
  },
  {
    title: "Como usar WhatsApp e ligação?",
    body: "Você pode definir no cadastro se o contato preferencial é o responsável, o aluno ou um telefone alternativo, além da permissão para WhatsApp e/ou ligação."
  },
  {
    title: "Como interpretar o mapa e os núcleos?",
    body: "O mapa cruza os bairros/setores com as turmas vinculadas às zonas aprovadas. A nova lista de relações mostra bairros por núcleo e núcleos por bairro sem expor endereços individuais."
  }
);
state.users = [];
state.occurrences = [];
state.theme = safeStorageGet("votoesporte-theme") || "light";
state.occurrenceFilterClass = "all";
if (state.unsubscribers) {
  state.unsubscribers.users = null;
  state.unsubscribers.occurrences = null;
}

function applyTheme(theme = "light") {
  state.theme = theme === "dark" ? "dark" : "light";
  document.body.dataset.theme = state.theme;
  safeStorageSet("votoesporte-theme", state.theme);
  $$(".theme-option").forEach((button) => button.classList.toggle("active", button.dataset.theme === state.theme));
}

function renderSettings() {
  applyTheme(state.theme || safeStorageGet("votoesporte-theme") || "light");
}

function currentAuthEmail() { return String(ui["auth-email"]?.value || "").trim(); }
function currentAuthPassword() { return String(ui["auth-password"]?.value || ""); }

function authEmailIsValid() {
  const field = ui['auth-email'];
  if (!currentAuthEmail() || !field?.checkValidity()) {
    showAuthMessage('Informe um e-mail válido.');
    field?.reportValidity();
    return false;
  }
  return true;
}

async function requestPasswordRecovery() {
  if (state.authBusy) return;
  if (!firebase.auth) {showAuthMessage('O serviço de acesso não iniciou. Recarregue a página e tente novamente.');return;}
  if (!authEmailIsValid()) return;
  const email = currentAuthEmail();
  const message = 'Se houver uma conta com esse e-mail, você receberá as instruções para redefinir a senha. Confira também o spam.';
  setAuthBusy(true);
  showAuthMessage('Solicitando recuperação de senha…');
  try {
    firebase.auth.languageCode = 'pt-BR';
    await sendPasswordResetEmail(firebase.auth, email);
    showAuthMessage(message);
  } catch(error) {
    // Do not use recovery as an email-existence lookup.
    showAuthMessage(error?.code === 'auth/user-not-found' ? message : friendlyFirebaseError(error));
  } finally {setAuthBusy(false);}
}

async function signInWithEmailPassword(event) {
  event?.preventDefault?.();
  if (state.authBusy) return;
  if (!firebase.auth) {showAuthMessage('O serviço de acesso não iniciou. Recarregue a página e tente novamente.');return;}
  if (!authEmailIsValid()) return;
  const email = currentAuthEmail();
  const password = currentAuthPassword();
  if (!email || !password) {
    showAuthMessage("Informe e-mail e senha.");
    return;
  }
  setAuthBusy(true);
  try {
    await signInWithEmailAndPassword(firebase.auth, email, password);
  } catch (error) {
    showAuthMessage(friendlyFirebaseError(error));
  } finally {
    setAuthBusy(false);
  }
}

async function signUpWithEmailPassword() {
  if (state.authBusy) return;
  if (!firebase.auth) {showAuthMessage('O serviço de acesso não iniciou. Recarregue a página e tente novamente.');return;}
  if (!authEmailIsValid()) return;
  const email = currentAuthEmail();
  const password = currentAuthPassword();
  if (!email || !password) {
    showAuthMessage("Informe e-mail e senha com no mínimo 6 caracteres.");
    return;
  }
  if (password.length < 6) {
    showAuthMessage("A senha precisa ter no mínimo 6 caracteres.");
    return;
  }
  setAuthBusy(true);
  try {
    await createUserWithEmailAndPassword(firebase.auth, email, password);
    showAuthMessage("Conta criada com sucesso. Complete seu perfil ao entrar.");
  } catch (error) {
    showAuthMessage(friendlyFirebaseError(error));
  } finally {
    setAuthBusy(false);
  }
}

function wireStaticEvents() {
  ui["google-sign-in"]?.addEventListener("click", signInWithGoogle);
  ui["demo-sign-in"]?.addEventListener("click", startDemo);
  ui["email-auth-form"]?.addEventListener("submit", signInWithEmailPassword);
  ui["email-sign-up"]?.addEventListener("click", signUpWithEmailPassword);
  ui["email-password-reset"]?.addEventListener("click", requestPasswordRecovery);
  ui["mobile-menu"]?.addEventListener("click", () => ui.sidebar.classList.toggle("open"));
  ui["profile-menu"]?.addEventListener("click", () => {
    const open = ui["profile-popover"].classList.toggle("hidden");
    ui["profile-menu"].setAttribute("aria-expanded", String(!open));
  });
  ui["edit-profile"]?.addEventListener("click", () => {
    ui["profile-popover"].classList.add("hidden");
    openProfileDialog();
  });
  ui["sign-out"]?.addEventListener("click", signOutUser);
  ui["quick-attendance"]?.addEventListener("click", () => openAttendanceFor(state.selectedClassId || state.classes[0]?.id));
  ui["dashboard-add-class"]?.addEventListener("click", () => openClassDialog());
  ui["dashboard-refresh"]?.addEventListener("click", refreshIndicators);
  ui["modalities-filter"]?.addEventListener("input", renderModalities);
  ui["add-class"]?.addEventListener("click", () => openClassDialog());
  ui["save-attendance"]?.addEventListener("click", saveAttendance);
  ui["mark-all-present"]?.addEventListener("click", markAllPresent);
  ui["clear-attendance"]?.addEventListener("click", clearAttendance);
  ui["attendance-class"]?.addEventListener("change", onAttendanceFilterChange);
  ui["attendance-date"]?.addEventListener("change", onAttendanceFilterChange);
  ui["attendance-time"]?.addEventListener("change", () => {
    state.attendance.sessionTime = ui["attendance-time"].value || localTime();
    state.attendance.dirty = true;
    renderAttendance();
  });
  ui["generate-report"]?.addEventListener("click", generateReport);
  ui["export-csv"]?.addEventListener("click", exportReportCsv);
  ui["print-report"]?.addEventListener("click", printReport);
  ui["import-file"]?.addEventListener("change", handleCsvFile);
  ui["import-class"]?.addEventListener("change", updateImportReadiness);
  ui["import-reviewed"]?.addEventListener("change", updateImportReadiness);
  ui["lookup-postal-code"]?.addEventListener("click", lookupPostalCode);
  ui["confirm-import"]?.addEventListener("click", importStudents);
  ui["open-territory-import"]?.addEventListener("click", openTerritoryImportDialog);
  ui["territory-import-form"]?.addEventListener("submit", importTerritoryZones);
  ui["territory-sector-filter"]?.addEventListener("change", () => {
    state.territoryFilter = ui["territory-sector-filter"].value || "all";
    state.selectedTerritoryZoneId = null;
    renderTerritory();
    renderTerritoryLinks();
  });
  ui["start-tour"]?.addEventListener("click", startTour);
  ui["tour-back"]?.addEventListener("click", () => advanceTour(-1));
  ui["tour-next"]?.addEventListener("click", () => advanceTour(1));
  ui["profile-form"]?.addEventListener("submit", event => runFormSubmission(event, saveProfile));
  ui["class-form"]?.addEventListener("submit", event => runFormSubmission(event, saveClass));
  ui["student-form"]?.addEventListener("submit", event => runFormSubmission(event, saveStudent));
  ui["occurrence-form"]?.addEventListener("submit", event => runFormSubmission(event, saveOccurrence));
  document.addEventListener("change", (event) => {
    const id = event.target?.dataset?.contactTarget;
    if (id) updateStudentContactTarget(event.target.dataset.classId, id, event.target.value);
  });
  ui["occurrence-class"]?.addEventListener("change", async () => {
    const id = ui["occurrence-class"]?.value;
    if (id && !(id in state.studentsByClass)) await loadStudents(id);
    syncOccurrenceStudents();
  });
  ui["occurrence-filter-class"]?.addEventListener("change", () => {
    state.occurrenceFilterClass = ui["occurrence-filter-class"].value || "all";
    renderOccurrences();
  });
  ui["report-period-type"]?.addEventListener("change", () => {
    const mode = ui["report-period-type"].value;
    ui["report-month-wrap"].hidden = mode !== "month";
    ui["report-week-wrap"].hidden = mode !== "week";
  });
  $$("[data-view]").forEach((button) => button.addEventListener("click", () => setActiveView(button.dataset.view)));
  $$("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => closeDialog(button.dataset.closeDialog)));
  $$(".theme-option").forEach((button) => button.addEventListener("click", () => applyTheme(button.dataset.theme || "light")));
  document.addEventListener("click", event => handleDynamicClick(event).catch(error=>toast(friendlyFirebaseError(error),"error")));
  document.addEventListener("input", handleDynamicInput);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      ui.sidebar.classList.remove("open");
      removeTourHighlight();
    }
    const mapAction = event.target.closest?.('[data-action="select-territory-zone"]');
    if (mapAction && ["Enter", " "].includes(event.key)) {
      event.preventDefault();
      mapAction.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  });
  window.addEventListener("storage", (event) => {
    if (state.isDemo && event.key === DEMO_STORE_KEY) {
      subscribeClasses();
      subscribeTerritoryZones();
      subscribeOccurrences();
    }
  });
}

async function bootstrap() {
  wireStaticEvents();
  applyTheme(state.theme || "light");
  if (ui["attendance-date"]) ui["attendance-date"].value = state.attendance.date;
  if (ui["report-month"]) ui["report-month"].value = localMonth();
  if (ui["occurrence-date"]) ui["occurrence-date"].value = localDate();
  if (ui["occurrence-time"]) ui["occurrence-time"].value = localTime();
  renderHelp();
  renderSettings();
  await loadBundledTerritoryZones();

  const configured = isFirebaseConfigured(window.FIREBASE_CONFIG);
  if (!configured) {
    ui["firebase-setup-card"]?.classList.remove("hidden");
    [ui["google-sign-in"],ui["email-sign-in"],ui["email-sign-up"],ui["email-password-reset"]].forEach(button=>{if(button)button.disabled=true;});
    ui["demo-sign-in"]?.classList.remove("hidden");
    finishLoading();
    showAuthScreen();
    return;
  }

  try {
    finishLoading();
    showAuthScreen();
    firebase = createFirebase(window.FIREBASE_CONFIG);
    state.firebaseEnabled = true;
    onAuthStateChanged(firebase.auth, handleFirebaseUser, (error) => {
      console.error("Firebase auth listener error:", error);
      finishLoading();
      showAuthScreen();
      showAuthMessage("Falha ao conectar com a autenticação: " + friendlyFirebaseError(error));
    });
    getRedirectResult(firebase.auth).catch((error) => {
      console.error("Firebase redirect error:", error);
      showAuthMessage(friendlyFirebaseError(error));
    });
  } catch (error) {
    console.error("Firebase initialization failed", error);
    ui["firebase-setup-card"]?.classList.remove("hidden");
    ui["demo-sign-in"]?.classList.remove("hidden");
    showAuthMessage("Não foi possível iniciar o Firebase. Revise firebase-config.js.");
    finishLoading();
    showAuthScreen();
  }
}

async function prepareWorkspace() {
  try {
    finishLoading();
    state.profile = await repository.getProfile();
    state.isAdmin = state.isDemo || (!state.isDemo && (await repository.isAdmin()));
    state.profile ||= null;

    ui["auth-screen"]?.classList.add("hidden");
    ui.workspace?.classList.remove("hidden");
    ui["mode-badge"]?.classList.toggle("hidden", !state.isDemo);
    ui["admin-nav"]?.classList.toggle("hidden", !state.isAdmin);
    document.getElementById("registry-nav").classList.toggle("hidden", !state.isAdmin);
    ui["open-territory-import"]?.classList.toggle("hidden", !state.isAdmin);
    updateProfileUi();
    setActiveView("dashboard", { preserveScroll: true });
    subscribeUsers();
    subscribeClasses();
    subscribeTerritoryZones();
    subscribeOccurrences();
    renderSettings();

    if (!state.profile) {
      openProfileDialog();
      toast("Confirme seu perfil antes de cadastrar turmas.");
    }
  } catch (error) {
    console.error(error);
    showAuthMessage(friendlyFirebaseError(error));
    showAuthScreen();
  }
}

function clearWorkspaceState() {
  registryRows=[]; state.activityCatalogue=[]; state.selectedNeighborhood="";
  stopSubscriptions();
  state.profile = null;
  state.user = null;
  state.classes = [];
  state.users = [];
  state.occurrences = [];
  state.territoryZones = [];
  state.studentsByClass = {};
  state.histories = {};
  state.monthlyHistories = {};
  state.selectedClassId = null;
  state.report = null;
}

function stopSubscriptions() {
  Object.values(state.unsubscribers).forEach((unsubscribe) => unsubscribe?.());
  state.monthWatchers.forEach((unsubscribe) => unsubscribe?.());
  state.monthWatchers.clear();
  state.unsubscribers = { classes: null, selectedStudents: null, territoryZones: null, users: null, occurrences: null };
  state.selectedStudentsSubscriptionId = null;
}

function syncMonthlyAttendance() {
  const current = new Set(state.classes.map((item) => item.id));
  for (const [id, stop] of state.monthWatchers) {
    if (!current.has(id)) {
      stop();
      state.monthWatchers.delete(id);
      delete state.monthlyHistories[id];
    }
  }
  if (state.isDemo) {
    state.classes.forEach((item) => {
      state.monthlyHistories[item.id] = repository.getDemoAttendance(item.id).filter((entry) => entry.date?.startsWith(localMonth()));
    });
    return;
  }
  const start = `${localMonth()}-01`;
  const end = `${localMonth()}-31`;
  state.classes.forEach((item) => {
    if (state.monthWatchers.has(item.id)) return;
    const q = query(collection(firebase.db, "classes", item.id, "attendance"), where("date", ">=", start), where("date", "<=", end));
    const stop = onSnapshot(q, (snapshot) => {
      state.monthlyHistories[item.id] = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
      renderDashboard();
    }, (error) => console.warn("Resumo mensal indisponível para uma turma", item.id, error));
    state.monthWatchers.set(item.id, stop);
  });
}

function setAuthBusy(busy) {
  state.authBusy = busy;
  [ui["google-sign-in"], ui["email-sign-in"], ui["email-sign-up"], ui["email-password-reset"]].forEach((button) => { if (button) button.disabled = busy || !firebase.auth; });
  if (ui["google-sign-in"]) ui["google-sign-in"].lastChild.textContent = busy ? "Abrindo acesso…" : "Entrar com Google (admin)";
  if (ui["email-sign-in"]) ui["email-sign-in"].textContent = busy ? "Aguarde…" : "Entrar na plataforma";
  if (ui["email-sign-up"]) ui["email-sign-up"].textContent = busy ? "Aguarde…" : "Criar conta";
  if (ui["email-password-reset"]) ui["email-password-reset"].textContent = busy ? "Aguarde…" : "Esqueci minha senha";
}

function setActiveView(view, { preserveScroll = false } = {}) {
  if (["admin","students"].includes(view) && !state.isAdmin) view = "dashboard";
  state.activeView = view;
  $$(".view").forEach((section) => section.classList.toggle("active", section.id === `view-${view}`));
  $$(".nav-item[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  const [kicker, title] = PAGE_TITLES[view] || PAGE_TITLES.dashboard;
  ui["context-kicker"].textContent = kicker;
  ui["page-title"].textContent = title;
  ui.sidebar.classList.remove("open");
  if (!preserveScroll) window.scrollTo({ top: 0, behavior: "smooth" });

  if (view === "classes") ensureClassSelection();
  if (view === "attendance") ensureAttendanceReady();
  if (view === "admin") renderAdmin();
  if (view === "territory") { renderTerritory(); renderTerritoryLinks(); renderNeighborhoodDirectory().catch(e=>toast(e.message,"error")); }
  if (view === "occurrences") renderOccurrences();
  if (view === "modalities") renderModalities();
  if (view === "settings") renderSettings();
  if (view === "students") renderStudentRegistry().catch(e=>toast("Base geral indisponível. Verifique se as regras Firestore V11 foram publicadas. "+friendlyFirebaseError(e),"error"));
  if (view === "reports") syncReportControls();
}

function subscribeUsers() {
  state.unsubscribers.users?.();
  if (!state.isAdmin) {
    state.users = [];
    return;
  }
  if (state.isDemo) {
    state.users = state.profile ? [{ id: state.user.uid, displayName: state.profile.displayName || "Administrador", email: state.user.email || "" }] : [];
    renderAdmin();
    return;
  }
  state.unsubscribers.users = onSnapshot(query(collection(firebase.db, "users"), orderBy("displayName")), (snapshot) => {
    state.users = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderAdmin();
  }, (error) => console.error("Falha ao carregar usuários", error));
}

function subscribeOccurrences() {
  state.unsubscribers.occurrences?.();
  if (state.isDemo) {
    state.occurrences = repository.getDemoOccurrences();
    renderOccurrences();
    renderDashboard();
    return;
  }
  const source = collection(firebase.db, "occurrences");
  const occurrenceQuery = state.isAdmin ? query(source, orderBy("date", "desc"), limit(80)) : query(source, where("teacherId", "==", state.user.uid), orderBy("date", "desc"), limit(80));
  state.unsubscribers.occurrences = onSnapshot(occurrenceQuery, (snapshot) => {
    state.occurrences = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => `${b.date || ""}T${b.time || "00:00"}`.localeCompare(`${a.date || ""}T${a.time || "00:00"}`));
    renderOccurrences();
    renderDashboard();
  }, (error) => console.error("Falha ao carregar ocorrências", error));
}

function afterClassesChanged() {
  syncActivityCatalogue().catch(error=>console.warn("Catálogo: publique as regras V11 no Firebase.",error));
  if (state.selectedClassId && !state.classes.some((item) => item.id === state.selectedClassId)) {
    state.selectedClassId = null;
  }
  if (state.classes.length && !state.selectedClassId) {
    state.selectedClassId = state.classes[0].id;
    observeSelectedStudents(state.selectedClassId);
    loadHistory(state.selectedClassId);
  }
  if (!state.classes.length) state.selectedClassId = null;
  refreshClassSelectors();
  renderDashboard();
  renderClasses();
  renderAdmin();
  if (state.activeView === "territory") {
    renderTerritory();
    renderTerritoryLinks();
  }
  renderOccurrences();
  if (state.activeView === "modalities") renderModalities();
  if (state.attendance.classId) renderAttendance();
  syncMonthlyAttendance();
  hydrateCensusStudents();
}

function refreshClassSelectors() {
  const labels = state.classes.map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name || "Turma sem nome")}</option>`).join("");
  const selects = [ui["attendance-class"], ui["import-class"], ui["occurrence-class"]];
  selects.filter(Boolean).forEach((select) => {
    const prior = select.value;
    select.innerHTML = state.classes.length ? `<option value="">Selecionar turma</option>${labels}` : `<option value="">Nenhuma turma cadastrada</option>`;
    select.value = state.classes.some((item) => item.id === prior) ? prior : "";
    select.disabled = !state.classes.length;
  });

  if (ui["occurrence-filter-class"]) {
    const prior = ui["occurrence-filter-class"].value || "all";
    ui["occurrence-filter-class"].innerHTML = `<option value="all">Todas</option>${labels}`;
    ui["occurrence-filter-class"].value = state.classes.some((item) => item.id === prior) || prior === "all" ? prior : "all";
  }

  const reportPrior = ui["report-class"].value;
  ui["report-class"].innerHTML = `<option value="all">${state.isAdmin ? "Todas as turmas acessíveis" : "Todas as minhas turmas"}</option>${labels}`;
  ui["report-class"].value = state.classes.some((item) => item.id === reportPrior) || reportPrior === "all" ? reportPrior : "all";

  if (!state.attendance.classId && state.classes.length) state.attendance.classId = state.selectedClassId || state.classes[0].id;
  if (state.attendance.classId && state.classes.some((item) => item.id === state.attendance.classId)) ui["attendance-class"].value = state.attendance.classId;

  if (!ui["occurrence-class"]?.value && state.classes.length) ui["occurrence-class"].value = state.selectedClassId || state.classes[0].id;
  syncOccurrenceStudents();
}

function syncOccurrenceStudents() {
  if (!ui["occurrence-student"]) return;
  const classId = ui["occurrence-class"]?.value || state.selectedClassId || "";
  const students = state.studentsByClass[classId] || [];
  const prior = ui["occurrence-student"].value;
  ui["occurrence-student"].innerHTML = `<option value="">Sem aluno específico</option>${students.map((student) => `<option value="${escapeAttr(student.id)}">${escapeHtml(student.preferredName || student.fullName || "Aluno")}</option>`).join("")}`;
  ui["occurrence-student"].value = students.some((student) => student.id === prior) ? prior : "";
}

function updateProfileUi() {
  const displayName = state.profile?.displayName || state.user?.displayName || "Perfil";
  ui["profile-name"].textContent = displayName;
  ui["profile-avatar"].textContent = initials(displayName);
  ui["dashboard-subtitle"].textContent = state.profile
    ? `Olá, ${displayName.split(" ")[0] || displayName}. Aqui está a visão operacional das suas turmas, frequência, ocorrências e território.`
    : "Confirme seu perfil profissional para começar a organizar suas turmas.";
}

function renderDashboard() {
  renderCensoAnalytics();
  const totalStudents = Object.values(state.studentsByClass).reduce((sum, list) => sum + list.length, 0);
  const currentMonth = localMonth();
  const histories = Object.values(state.monthlyHistories).flat().filter((entry) => entry.date?.startsWith(currentMonth));
  const marked = histories.reduce((sum, entry) => sum + Number(entry.markedCount || countMarked(entry.records)), 0);
  const present = histories.reduce((sum, entry) => sum + Number(entry.presentCount || countPresent(entry.records)), 0);
  const justified = histories.reduce((sum, entry) => sum + Number(entry.justifiedCount || countJustified(entry.records)), 0);
  const rate = marked ? Math.round((present / marked) * 100) : 0;
  const latestAttendance = [...histories].sort((a, b) => `${b.date || ""}T${b.sessionTime || "00:00"}`.localeCompare(`${a.date || ""}T${a.sessionTime || "00:00"}`))[0];
  const latestPresent = latestAttendance ? Number(latestAttendance.presentCount || countPresent(latestAttendance.records)) : 0;
  const monthOccurrences = state.occurrences.filter((item) => String(item.date || "").startsWith(currentMonth)).length;

  const uniqueParticipants = censoUnique(loadedStudents().map(student => ({student}))).length;
  const activeClasses = state.classes.filter((item) => item.active !== false).length;
  const sports = new Set(state.classes.map((item) => item.sport).filter(Boolean)).size;
  const locations = new Set(state.classes.map((item) => item.location).filter(Boolean)).size;
  ui["dashboard-stats"].innerHTML = [
    ["Participantes identificados", uniqueParticipants, "pessoas únicas nos cadastros carregados", "◉"],
    ["Matrículas carregadas", totalStudents, "vínculos nas turmas acessíveis", "◎"],
    ["Turmas ativas", activeClasses, "turmas acessíveis", "◒"],
    ["Atividades", sports, "modalidades das turmas", "◆"],
    ["Locais", locations, "polos das turmas", "⌖"],
    ["Chamadas no mês", histories.length, "registros já salvos", "✓"],
    ["Presença no mês", marked ? `${rate}%` : "—", marked ? `${present} presença${present === 1 ? "" : "s"} marcada${present === 1 ? "" : "s"}` : "aguardando primeira chamada", "↗"],
    ["Faltas justificadas", justified || "—", justified ? "marcadas no período" : "sem justificativas salvas", "J"],
    ["Ocorrências do mês", monthOccurrences || "—", monthOccurrences ? "registros operacionais" : "nenhuma ocorrência", "⚑"],
    ["Na última chamada", latestAttendance ? latestPresent : "—", latestAttendance ? `${formatDate(latestAttendance.date)}${latestAttendance.sessionTime ? ` às ${latestAttendance.sessionTime}` : ""}` : "aguardando primeira chamada", "◉"]
  ].map(([label, value, note, icon], index) => `<article class="panel stat-card interactive-stat" tabindex="0" role="button" data-v11="indicator" data-index="${index}" aria-label="Explorar ${label}"><div class="stat-label"><span>${label}</span><i class="stat-icon" aria-hidden="true">${icon}</i></div><strong>${value}</strong><small>${note}</small></article>`).join("");

  if (!state.classes.length) {
    ui["today-classes"].innerHTML = emptyInline("Nenhuma turma cadastrada", "Cadastre sua primeira turma para criar listas e chamadas.", "Cadastrar turma", "open-class-dialog");
  } else {
    ui["today-classes"].innerHTML = state.classes.slice(0, 4).map((item) => `
      <div class="today-item">
        <div><h4>${escapeHtml(item.name || "Turma sem nome")}</h4><p>${escapeHtml([item.sport, item.schedule, item.teacherName].filter(Boolean).join(" · ") || "Sem horário informado")}</p></div>
        <button class="button button-secondary" data-action="open-attendance" data-id="${escapeAttr(item.id)}" type="button">Chamar</button>
      </div>`).join("");
  }

  const progressSource = state.classes.map((item) => {
    const entries = (state.monthlyHistories[item.id] || []).filter((entry) => entry.date?.startsWith(currentMonth));
    const entryMarked = entries.reduce((sum, entry) => sum + Number(entry.markedCount || countMarked(entry.records)), 0);
    const entryPresent = entries.reduce((sum, entry) => sum + Number(entry.presentCount || countPresent(entry.records)), 0);
    return { item, rate: entryMarked ? Math.round((entryPresent / entryMarked) * 100) : null, entries: entries.length };
  }).filter((row) => row.rate !== null);

  ui["dashboard-progress"].innerHTML = progressSource.length
    ? `<div class="progress-list">${progressSource.slice(0, 5).map((row) => `<div class="progress-item"><strong>${escapeHtml(row.item.name || "Turma")}</strong><span>${row.rate}%</span><div class="progress-track"><i style="width:${row.rate}%"></i></div></div>`).join("")}</div>`
    : "Ainda não há chamadas concluídas neste período.";
}

function getStudentContact(student) {
  const target = student.contactTarget || student.contact?.target || "guardian";
  const candidates = {
    guardian: { phone: student.guardianPhone || student.contact?.guardianPhone || "", label: student.guardianName || "responsável" },
    student: { phone: student.studentPhone || student.contact?.studentPhone || "", label: student.preferredName || student.fullName || "aluno" },
    alternate: { phone: student.phone || student.contact?.alternatePhone || "", label: "contato alternativo" }
  };
  const selected = candidates[target] || candidates.guardian;
  return { ...selected, target, permission: student.contactPermission || student.contact?.permission || "not_informed" };
}

function renderContactActions(student, classId) {
  const contact = getStudentContact(student);
  const whatsAppDisabled = !contact.phone || !isContactAllowed(contact.permission, "whatsapp");
  const callDisabled = !contact.phone || !isContactAllowed(contact.permission, "call");
  return `<div class="contact-actions"><select class="contact-target-select" data-contact-target="${escapeAttr(student.id)}" data-class-id="${escapeAttr(classId)}" aria-label="Contato preferencial de ${escapeAttr(student.preferredName || student.fullName || "aluno")}"><option value="guardian" ${contact.target === "guardian" ? "selected" : ""}>Responsável</option><option value="student" ${contact.target === "student" ? "selected" : ""}>Aluno</option><option value="alternate" ${contact.target === "alternate" ? "selected" : ""}>Alternativo</option></select><div><button class="contact-action whatsapp" data-action="contact-whatsapp" data-id="${escapeAttr(student.id)}" data-class-id="${escapeAttr(classId)}" type="button" ${whatsAppDisabled ? "disabled" : ""} aria-label="Abrir WhatsApp de ${escapeAttr(contact.label)}">WhatsApp</button><button class="contact-action call" data-action="contact-call" data-id="${escapeAttr(student.id)}" data-class-id="${escapeAttr(classId)}" type="button" ${callDisabled ? "disabled" : ""} aria-label="Ligar para ${escapeAttr(contact.label)}">Ligar</button></div></div>`;
}

function renderAttendance() {
  ui["session-kind"].value = state.attendance.sessionKind || "regular";
  ui["session-note"].value = state.attendance.sessionNote || "";
  const classId = state.attendance.classId || state.selectedClassId || state.classes[0]?.id || "";
  const students = (state.studentsByClass[classId] || []).filter(s => studentIsActive(s) || Boolean(state.attendance.records?.[s.id]?.status));
  const records = state.attendance.records || {};
  const marked = countMarked(records);
  ui["attendance-date"].value = state.attendance.date || localDate();
  ui["attendance-time"].value = state.attendance.sessionTime || localTime();
  if (classId) ui["attendance-class"].value = classId;
  ui["attendance-marked"].textContent = `${marked} / ${students.length}`;
  ui["attendance-progress"].style.width = students.length ? `${Math.round((marked / students.length) * 100)}%` : "0%";
  ui["attendance-save-state"].textContent = state.attendance.dirty ? "Alterações não salvas" : "Sem alterações";
  ui["attendance-save-state"].classList.toggle("changed", state.attendance.dirty);
  ui["save-attendance"].disabled = !classId || state.classes.find(c=>c.id===classId)?.active === false;
  ui["clear-attendance"].disabled = !marked;
  if (!state.classes.length) {
    ui["attendance-helper"].textContent = "Cadastre uma turma antes de fazer a chamada.";
    ui["attendance-list"].innerHTML = `<div class="empty-state"><span aria-hidden="true">◒</span><h3>Nenhuma turma disponível</h3><p>Crie uma turma e depois inclua os alunos para registrar presenças.</p><button class="button button-secondary" data-action="open-class-dialog" type="button">Cadastrar turma</button></div>`;
    return;
  }
  if (!classId) {
    ui["attendance-helper"].textContent = "Selecione uma turma para começar.";
    ui["attendance-list"].innerHTML = `<div class="empty-state"><span aria-hidden="true">✓</span><h3>Escolha uma turma</h3><p>A lista de alunos será mostrada aqui.</p></div>`;
    return;
  }
  const present = countPresent(records);
  const justified = countJustified(records);
  const moment = state.attendance.sessionTime || "horário não informado";
  ui["attendance-helper"].textContent = students.length ? `Nesta chamada de ${formatDate(state.attendance.date)} às ${moment}, ${present} presente${present === 1 ? "" : "s"}, ${justified} justificativa${justified === 1 ? "" : "s"}. Use P, J ou F.` : "Esta turma ainda não tem alunos cadastrados.";
  ui["attendance-list"].innerHTML = students.length ? `<div class="attendance-legend"><span>P = Presente</span><span>J = Justificada</span><span>F = Falta</span></div>${students.map((student) => {
    const record = records[student.id] || {};
    const status = record.status || "";
    const rowClass = status === "P" ? "has-present" : status === "F" ? "has-absent" : status === "J" ? "has-justified" : "";
    const context = [student.globalStudentId || "ID pendente", student.enrollmentCode || "Sem código de matrícula", student.territoryZoneName || student.geo?.zoneLabel].filter(Boolean).join(" · ");
    return `<div class="attendance-row ${rowClass}"><div class="attendance-person"><span class="student-initial">${initials(student.preferredName || student.fullName)}</span><div><strong>${escapeHtml(student.preferredName || student.fullName || "Sem nome")}</strong><small>${escapeHtml(context)}</small></div></div><div class="attendance-note">${renderJustificationSelect(student, record)}</div><div class="attendance-actions"><button class="attendance-status present ${status === "P" ? "active" : ""}" data-action="set-attendance" data-id="${escapeAttr(student.id)}" data-status="P" type="button" aria-pressed="${status === "P"}">P</button><button class="attendance-status justified ${status === "J" ? "active" : ""}" data-action="set-attendance" data-id="${escapeAttr(student.id)}" data-status="J" type="button" aria-pressed="${status === "J"}">J</button><button class="attendance-status absent ${status === "F" ? "active" : ""}" data-action="set-attendance" data-id="${escapeAttr(student.id)}" data-status="F" type="button" aria-pressed="${status === "F"}">F</button></div></div>`;
  }).join("")}` : `<div class="empty-state"><span aria-hidden="true">+</span><h3>Inclua alunos nesta turma</h3><p>Sem alunos não é possível registrar uma chamada.</p><button class="button button-secondary" data-action="open-student-dialog" data-class-id="${escapeAttr(classId)}" type="button">Cadastrar aluno</button></div>`;
}

function updateAttendanceStatus(studentId, status) {
  const existing = state.attendance.records[studentId] || {};
  if (existing.status === status) {
    delete state.attendance.records[studentId];
  } else {
    state.attendance.records[studentId] = { ...existing, status };
  }
  state.attendance.dirty = true;
  renderAttendance();
}

function markAllPresent() {
  const students = (state.studentsByClass[state.attendance.classId] || []).filter(studentIsActive);
  students.forEach((student) => {
    state.attendance.records[student.id] = { ...(state.attendance.records[student.id] || {}), status: "P" };
  });
  state.attendance.dirty = true;
  renderAttendance();
}

function clearAttendance() {
  state.attendance.records = {};
  state.attendance.dirty = true;
  renderAttendance();
}

async function saveAttendance() {
  const { classId, date, sessionTime } = state.attendance;
  const classItem = state.classes.find((item) => item.id === classId);
  const students = state.studentsByClass[classId] || [];
  if (!classItem || classItem.active === false) { toast("Ative a turma antes de registrar frequência.", "error"); return; }
  const marked = countMarked(state.attendance.records);
  if (!marked && (!state.attendance.sessionKind || state.attendance.sessionKind === "regular")) {
    toast("Marque ao menos uma presença, justificativa ou falta antes de salvar.", "error");
    return;
  }
  const records = state.attendance.sessionKind && state.attendance.sessionKind !== "regular" ? {} : cleanAttendanceRecords(state.attendance.records);
  const entry = {
    date,
    sessionTime: sessionTime || localTime(),
    classId,
    className: classItem.name || "",
    teacherId: classItem.teacherId || state.user.uid,
    teacherName: classItem.teacherName || state.profile?.displayName || state.user.displayName || "",
    records,
    sessionKind: state.attendance.sessionKind || "regular",
    sessionNote: state.attendance.sessionNote || "",
    markedCount: countMarked(records),
    presentCount: countPresent(records),
    absentCount: countAbsent(records),
    justifiedCount: countJustified(records),
    updatedAt: state.isDemo ? new Date().toISOString() : serverTimestamp()
  };
  const button = ui["save-attendance"];
  button.disabled = true;
  button.textContent = "Salvando…";
  try {
    await repository.saveAttendance(entry);
    state.attendance.dirty = false;
    toast("Chamada salva com sucesso.");
    await loadHistory(classId);
    if (state.isDemo) syncMonthlyAttendance();
    renderDashboard();
  } catch (error) {
    toast(friendlyFirebaseError(error), "error");
  } finally {
    button.textContent = "Salvar frequência";
    renderAttendance();
  }
}

async function buildReport(month, classes, mode = "month") {
  const { start, end } = mode === "week" ? isoWeekBounds(month) : monthBounds(month);
  const classReports = [];
  const individualRows = [];
  const territory = new Map();
  let totalMarked = 0;
  let totalPresent = 0;
  let totalJustified = 0;
  let sessions = 0;

  for (const classItem of classes) {
    const students = await loadStudents(classItem.id);
    const attendance = await repository.getAttendanceRange(classItem.id, start, end);
    const roster = new Map(students.map((student) => [student.id, student]));
    const stats = new Map(students.map((student) => [student.id, { student, marked: 0, present: 0, absent: 0, justified: 0, sessions: [] }]));
    attendance.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    attendance.forEach((entry) => {
      const records = entry.records || {};
      Object.entries(records).forEach(([studentId, record]) => {
        if (!["P", "F", "J"].includes(record?.status)) return;
        if (!stats.has(studentId)) stats.set(studentId, { student: roster.get(studentId) || { id: studentId, fullName: "Registro sem cadastro atual" }, marked: 0, present: 0, absent: 0, justified: 0, sessions: [] });
        const row = stats.get(studentId);
        row.marked += 1;
        row.present += record.status === "P" ? 1 : 0;
        row.absent += record.status === "F" ? 1 : 0;
        row.justified += record.status === "J" ? 1 : 0;
        row.sessions.push({ date: entry.date, status: record.status });
      });
    });
    const classMarked = [...stats.values()].reduce((sum, row) => sum + row.marked, 0);
    const classPresent = [...stats.values()].reduce((sum, row) => sum + row.present, 0);
    const classJustified = [...stats.values()].reduce((sum, row) => sum + row.justified, 0);
    totalMarked += classMarked;
    totalPresent += classPresent;
    totalJustified += classJustified;
    sessions += attendance.length;
    classReports.push({ classItem, attendance, students, marked: classMarked, present: classPresent, justified: classJustified, rate: classMarked ? Math.round((classPresent / classMarked) * 100) : null });
    stats.forEach((row) => {
      if (!row.marked) return;
      individualRows.push({
        className: classItem.name || "Turma sem nome",
        teacherName: classItem.teacherName || "",
        student: row.student,
        marked: row.marked,
        present: row.present,
        absent: row.absent,
        justified: row.justified,
        rate: Math.round((row.present / row.marked) * 100),
        trend: calculateTrend(row.sessions)
      });
      const zoneLabel = row.student.territoryZoneName || row.student.geo?.zoneLabel || "";
      if (zoneLabel) {
        const zone = territory.get(zoneLabel) || { label: zoneLabel, sector: row.student.territorySector || row.student.geo?.sector || "", students: new Set(), marked: 0, present: 0, absent: 0, justified: 0 };
        zone.students.add(row.student.id);
        zone.marked += row.marked;
        zone.present += row.present;
        zone.absent += row.absent;
        zone.justified += row.justified;
        territory.set(zoneLabel, zone);
      }
    });
  }
  individualRows.sort((a, b) => a.rate - b.rate || String(a.student.fullName).localeCompare(String(b.student.fullName), "pt-BR"));
  const teachers = new Map();
  classReports.forEach((row) => {
    const key = row.classItem.teacherId || "sem-responsavel";
    const current = teachers.get(key) || { name: row.classItem.teacherName || "Professor não identificado", classes: 0, sessions: 0, marked: 0, present: 0, justified: 0 };
    current.classes += 1;
    current.sessions += row.attendance.length;
    current.marked += row.marked;
    current.present += row.present;
    current.justified += row.justified;
    teachers.set(key, current);
  });
  const teacherReports = [...teachers.values()].map((row) => ({ ...row, rate: row.marked ? Math.round((row.present / row.marked) * 100) : null })).sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
  const territoryReports = [...territory.values()].filter((row) => row.students.size >= 5).map((row) => ({ ...row, students: row.students.size, rate: row.marked ? Math.round((row.present / row.marked) * 100) : null })).sort((a, b) => String(a.label).localeCompare(String(b.label), "pt-BR"));
  return { month, mode, start, end, classes, classReports, teacherReports, territoryReports, individualRows, totalMarked, totalPresent, totalJustified, sessions, rate: totalMarked ? Math.round((totalPresent / totalMarked) * 100) : 0, generatedAt: new Date() };
}

function renderReport() {
  const report = state.report;
  if (!report) return;
  ui["report-empty"].classList.add("hidden");
  ui["report-content"].classList.remove("hidden");
  const period = report.mode === "week" ? `Semana ${report.month.slice(6)} de ${report.month.slice(0,4)} (${report.start} a ${report.end})` : formatMonth(report.month);
  const participantCount = report.individualRows.length;
  const classSummary = report.classReports.map((row) => `
    <div class="class-report-row"><div><strong>${escapeHtml(row.classItem.name || "Turma")}</strong><small>${row.attendance.length} chamada${row.attendance.length === 1 ? "" : "s"} · ${row.marked} marcação${row.marked === 1 ? "" : "ões"} · ${row.justified} justificada${row.justified === 1 ? "" : "s"}</small></div><span>${row.rate === null ? "—" : `${row.rate}%`}</span><div class="progress-track"><i style="width:${row.rate || 0}%"></i></div></div>`).join("") || `<p>Nenhuma turma com dados no período.</p>`;
  const individual = report.individualRows.length ? report.individualRows.map((row) => {
    const trendClass = row.trend.value > 0 ? "trend-positive" : row.trend.value < 0 ? "trend-negative" : "trend-neutral";
    return `<tr><td>${escapeHtml(row.student.preferredName || row.student.fullName || "Registro sem cadastro")}</td><td>${escapeHtml(row.className)}</td><td>${row.present}</td><td>${row.justified}</td><td>${row.absent}</td><td><strong>${row.rate}%</strong></td><td class="${trendClass}">${escapeHtml(row.trend.label)}</td></tr>`;
  }).join("") : `<tr><td colspan="7">Nenhuma presença ou falta marcada neste período.</td></tr>`;
  const teachers = report.teacherReports.map((row) => `<div class="teacher-report-row"><div><strong>${escapeHtml(row.name)}</strong><small>${row.classes} turma${row.classes === 1 ? "" : "s"} · ${row.sessions} chamada${row.sessions === 1 ? "" : "s"} · ${row.justified} justificada${row.justified === 1 ? "" : "s"}</small></div><span>${row.rate === null ? "—" : `${row.rate}%`}</span></div>`).join("") || "<p>Nenhum responsável encontrado no escopo.</p>";
  const territory = report.territoryReports.map((row) => `<div class="territory-report-row"><div><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.sector || "Setor não informado")} · ${row.students} alunos com marcações · ${row.justified} justificadas</small></div><span>${row.rate === null ? "—" : `${row.rate}%`}</span><div class="progress-track"><i style="width:${row.rate || 0}%"></i></div></div>`).join("") || "<p>O painel territorial mostra somente zonas com pelo menos 5 alunos com marcações no período.</p>";
  ui["report-content"].innerHTML = `
    <section class="report-header"><div><p class="eyebrow">RELATÓRIO DE PRESENÇA</p><h3>${escapeHtml(period)}</h3><p>${report.classes.length} turma${report.classes.length === 1 ? "" : "s"} no escopo · acesso ${state.isAdmin ? "administrativo" : "do professor"}</p></div><p class="report-generated">Gerado em ${formatDateTime(report.generatedAt)}<br/>Votorantim · Rede Esportiva</p></section>
    <section class="report-stat-grid"><article class="report-stat"><span>Presença geral</span><strong>${report.totalMarked ? `${report.rate}%` : "—"}</strong></article><article class="report-stat"><span>Presenças</span><strong>${report.totalPresent}</strong></article><article class="report-stat"><span>Justificadas</span><strong>${report.totalJustified}</strong></article><article class="report-stat"><span>Faltas</span><strong>${report.totalMarked - report.totalPresent - report.totalJustified}</strong></article><article class="report-stat"><span>Chamadas</span><strong>${report.sessions}</strong></article></section>
    <section class="report-grid"><article class="panel"><h3>Visão por turma</h3><p>Percentual calculado sobre marcações P, J e F efetivamente salvas; somente P conta como presença.</p><div class="class-report-list">${classSummary}</div></article><article class="panel"><h3>Evolução individual</h3><p>${participantCount ? "Tendência compara as metades do mês quando há registros suficientes." : "Os indicadores individuais aparecerão após as chamadas."}</p><div class="individual-report-wrap"><table class="individual-report"><thead><tr><th>Aluno</th><th>Turma</th><th>P</th><th>J</th><th>F</th><th>Presença</th><th>Tendência</th></tr></thead><tbody>${individual}</tbody></table></div></article></section><section class="report-grid"><article class="panel teacher-report"><h3>Visão por professor</h3><p>Consolidado das turmas incluídas neste relatório. Para um professor, este bloco confirma o próprio escopo.</p><div class="teacher-report-list">${teachers}</div></article><article class="panel territory-report"><h3>Frequência por zona</h3><p>Resumo agregado, sem endereços e com mínimo de 5 alunos com marcações.</p><div class="territory-report-list">${territory}</div></article></section>`;
}

function exportReportCsv() {
  if (state.report?.mode === "students") { downloadBlob("\ufeff"+state.report.csv.map(r=>r.map(csvCell).join(";")).join("\r\n"), "relatorio-alunos.csv", "text/csv;charset=utf-8"); return; }
  const report = state.report;
  if (!report) { toast("Gere um relatório antes de exportar.", "error"); return; }
  const lines = [
    ["periodo", "professor", "turma", "aluno", "zona_territorial", "setor_territorial", "presencas", "faltas_justificadas", "faltas", "marcacoes", "percentual_presenca", "tendencia"],
    ...report.individualRows.map((row) => [report.month, row.teacherName, row.className, row.student.preferredName || row.student.fullName || "", row.student.territoryZoneName || row.student.geo?.zoneLabel || "", row.student.territorySector || row.student.geo?.sector || "", row.present, row.justified, row.absent, row.marked, `${row.rate}%`, row.trend.label])
  ];
  const csv = "\uFEFF" + lines.map((line) => line.map(csvCell).join(";")).join("\n");
  downloadBlob(csv, `relatorio-presenca-${report.mode || "mes"}-${report.month}.csv`, "text/csv;charset=utf-8");
  toast("CSV preparado para download.");
}

function renderModalities() {
  if (!ui["modalities-content"]) return;
  const groups = new Map();
  const centers = new Set();
  const q = String(ui["modalities-filter"]?.value || "").trim().toLocaleLowerCase("pt-BR");
  territoryActivities().forEach((item) => {
    const sport = item.sport || "Modalidade não informada";
    const loc = item.location || "Núcleo sem nome";
    centers.add(loc);
    if (!groups.has(sport)) groups.set(sport, []);
    groups.get(sport).push(item);
  });
  const sorted = [...groups].sort((a,b) => a[0].localeCompare(b[0], "pt-BR"));
  const filtered = sorted.filter(([sport, rows]) => !q || [sport,...rows.map(r=>r.location),...rows.map(r=>r.name)].join(" ").toLocaleLowerCase("pt-BR").includes(q));
  const stats = [["Modalidades", sorted.length],["Núcleos distintos", centers.size],["Turmas", territoryActivities().length]];
  ui["modalities-stats"].innerHTML = stats.map(([name, val]) => `<article class="panel stat-card"><div class="stat-label"><span>${escapeHtml(name)}</span><i class="stat-icon">◆</i></div><strong>${val}</strong><small>registros disponíveis ao seu perfil</small></article>`).join("");
  ui["modalities-content"].innerHTML = filtered.length ? filtered.map(([name, rows]) => {
    const places = new Set(rows.map(r=>r.location).filter(Boolean));
    return `<article class="modality-card"><div class="modality-heading"><h4>${escapeHtml(name)}</h4><span class="pill">${rows.length} turma${rows.length === 1 ? "" : "s"} · ${places.size} núcleo${places.size === 1 ? "" : "s"}</span></div>${rows.map((item) => {
      const zone = state.territoryZones.find(z=>z.id === item.territoryZoneId);
      const zoneLabel = zone ? `${zone.name}${zone.sector ? ` · ${zone.sector}` : ""}` : "Setor não confirmado";
      return `<div class="modality-row"><div><strong>${escapeHtml(item.location || "Núcleo não informado")}</strong><small>${escapeHtml(item.name || "Turma")}${item.schedule ? ` · ${escapeHtml(item.schedule)}` : ""}</small><small>${escapeHtml(zoneLabel)}</small></div>${state.classes.some(c=>c.id===item.id) ? `<button class="button button-secondary button-compact" type="button" data-action="open-attendance" data-id="${escapeAttr(item.id)}">Chamada</button>` : `<span class="pill">Somente consulta</span>`}</div>`;
    }).join("")}</article>`;
  }).join("") : `<div class="empty-state">Nenhuma modalidade encontrada para o filtro escolhido.</div>`;
}

function renderOccurrences() {
  if (!ui["occurrence-list"]) return;
  const search=document.getElementById('occurrence-search'), category=document.getElementById('occurrence-category');
  const priorCategory=category.value;
  category.innerHTML='<option value="">Todas as categorias</option>'+[...new Set(state.occurrences.map(o=>o.type).filter(Boolean))].sort().map(t=>'<option>'+escapeHtml(t)+'</option>').join('');
  category.value=priorCategory;
  const q=censoKey(search.value), since=document.getElementById('occurrence-since').value, until=document.getElementById('occurrence-until').value;
  const rows = state.occurrences.filter(item=>(state.occurrenceFilterClass==='all'||item.classId===state.occurrenceFilterClass)&&(!category.value||item.type===category.value)&&(!since||item.date>=since)&&(!until||item.date<=until)&&(!q||censoKey([item.description,item.studentName,item.teacherName,item.className].join(' ')).includes(q))).sort((a,b)=>(b.date+'T'+b.time).localeCompare(a.date+'T'+a.time));
  document.getElementById('occurrence-summary').textContent=rows.length+' registro(s) no filtro • histórico carregado de até 80 ocorrências. Para cadastrar, preencha o formulário abaixo.';
  ui["occurrence-list"].innerHTML = rows.length ? rows.map((item) => `<article class="occurrence-card"><header><div><strong>${escapeHtml(item.className || "Turma")}</strong><div class="occurrence-meta">${formatDate(item.date)}${item.time ? ` às ${escapeHtml(item.time)}` : ""} · ${escapeHtml(item.teacherName || "Professor")}${item.studentName ? ` · ${escapeHtml(item.studentName)}` : ""}</div></div><span class="occurrence-type">${escapeHtml(item.type || "Ocorrência")}</span></header><p>${escapeHtml(item.description || "")}</p></article>`).join("") : `<div class="empty-state"><span aria-hidden="true">⚑</span><h3>Nenhuma ocorrência registrada</h3><p>Use o formulário ao lado para registrar fatos relevantes da rotina.</p></div>`;
}

async function saveOccurrence(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  if (!values.classId || !values.date || !values.time || !values.description) {
    setFormMessage("occurrence-form-message", "Preencha turma, data, horário e descrição.");
    return;
  }
  const classItem = state.classes.find((item) => item.id === values.classId);
  const student = values.studentId ? findStudent(values.classId, values.studentId) : null;
  const payload = {
    classId: values.classId,
    className: classItem?.name || "",
    teacherId: classItem?.teacherId || state.user.uid,
    teacherName: classItem?.teacherName || state.profile?.displayName || state.user.displayName || "",
    studentId: values.studentId || "",
    studentName: student?.preferredName || student?.fullName || "",
    date: values.date,
    time: values.time,
    type: values.type || "Outro",
    description: String(values.description || "").trim()
  };
  if (!payload.description) { setFormMessage("occurrence-form-message", "Descreva a ocorrência."); return; }
  setFormMessage("occurrence-form-message", "Salvando…", true);
  try {
    await repository.saveOccurrence(payload);
    form.reset();
    if (ui["occurrence-date"]) ui["occurrence-date"].value = localDate();
    if (ui["occurrence-time"]) ui["occurrence-time"].value = localTime();
    if (ui["occurrence-class"] && state.selectedClassId) ui["occurrence-class"].value = state.selectedClassId;
    syncOccurrenceStudents();
    setFormMessage("occurrence-form-message", "");
    toast("Ocorrência registrada.");
  } catch (error) {
    setFormMessage("occurrence-form-message", friendlyFirebaseError(error));
  }
}

function renderTerritoryLinks() {
  if (!ui["territory-links"]) return;
  const visibleZones = filteredTerritoryZones(state.territoryZones).filter(z=>(!state.selectedNeighborhood||neighborhoodKey(z.name)===neighborhoodKey(state.selectedNeighborhood))&&classesForTerritoryZone(z).length);
  const list = visibleZones.map((zone) => {
    const classes = classesForTerritoryZone(zone);
    return `<article class="territory-link-card"><strong>${escapeHtml(zone.name || "Bairro")}</strong><small>${escapeHtml(zone.sector || "Setor não informado")}</small>${classes.length ? `<ul>${classes.map((item) => `<li><strong>${escapeHtml(item.location || item.name || "Núcleo")}</strong> — ${escapeHtml([item.sport, item.schedule].filter(Boolean).join(" · ") || "Sem detalhes")}</li>`).join("")}</ul>` : `<p>Nenhum núcleo vinculado a este bairro.</p>`}</article>`;
  }).join("");
  ui["territory-links"].innerHTML = list || `<div class="empty-state"><span aria-hidden="true">⌖</span><h3>Sem vínculos territoriais</h3><p>Associe as turmas a uma zona aprovada para listar bairros e núcleos.</p></div>`;
}

function renderAdmin() {
  if (!state.isAdmin || !ui["admin-content"]) return;
  const teachers = state.users.length ? state.users : state.classes.map((item) => ({ id: item.teacherId, displayName: item.teacherName, email: "" }));
  const active = state.classes.filter((item) => item.active !== false).length;
  const teacherOptions = teachers.map((item) => `<option value="${escapeAttr(item.id || "")}">${escapeHtml(item.displayName || item.email || item.id || "Professor")}</option>`).join("");
  ui["admin-content"].innerHTML = `<div class="admin-stats"><article class="panel stat-card"><div class="stat-label"><span>Turmas no acesso</span><i class="stat-icon">◒</i></div><strong>${state.classes.length}</strong><small>todas as turmas autorizadas</small></article><article class="panel stat-card"><div class="stat-label"><span>Turmas ativas</span><i class="stat-icon">✓</i></div><strong>${active}</strong><small>disponíveis para chamada</small></article><article class="panel stat-card"><div class="stat-label"><span>Professores</span><i class="stat-icon">◉</i></div><strong>${teachers.length}</strong><small>contas identificadas</small></article></div><article class="panel admin-note"><button class="button button-secondary" type="button" data-v11="normalize-genders">Padronizar F/M na base</button><p id="gender-normalization-status" role="status">Atualiza gênero na base geral e nas matrículas, preservando os outros campos.</p><strong>Gestão segura de acesso.</strong> Professores entram com e-mail/senha ou Google, mas somente os UIDs provisionados em <code>adminUsers</code> terão painel administrativo.</article><article class="panel" style="margin-top:16px;padding:20px;overflow:auto"><div class="panel-heading"><div><p class="eyebrow">TURMAS E RESPONSÁVEIS</p><h3>Reatribuição de turmas</h3></div><button class="button button-secondary button-compact" data-action="open-import" type="button">Abrir importação</button></div><p class="muted">Você pode associar uma turma a um professor mesmo depois que ele criar a conta.</p><table class="admin-table"><thead><tr><th>Turma</th><th>Modalidade</th><th>Professor atual</th><th>Alunos</th><th>Status</th><th>Nova associação</th></tr></thead><tbody>${state.classes.length ? state.classes.map((item) => `<tr><td>${escapeHtml(item.name || "Turma sem nome")}</td><td>${escapeHtml(item.sport || "—")}</td><td>${escapeHtml(item.teacherName || "—")}</td><td>${(state.studentsByClass[item.id] || []).length}</td><td>${item.active === false ? "Inativa" : "Ativa"}</td><td><div class="admin-assignment"><select id="teacher-select-${escapeAttr(item.id)}"><option value="">Selecione</option>${teacherOptions}</select><button class="row-action" data-action="assign-teacher" data-id="${escapeAttr(item.id)}" type="button">Salvar</button></div></td></tr>`).join("") : '<tr><td colspan="6">Nenhuma turma disponível.</td></tr>'}</tbody></table></article>`;
  state.classes.forEach((item) => {
    const select = document.getElementById(`teacher-select-${item.id}`);
    if (select) select.value = item.teacherId || "";
  });
}

function renderHelp() {
  ui["help-accordions"].innerHTML = HELP_ARTICLES.map((item, index) => `<details class="accordion" ${index === 0 ? "open" : ""}><summary>${escapeHtml(item.title)}</summary><div class="accordion-body"><p>${escapeHtml(item.body)}</p></div></details>`).join("");
}

async function handleDynamicClick(event) {
  const v11 = event.target.closest('[data-v11]');
  if(v11){ handleV11Action(v11).catch(e=>toast(e.message,'error')); return; }
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const { action, id, classId, tab, status } = actionButton.dataset;
  if (["toggle-student", "toggle-class", "number-students", "delete-attendance", "load-student-filters"].includes(action)) { runManagementAction(action, classId || id, id).catch(e=>toast(friendlyFirebaseError(e), "error")); return; }
  if (action === "open-class-dialog") openClassDialog();
  if (action === "select-class") selectClass(id);
  if (action === "edit-class") openClassDialog(id);
  if (action === "delete-class-admin") await deleteClassAsAdmin(id);
  if (action === "open-attendance") await openAttendanceFor(id);
  if (action === "open-import") setActiveView("import");
  if (action === "open-import-for-class") {
    ui["import-class"].value = id;
    setActiveView("import");
    updateImportReadiness();
  }
  if (action === "open-student-dialog") openStudentDialog(classId);
  if (action === "edit-student") openStudentDialog(classId, id);
  if (action === "delete-student") await deleteStudent(classId, id);
  if (action === "contact-whatsapp") contactStudent(classId, id, "whatsapp");
  if (action === "contact-call") contactStudent(classId, id, "call");
  if (action === "select-territory-zone") {
    state.selectedTerritoryZoneId = id === state.selectedTerritoryZoneId ? null : id;
    const selectedZone=(state.territoryLayer==="sectors"?state.censusTerritoryZones:state.territoryZones).find(z=>z.id===state.selectedTerritoryZoneId);
    state.selectedNeighborhood=selectedZone?.name||"";
    renderNeighborhoodDirectory().catch(e=>toast(e.message,"error"));
    renderTerritory();
    renderTerritoryLinks();
  }
  if (action === "detail-tab") { state.classDetailTab = tab; renderClasses(); }
  if (action === "set-attendance") updateAttendanceStatus(id, status);
  if (action === "assign-teacher") await assignTeacherToClass(id);
}

function handleDynamicInput(event) {
  if (event.target.id === "session-kind" || event.target.id === "session-note") { state.attendance[event.target.id === "session-kind" ? "sessionKind" : "sessionNote"] = event.target.value; state.attendance.dirty = true; ui["attendance-save-state"].textContent = "Alterações não salvas"; }
  const noteId = event.target.dataset.attendanceNote;
  if (noteId) {
    const existing = state.attendance.records[noteId] || {};
    state.attendance.records[noteId] = { ...existing, note: event.target.value };
    state.attendance.dirty = true;
    ui["attendance-save-state"].textContent = "Alterações não salvas";
    ui["attendance-save-state"].classList.add("changed");
  }

  if (event.target.name === "postalCode") event.target.value = formatPostalCode(event.target.value);
  if (["guardianPhone", "studentPhone", "phone"].includes(event.target.name)) event.target.value = formatPhone(event.target.value);
  if (event.target.name === "territoryZoneId" && event.target.form === ui["student-form"]) {ui["student-form"].elements.territoryMatchMethod.value="manual-zone-selection";syncTerritoryFields(ui["student-form"]);}
}

async function updateStudentContactTarget(classId, studentId, target) {
  const student = findStudent(classId, studentId);
  if (!student || !["guardian", "student", "alternate"].includes(target)) return;
  student.contactTarget = target;
  try {
    await repository.saveStudent({ classId, studentId, ...student, contactTarget: target });
    renderClasses();
  } catch (error) {
    toast(friendlyFirebaseError(error), "error");
  }
}

async function assignTeacherToClass(classId) {
  const select = document.getElementById(`teacher-select-${classId}`);
  const teacherId = select?.value || "";
  const teacher = state.users.find((item) => item.id === teacherId);
  if (!teacherId || !teacher) { toast("Selecione um professor.", "error"); return; }
  try {
    await repository.assignTeacherToClass(classId, teacherId, teacher.displayName || teacher.email || "Professor");
    toast("Professor vinculado à turma.");
  } catch (error) {
    toast(friendlyFirebaseError(error), "error");
  }
}


function occurrenceDemoStore() {
  try {
    const raw = localStorage.getItem(DEMO_STORE_KEY);
    const data = raw ? JSON.parse(raw) : { profile: null, classes: {}, students: {}, territoryZones: {}, attendance: {}, deletionAudit: {} };
    data.occurrences ||= {};
    return data;
  } catch (error) {
    return { profile: null, classes: {}, students: {}, territoryZones: {}, attendance: {}, deletionAudit: {}, occurrences: {} };
  }
}

repository.getDemoOccurrences = function() {
  return Object.entries(occurrenceDemoStore().occurrences || {}).map(([id, row]) => ({ id, ...row })).sort((a, b) => `${b.date || ""}T${b.time || "00:00"}`.localeCompare(`${a.date || ""}T${a.time || "00:00"}`));
};
repository.saveOccurrence = async function(payload) {
  const record = {
    ...payload,
    createdAt: state.isDemo ? new Date().toISOString() : serverTimestamp(),
    updatedAt: state.isDemo ? new Date().toISOString() : serverTimestamp()
  };
  if (state.isDemo) {
    const data = occurrenceDemoStore();
    const id = createId();
    data.occurrences[id] = record;
    writeDemoData(data);
    subscribeOccurrences();
    return id;
  }
  const result = await addDoc(collection(firebase.db, "occurrences"), record);
  return result.id;
};
repository.assignTeacherToClass = async function(classId, teacherId, teacherName) {
  const classItem = state.classes.find((item) => item.id === classId);
  if (!classItem) throw new Error("Turma não encontrada.");
  if (state.isDemo) {
    const data = demoData();
    data.classes[classId] = { ...(data.classes[classId] || {}), teacherId, teacherName, updatedAt: new Date().toISOString() };
    writeDemoData(data);
    subscribeClasses();
    return;
  }
  const { id, ...payload } = classItem;
  const events = await getDocs(query(collection(firebase.db, "occurrences"), where("classId", "==", classId), limit(400)));
  if (events.docs.length >= 400) throw new Error("Esta turma tem muitas ocorrências para reatribuir automaticamente. Solicite migração assistida.");
  const batch = writeBatch(firebase.db);
  events.docs.forEach((eventDoc) => batch.update(eventDoc.ref, { teacherId, teacherName, updatedAt: serverTimestamp() }));
  batch.set(doc(firebase.db, "classes", classId), { ...payload, teacherId, teacherName, updatedAt: serverTimestamp() }, { merge: true });
  await batch.commit();
};

function cleanAttendanceRecords(records) {
  return Object.fromEntries(Object.entries(records)
    .filter(([, record]) => ["P", "F", "J"].includes(record?.status))
    .map(([id, record]) => [id, { status: record.status, note: String(record.note || "").trim() }]));
}
function countMarked(records = {}) { return Object.values(records).filter((record) => ["P", "F", "J"].includes(record?.status)).length; }
function countPresent(records = {}) { return Object.values(records).filter((record) => record?.status === "P").length; }
function countAbsent(records = {}) { return Object.values(records).filter((record) => record?.status === "F").length; }
function countJustified(records = {}) { return Object.values(records).filter((record) => record?.status === "J").length; }

function studentIsActive(student) { return !["inativa", "inativo", "desativado", "cancelada"].includes(censoKey(student.enrollmentStatus || "Ativa")); }
function renderJustificationSelect(student, record) {
  const values = [...new Set(["Atestado", "Mau-estar", "Viagem", "Outros", record.note].filter(Boolean))];
  return '<select data-attendance-note="'+escapeAttr(student.id)+'" aria-label="Justificativa de '+escapeAttr(student.fullName)+'"><option value="">Sem justificativa</option>'+values.map(v=>'<option '+(record.note===v?'selected':'')+'>'+escapeHtml(v)+'</option>').join("")+'</select>';
}
async function assignEnrollmentCode(classId, studentId) {
  const rows = state.isDemo ? repository.getDemoStudents(classId) : (await getDocs(collection(firebase.db, "classes", classId, "students"))).docs.map(d=>({id:d.id,...d.data()}));
  const highest = rows.reduce((max,s)=>Math.max(max, /^MAT-\d+$/.test(s.enrollmentCode||"") ? Number(s.enrollmentCode.slice(4)) : 0),0);
  if (state.isDemo) {
    const data = demoData(), student = data.students[classId][studentId];
    if (!student.enrollmentCode) {
      data.enrollmentCounters ||= {};
      data.enrollmentCounters[classId] = Math.max(highest, data.enrollmentCounters[classId]||0)+1;
      student.enrollmentCode = "MAT-"+String(data.enrollmentCounters[classId]).padStart(6,"0");
      writeDemoData(data);
    }
    return;
  }
  const ref = doc(firebase.db,"classes",classId,"students",studentId);
  const counter = doc(firebase.db,"classes",classId,"counters","enrollment");
  await runTransaction(firebase.db, async tx=>{
    const current = await tx.get(ref), count = await tx.get(counter);
    if (!current.exists() || current.data().enrollmentCode) return;
    const next = Math.max(highest, count.data()?.value||0)+1;
    tx.set(counter,{value:next});
    tx.update(ref,{enrollmentCode:"MAT-"+String(next).padStart(6,"0"),updatedAt:serverTimestamp()});
  });
}
async function runManagementAction(action,classId,id) {
  if (action === "load-student-filters") { await loadStudentFilterOptions(); toast("Filtros atualizados."); return; }
  if (action === "delete-attendance") {
    const target = state.attendance;
    if (!target.classId || !confirm("Excluir a frequência de "+formatDate(target.date)+"?")) return;
    if (state.isDemo) { const data=demoData(); delete data.attendance[target.classId]?.[target.date]; writeDemoData(data); }
    else await deleteDoc(doc(firebase.db,"classes",target.classId,"attendance",target.date));
    await loadAttendance(); await loadHistory(target.classId); syncMonthlyAttendance(); state.report=null;
    ui["report-content"].classList.add("hidden"); ui["report-empty"].classList.remove("hidden");
    renderClasses(); renderDashboard(); toast("Frequência excluída."); return;
  }
  if (action === "number-students") {
    const rows = await loadStudents(classId);
    for (const s of rows.filter(s=>!s.enrollmentCode)) await assignEnrollmentCode(classId,s.id);
    await loadStudents(classId); renderClasses(); toast("Matrículas geradas. Novos cadastros seguem a sequência."); return;
  }
  const isStudent = action === "toggle-student";
  const item = isStudent ? findStudent(classId,id) : state.classes.find(c=>c.id===classId);
  if (!item) return;
  const patch = isStudent ? {enrollmentStatus:studentIsActive(item)?"Inativa":"Ativa"} : {active:item.active===false};
  if (state.isDemo) {
    const data=demoData(); Object.assign(isStudent ? data.students[classId][id] : data.classes[classId],patch); writeDemoData(data);
    Object.assign(item,patch);
  } else await setDoc(isStudent ? doc(firebase.db,"classes",classId,"students",id) : doc(firebase.db,"classes",classId),{...patch,updatedAt:serverTimestamp()},{merge:true});
  Object.assign(item,patch); renderClasses(); renderAttendance(); renderDashboard();
}
async function loadStudentFilterOptions() {
  await Promise.all(state.classes.map(c=>loadStudents(c.id)));
  const all=state.classes.flatMap(cl=>(state.studentsByClass[cl.id]||[]).map(student=>({student,cl})));
  for (const [field,selector] of [["neighborhood",r=>r.student.neighborhood],["gender",r=>normalizeGender(r.student.gender)],["sport",r=>r.cl.sport]]) {
    const select=ui["students-"+field], prior=select.value;
    select.replaceChildren(new Option("Todos",""));
    [...new Set(all.map(selector).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR")).forEach(v=>select.add(new Option(v,v)));
    select.value=prior;
  }
  return all;
}
async function generateStudentReport() {
  const all=await loadStudentFilterOptions();
  const min=ui["students-min-age"].value, max=ui["students-max-age"].value;
  if (min!=="" && max!=="" && Number(min)>Number(max)) throw new Error("Idade mínima maior que máxima.");
  const selectedClass=ui["report-class"].value, group=ui["students-group"].value;
  const rows=all.filter(({student:s,cl})=>{
    const age=censoAge(s);
    return (selectedClass==="all"||cl.id===selectedClass) &&
      (!ui["students-neighborhood"].value||s.neighborhood===ui["students-neighborhood"].value) &&
      (!ui["students-gender"].value||normalizeGender(s.gender)===ui["students-gender"].value) &&
      (!ui["students-sport"].value||cl.sport===ui["students-sport"].value) &&
      (!ui["students-status"].value||(studentIsActive(s)?"Ativa":"Inativa")===ui["students-status"].value) &&
      (min===""||(age!==null&&age>=Number(min))) && (max===""||(age!==null&&age<=Number(max)));
  });
  const groups=censoRank(rows,({student:s,cl})=>String(group==="sport"?cl.sport:group==="age"?(censoAge(s)??"Não informada"):(group==="gender"?normalizeGender(s.gender):s[group])||"Não informado"));
  const csv=[["Aluno ID","Matrícula","Aluno","Turma","Bairro","Gênero","Modalidade","Idade","Situação"],...rows.map(({student:s,cl})=>[s.globalStudentId||"Pendente",s.enrollmentCode||"",s.fullName,cl.name,s.neighborhood||"",normalizeGender(s.gender),cl.sport,censoAge(s)??"",studentIsActive(s)?"Ativa":"Inativa"])];
  state.report={mode:"students",csv};
  ui["report-empty"].classList.add("hidden"); ui["report-content"].classList.remove("hidden");
  ui["report-content"].innerHTML='<article class="panel" style="padding:20px"><h2>Cadastro de alunos</h2><p>'+censoUnique(rows).length+' pessoas · '+rows.length+' matrículas. Cadastros antigos sem ID usam estimativa por nome e nascimento.</p><div id="student-report-chart" class="censo-bars"></div><div class="table-wrap"><table><thead><tr>'+csv[0].map(v=>'<th>'+escapeHtml(v)+'</th>').join("")+'</tr></thead><tbody>'+csv.slice(1).map(r=>'<tr>'+r.map(v=>'<td>'+escapeHtml(v)+'</td>').join("")+'</tr>').join("")+'</tbody></table></div></article>';
  censoPlot("student-report-chart",groups,rows.length,"Nenhum aluno nos filtros.");
}

const enrollmentMigrations = new Set();
async function migrateEnrollments(classId) {
 if (enrollmentMigrations.has(classId)) return; enrollmentMigrations.add(classId);
 try { const rows=await loadStudents(classId); for (const s of rows.filter(s=>!s.enrollmentCode)) await assignEnrollmentCode(classId,s.id); await loadStudents(classId); renderClasses(); } finally { enrollmentMigrations.delete(classId); }
}

// Included in app.js at release time: shares the module's authenticated state.
const MASTER_FIELDS = ['fullName','preferredName','birthDate','gender','neighborhood','city','state','street','number','complement','postalCode','guardianName','guardianPhone','studentPhone','phone','pcdStatus','registrationDate','contact','territoryZoneId','territoryZoneName','territorySector','territorySource','geo'];
let registryBusy = false;
let registryRows = [];
let neighborhoodBase = [];
PAGE_TITLES.reports=["ANÁLISE", "Relatórios do Censo e presença"];
PAGE_TITLES.students = ['CADASTRO ÚNICO', 'Base geral de alunos'];

function masterStudent(fields, id, timestamp, createdBy) {
  return { ...Object.fromEntries(MASTER_FIELDS.filter(k=>fields[k]!==undefined).map(k=>[k,fields[k]])), globalStudentId:id, createdBy, updatedAt:timestamp };
}

function mergeMasterChanges(master,payload,prior) {
  const changes=Object.fromEntries(MASTER_FIELDS.filter(key=>payload[key]!==undefined&&JSON.stringify(payload[key]??'')!==JSON.stringify(prior[key]??'')).map(key=>[key,payload[key]]));
  return {...master,...changes};
}
async function studentIdentityKey(student) {
  const normalized=censoKey(student.fullName).replace(/\s+/g,' ').trim()+'|'+String(student.birthDate||'').trim();
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function duplicateIdentityError(id) { state.duplicateStudentId=id;document.getElementById('find-existing-student').hidden=!state.isAdmin; return Error('Já existe um aluno com este nome completo e esta data de nascimento: '+id+'. Procure-o em Base geral de alunos e reutilize o Aluno ID para uma nova matrícula. Nenhum novo aluno foi salvo.'); }
async function saveRegisteredStudent(values) {
  const {classId, studentId, ...fields} = values;
  if(!classId || !String(fields.fullName || '').trim()) throw Error('Informe a turma e o nome do aluno.');
  const id = studentId || (fields.globalStudentId ? "g-"+String(fields.globalStudentId).trim().toUpperCase() : createId());
  const payload = buildStudentPayload(fields, state.isDemo ? new Date().toISOString() : serverTimestamp());
  const rows = await loadStudents(classId);
  const prior = rows.find(s=>s.id===id);
  if(!studentId && prior) throw Error("Este aluno já tem matrícula nesta turma.");
  const requestedId = String(fields.globalStudentId || prior?.globalStudentId || '').trim().toUpperCase();
  if(requestedId && !/^ALU-\d{6,}$/.test(requestedId)) throw Error('Aluno ID inválido. Use ALU-000001 ou deixe vazio para um novo aluno.');
  if(prior?.globalStudentId && requestedId!==prior.globalStudentId) throw Error('O Aluno ID de uma matrícula existente é permanente.');
  if(requestedId && rows.some(s=>s.id!==id && s.globalStudentId===requestedId)) throw Error('Este aluno já tem matrícula nesta turma. Edite o vínculo existente.');
  const identityKey=await studentIdentityKey(payload);
  const priorIdentityKey=prior?await studentIdentityKey(prior):'';
  if(!state.isAdmin && prior?.globalStudentId && priorIdentityKey!==identityKey)throw Error('A alteração do nome ou nascimento de um Aluno ID existente deve ser feita pela administração.');
  const highest = rows.reduce((n,s)=>Math.max(n,/^MAT-\d+$/.test(s.enrollmentCode||'')?Number(s.enrollmentCode.slice(4)):0),0);
  if(state.isDemo) {
    const data=demoData(); data.studentIdentityIndex ||= {}; data.studentRegistry ||= {}; data.registryCounter ||= 0; data.enrollmentCounters ||= {}; data.students[classId] ||= {};
    let globalId=requestedId;
    const indexed=data.studentIdentityIndex[identityKey];
    const duplicate=Object.values(data.studentRegistry).find(s=>censoKey(s.fullName)===censoKey(payload.fullName)&&(s.birthDate||'')===(payload.birthDate||''));
    const existingIdentityId=indexed?.globalStudentId||duplicate?.globalStudentId;
    if(existingIdentityId&&existingIdentityId!==globalId)throw duplicateIdentityError(existingIdentityId);
    if(globalId && !data.studentRegistry[globalId]) throw Error('Aluno ID não encontrado na base geral.');
    if(!globalId) globalId='ALU-'+String(++data.registryCounter).padStart(6,'0');
    const existing=data.studentRegistry[globalId];
    if(existing && !prior?.globalStudentId && (censoKey(existing.fullName)!==censoKey(payload.fullName) || (existing.birthDate && payload.birthDate && existing.birthDate!==payload.birthDate))) throw Error('O nome informado não corresponde ao Aluno ID.');
    const stamp=new Date().toISOString();
    data.studentIdentityIndex[identityKey]={globalStudentId:globalId};
    if(priorIdentityKey && priorIdentityKey!==identityKey && data.studentIdentityIndex[priorIdentityKey]?.globalStudentId===globalId)delete data.studentIdentityIndex[priorIdentityKey];
    data.studentRegistry[globalId]={...existing,...masterStudent(existing ? (prior?.globalStudentId ? mergeMasterChanges(existing,payload,prior) : existing) : payload,globalId,stamp,existing?.createdBy||state.user.uid),createdAt:existing?.createdAt||stamp};
    let code=prior?.enrollmentCode || payload.enrollmentCode;
    data.enrollmentCounters[classId]=Math.max(highest,data.enrollmentCounters[classId]||0,/^MAT-\d+$/.test(code||'')?Number(code.slice(4)):0);
    if(!code){data.enrollmentCounters[classId]=Math.max(highest,data.enrollmentCounters[classId]||0)+1;code='MAT-'+String(data.enrollmentCounters[classId]).padStart(6,'0');}
    data.students[classId][id]={...prior,...payload,globalStudentId:globalId,enrollmentCode:code,createdAt:prior?.createdAt||stamp};
    delete data.students[classId][id].id;
    writeDemoData(data);
    if(state.selectedClassId===classId) observeSelectedStudents(classId); else await loadStudents(classId);
    return id;
  }
  const ref=doc(firebase.db,'classes',classId,'students',id);
  const globalCounter=doc(firebase.db,'registryCounters','students');
  const enrollmentCounter=doc(firebase.db,'classes',classId,'counters','enrollment');
  await runTransaction(firebase.db,async tx=>{
    const current=await tx.get(ref), count=await tx.get(globalCounter), enrollment=await tx.get(enrollmentCounter);
    const old=current.data() || {};
    const identityRef=doc(firebase.db,'studentIdentityIndex',identityKey), identity=await tx.get(identityRef);
    const oldIdentityRef=priorIdentityKey&&priorIdentityKey!==identityKey?doc(firebase.db,'studentIdentityIndex',priorIdentityKey):null;
    const oldIdentity=oldIdentityRef?await tx.get(oldIdentityRef):null;
    const intendedId=old.globalStudentId||requestedId;
    if(identity.exists()&&identity.data().globalStudentId!==intendedId&&(state.isAdmin||!old.globalStudentId))throw duplicateIdentityError(identity.data().globalStudentId);
    if(!studentId && current.exists()) throw Error('Este aluno já tem matrícula nesta turma.');
    const globalId=old.globalStudentId || requestedId || 'ALU-'+String((count.data()?.value||0)+1).padStart(6,'0');
    const masterRef=doc(firebase.db,'studentRegistry',globalId);
    // A new class teacher can edit an existing enrollment without opening the general person registry.
    const master=(!state.isAdmin && old.globalStudentId) ? {exists:()=>true,data:()=>({createdBy:'',fullName:payload.fullName})} : await tx.get(masterRef);
    if(requestedId && !master.exists()) throw Error('Aluno ID não encontrado na base geral.');
    if(master.exists() && !old.globalStudentId && (censoKey(master.data().fullName)!==censoKey(payload.fullName) || (master.data().birthDate && payload.birthDate && master.data().birthDate!==payload.birthDate))) throw Error('O nome informado não corresponde ao Aluno ID.');
    if(!requestedId && !old.globalStudentId && master.exists()) throw Error('Contador geral inconsistente. Solicite revisão à administração.');
    if(old.globalStudentId&&state.isAdmin&&master.exists()){const canonicalKey=await studentIdentityKey(master.data());if(canonicalKey!==priorIdentityKey&&canonicalKey!==identityKey)throw Error("A ficha geral deste aluno foi atualizada. Abra novamente o cadastro antes de salvar.");}
    if(!identity.exists()&&(!old.globalStudentId||state.isAdmin))tx.set(identityRef,{globalStudentId:globalId});
    if(oldIdentityRef&&oldIdentity?.exists()&&oldIdentity.data().globalStudentId===globalId&&state.isAdmin)tx.delete(oldIdentityRef);
    if(!master.exists()) {
      tx.set(globalCounter,{value:(count.data()?.value||0)+1});
      tx.set(masterRef,{...masterStudent(payload,globalId,serverTimestamp(),state.user.uid),createdAt:serverTimestamp()});
    } else if(state.isAdmin || master.data().createdBy===state.user.uid) {
      if(old.globalStudentId)tx.update(masterRef,masterStudent(mergeMasterChanges(master.data(),payload,old),globalId,serverTimestamp(),master.data().createdBy));
    }
    let code=old.enrollmentCode || payload.enrollmentCode;
    const reserve=Math.max(highest,enrollment.data()?.value||0,/^MAT-\d+$/.test(code||'')?Number(code.slice(4)):0);
    if(code && reserve>(enrollment.data()?.value||0))tx.set(enrollmentCounter,{value:reserve});
    if(!code){const next=Math.max(highest,enrollment.data()?.value||0)+1;tx.set(enrollmentCounter,{value:next});code='MAT-'+String(next).padStart(6,'0');}
    tx.set(ref,{...payload,globalStudentId:globalId,enrollmentCode:code,...(!current.exists()?{createdAt:serverTimestamp()}:{})},{merge:true});
  });
  return id;
}

function subscribeActivityCatalogue() {
  state.unsubscribers.catalogue?.();
  if(state.isDemo){state.activityCatalogue=repository.getDemoClasses();return;}
  state.unsubscribers.catalogue=onSnapshot(collection(firebase.db,'activityCatalogue'),snapshot=>{
    state.activityCatalogue=snapshot.docs.map(d=>({id:d.id,...d.data()}));
    if(state.activeView==='modalities') renderModalities();
    if(state.activeView==='territory'){renderTerritory();renderTerritoryLinks();renderNeighborhoodDirectory().catch(e=>toast(e.message,'error'));}
  },error=>toast('Catálogo de atividades: '+friendlyFirebaseError(error),'error'));
}

async function readRegistry() {
  if(!state.isAdmin) throw Error('A base geral é exclusiva da administração.');
  registryRows=state.isDemo?Object.values(demoData().studentRegistry||{}):(await getDocs(collection(firebase.db,'studentRegistry'))).docs.map(d=>({globalStudentId:d.id,...d.data()}));
  return registryRows;
}

async function runGenderNormalization(button) {
  if (!state.isAdmin) throw Error('Operação exclusiva da administração.');
  if (state.genderNormalizationBusy) return;
  state.genderNormalizationBusy = true; button.disabled = true;
  const actor = state.user?.uid;
  const status = text => {
    const target = document.getElementById('gender-normalization-status');
    if (target) target.textContent = text;
  };
  let updated = 0;
  try {
    status('Conferindo base geral e matrículas…');
    if (state.isDemo) {
      const data = demoData();
      const rows = [...Object.values(data.studentRegistry || {}), ...Object.values(data.students || {}).flatMap(group => Object.values(group))];
      for (const row of rows) {
        const gender = normalizeGender(row.gender);
        if (gender !== row.gender && gender) {row.gender = gender; updated++;}
      }
      writeDemoData(data);
      for (const cl of state.classes) await loadStudents(cl.id);
    } else {
      // Scan completely before the first write. No partial migration on read failure.
      const candidates = [];
      const collect = snapshot => snapshot.docs.forEach(d => {
        const before = d.data().gender;
        const after = normalizeGender(before);
        if (after && before !== after) candidates.push({ref:d.ref, before, after});
      });
      collect(await getDocs(collection(firebase.db, 'studentRegistry')));
      const classes = await getDocs(collection(firebase.db, 'classes'));
      for (const cl of classes.docs) collect(await getDocs(collection(firebase.db, 'classes', cl.id, 'students')));
      if (candidates.length) downloadBlob(JSON.stringify({version:APP_VERSION, date:new Date().toISOString(),
        changes:candidates.map(c => ({path:c.ref.path, before:c.before, after:c.after}))}, null, 2),
        `backup-generos-${localDate()}.json`, 'application/json');
      for (let start = 0; start < candidates.length; start += 150) {
        if (!state.isAdmin || state.user?.uid !== actor) throw Error('A sessão mudou. A padronização foi interrompida.');
        const chunk = candidates.slice(start, start + 150);
        // Reread every gender inside the transaction; never overwrite a newer correction.
        const changed = await runTransaction(firebase.db, async tx => {
          const snapshots = await Promise.all(chunk.map(c => tx.get(c.ref)));
          let count = 0;
          snapshots.forEach((snapshot, index) => {
            if (!snapshot.exists()) return;
            const before = snapshot.data().gender, after = normalizeGender(before);
            if (after && before !== after) {tx.update(chunk[index].ref, {gender:after});count++;}
          });
          return count;
        });
        updated += changed;
        status(`${updated} registros padronizados. Conferidos ${Math.min(start+150,candidates.length)} de ${candidates.length}.`);
      }
      await refreshIndicators();
    }
    registryRows = []; renderDashboard();
    status(`${updated} registros atualizados. Feminino/Masculino padronizados na base geral e nas matrículas.`);
    toast(`${updated} registros de gênero padronizados.`);
  } catch(error) {
    status(`Interrompido após ${updated} atualizações: ${friendlyFirebaseError(error)}. Execute novamente para concluir os restantes.`);
    throw error;
  } finally {state.genderNormalizationBusy = false;button.disabled = false;}
}
async function renderStudentRegistry() {
  if(!state.isAdmin){setActiveView('dashboard');return;}
  await readRegistry();
  const select=document.getElementById('registry-enrollment-class'), prior=select.value||state.selectedClassId;
  select.innerHTML=state.classes.map(cl=>'<option value="'+escapeAttr(cl.id)+'">'+escapeHtml(cl.name)+'</option>').join('');
  if(state.classes.some(cl=>cl.id===prior))select.value=prior;
  renderRegistryTable();
}
function renderRegistryTable() {
  const q=censoKey(document.getElementById('registry-search').value);
  const rows=registryRows.filter(s=>!q||censoKey([s.fullName,s.globalStudentId,s.neighborhood].join(' ')).includes(q)).sort((a,b)=>String(a.globalStudentId||'').localeCompare(String(b.globalStudentId||'')));
  document.getElementById('registry-summary').textContent=`${rows.length} de ${registryRows.length} pessoas • sem divisão por modalidade. Exporte a base antes de excluir.`;
  document.getElementById('registry-list').innerHTML=rows.length?`<table><thead><tr><th>Aluno ID</th><th>Nome completo</th><th>Nascimento</th><th>Bairro</th><th>Vínculo</th></tr></thead><tbody>${rows.map(s=>`<tr><td><strong>${escapeHtml(s.globalStudentId)}</strong></td><td>${escapeHtml(s.fullName)}</td><td>${s.birthDate?formatDate(s.birthDate):'Não informado'}</td><td>${escapeHtml(s.neighborhood||'Não informado')}</td><td><button type="button" class="button button-secondary button-compact" data-v11="enroll-existing" data-id="${escapeAttr(s.globalStudentId)}">Nova matrícula</button></td></tr>`).join('')}</tbody></table>`:'<div class="empty-state"><h3>Nenhum aluno encontrado</h3><p>Adicione ou importe alunos em uma turma. Para os registros anteriores, use Integrar cadastros antigos.</p></div>';
}
async function migrateStudentRegistry() {
  if(!state.isAdmin)throw Error('Operação exclusiva da administração.');
  await readRegistry();
  let count=0;
  for(const cl of state.classes) {
    const rows=await loadStudents(cl.id);
    for(const student of rows.filter(s=>!s.globalStudentId)) {
      const candidates=registryRows.filter(r=>censoKey(r.fullName)===censoKey(student.fullName)&&(r.birthDate||'')===(student.birthDate||''));
      if(candidates.length>1)throw Error('Há mais de um Aluno ID para '+student.fullName+'. Revise a base geral antes de integrar esta matrícula.');
      // Explicit human review prevents two different people with the same name/birth from being merged silently.
      const reuse=candidates.length===1;
      await repository.saveStudent({...student,classId:cl.id,studentId:student.id,globalStudentId:reuse?candidates[0].globalStudentId:''});
      await readRegistry(); count++;
    }
    await loadStudents(cl.id);
  }
  await renderStudentRegistry();renderDashboard();toast(`${count} matrículas integradas à base geral.`);
}
async function deleteAllStudents() {
  if(!state.isAdmin)throw Error('Operação exclusiva da administração.');
  await readRegistry();
  const classes=state.classes.slice();
  const links=[];
  for(const cl of classes) for(const student of await loadStudents(cl.id))links.push({classId:cl.id,student});
  if(!registryRows.length&&!links.length){toast('A base já está vazia.');return;}
  if(prompt(`Excluir ${registryRows.length} pessoas da base geral e ${links.length} matrículas de TODAS as turmas? As chamadas e ocorrências históricas serão preservadas e ainda podem conter nomes. Os contadores não serão reiniciados.\nDigite EXCLUIR TODOS OS ALUNOS para continuar.`)!=='EXCLUIR TODOS OS ALUNOS')return;
  // Always download the exact data being removed before the first delete.
  const backup=JSON.stringify({version:APP_VERSION,exportedAt:new Date().toISOString(),students:registryRows,enrollments:links},null,2);
  downloadBlob(backup,`backup-alunos-${localDate()}.json`,'application/json');
  if(!confirm('O backup JSON foi preparado para download. Confirme que o arquivo foi salvo antes de excluir definitivamente.'))return;
  await repository.createDeletionAudit({action:'delete_all_students',classId:'all',backupReference:`backup-alunos-${localDate()}.json`});
  if(state.isDemo){const data=demoData();data.studentRegistry={};data.studentIdentityIndex={};for(const cl of classes)data.students[cl.id]={};writeDemoData(data);}
  else {
    const identitySnapshot=await getDocs(collection(firebase.db,'studentIdentityIndex'));
    const refs=links.map(x=>doc(firebase.db,'classes',x.classId,'students',x.student.id)).concat(registryRows.map(s=>doc(firebase.db,'studentRegistry',s.globalStudentId)),identitySnapshot.docs.map(d=>d.ref));
    for(let i=0;i<refs.length;i+=400){const batch=writeBatch(firebase.db);refs.slice(i,i+400).forEach(ref=>batch.delete(ref));await batch.commit();}
  }
  for(const cl of classes)state.studentsByClass[cl.id]=[];
  if(state.selectedClassId)observeSelectedStudents(state.selectedClassId);
  await renderStudentRegistry();renderDashboard();toast('Base geral e matrículas excluídas. Históricos e contadores preservados.');
}

function syncReportControls() {
  const mode=document.getElementById('report-period-type').value;
  document.getElementById('student-report-filters').hidden=mode!=='students';
  document.getElementById('report-month-wrap').hidden=mode!=='month';
  document.getElementById('report-week-wrap').hidden=mode!=='week';
  document.querySelectorAll('.censo-report-info').forEach(el=>el.hidden=mode==='students');
  if(mode==='students')loadStudentFilterOptions().catch(e=>toast(e.message,'error'));
}

async function handleV11Action(button) {
  const action=button.dataset.v11;
  if(action==='normalize-genders'){await runGenderNormalization(button);return;}
  if(action==='retry-territory'){await loadBundledTerritoryZones();state.territoryZones=mergeTerritoryZones(state.bundledTerritoryZones,state.territoryZones);neighborhoodBase=[];await renderNeighborhoodDirectory();renderTerritory();return;}
  if(action==='fit-city'||action==='fit-centers'){state.mapExtent=action==='fit-city'?'municipality':'centers';state.selectedNeighborhood='';state.selectedTerritoryZoneId=null;state.territoryFilter='all';renderTerritory();renderNeighborhoodDirectory().catch(e=>toast(e.message,'error'));return;}
  if(action==='find-existing'){
    if(!state.isAdmin)throw Error('Solicite à administração a consulta do Aluno ID existente.');
    closeDialog('student-dialog');setActiveView('students');document.getElementById('registry-search').value=state.duplicateStudentId||'';await renderStudentRegistry();return;
  }
  if(action==='enroll-existing'){
    if(!state.isAdmin)throw Error('Operação exclusiva da administração.');
    const master=registryRows.find(s=>s.globalStudentId===button.dataset.id), classId=document.getElementById('registry-enrollment-class').value;
    if(!master||!classId)throw Error('Selecione uma turma para criar a matrícula.');
    const rows=await loadStudents(classId), existing=rows.find(s=>s.globalStudentId===master.globalStudentId);
    openStudentDialog(classId,existing?.id||'');
    if(!existing){const form=ui['student-form'];Object.entries(master).forEach(([key,value])=>{if(form.elements[key]&&typeof value==='string')form.elements[key].value=key==='gender'?normalizeGender(value):value;});populateTerritoryZoneOptions(master.territoryZoneId||'');syncTerritoryFields(form);updateStudentAgePreview();}
    return;
  }
  if(action==='center'){await focusSportsCenter(button.dataset.id);return;}
  if(action==='place-center'){if(!state.isAdmin)throw Error('Operação exclusiva da administração.');state.placingCenterId=button.dataset.id;state.selectedNeighborhood='';state.selectedTerritoryZoneId=null;renderTerritory();document.getElementById('territory-map').scrollIntoView({behavior:'smooth',block:'center'});toast('Clique no mapa para posicionar este polo.');return;}
  if(action==='indicator') {
    const index=Number(button.dataset.index);
    const destinations=['students','reports','classes','modalities','modalities','reports','reports','reports','occurrences','attendance'];
    const view=destinations[index]||'reports';
    setActiveView(view==='students'&&!state.isAdmin?'classes':view);
    if(view==='reports'){document.getElementById('report-period-type').value=index===1?'students':'month';syncReportControls();}
    return;
  }
  if(action==='neighborhood'){state.selectedNeighborhood=button.dataset.name;state.selectedTerritoryZoneId=null;state.territoryFilter='all';await renderNeighborhoodDirectory();renderTerritory();return;}
  if(action==='layer'){state.territoryLayer=button.value;state.territoryFilter='all';state.selectedTerritoryZoneId=null;renderTerritory();return;}
  if(action==='clear-territory'){document.getElementById('sports-center-search').value='';document.getElementById('neighborhood-search').value='';state.selectedNeighborhood='';state.selectedTerritoryZoneId=null;state.territoryFilter='all';await renderNeighborhoodDirectory();renderTerritory();return;}
  if(registryBusy)return;
  registryBusy=true;button.disabled=true;
  try {
    if(action==='migrate')await migrateStudentRegistry();
    if(action==='delete-all')await deleteAllStudents();
    if(action==='export-registry') {
      const rows=await readRegistry(), fields=['globalStudentId','fullName','birthDate','gender','neighborhood','city','postalCode'];
      downloadBlob('\uFEFF'+[fields,...rows.map(s=>fields.map(f=>s[f]||''))].map(r=>r.map(csvCell).join(';')).join('\n'),`base-geral-alunos-${localDate()}.csv`,'text/csv;charset=utf-8');
    }
  } finally {registryBusy=false;button.disabled=false;}
}

async function renderNeighborhoodDirectory() {
  if(!neighborhoodBase.length) {
    neighborhoodBase=(state.neighborhoodDirectory?.neighborhoods||[]).map(n=>n.name);
    if(!neighborhoodBase.length)neighborhoodBase=(await fetchJsonResource('data/votorantim_bairros_base.geojson')).features.map(f=>f.properties.bairro_original).filter(Boolean);
  }
  const q=neighborhoodKey(document.getElementById('neighborhood-search').value);
  const names=[...new Set([...neighborhoodBase,...state.territoryZones.map(z=>z.name),...allSportsCenters().map(c=>c.neighborhood).filter(Boolean),...loadedStudents().map(s=>s.neighborhood).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const unique=new Map();names.forEach(n=>{if(!unique.has(neighborhoodKey(n)))unique.set(neighborhoodKey(n),n);});
  document.getElementById('neighborhood-directory').innerHTML=[...unique.values()].filter(n=>!q||neighborhoodKey(n).includes(q)).map(n=>{
    const people=censoUnique(loadedStudents().map(student=>({student}))).filter(({student})=>neighborhoodKey(student.neighborhood)===neighborhoodKey(n));
    return `<button type="button" data-v11="neighborhood" data-name="${escapeAttr(n)}" class="v11-neighborhood ${state.selectedNeighborhood===n?'selected':''}"><span>${escapeHtml(n)}</span><b>${people.length}</b></button>`;
  }).join('')||'<p>Nenhum bairro encontrado.</p>';
  const selected=state.selectedNeighborhood;
  if(selected) {
    const people=censoUnique(loadedStudents().map(student=>({student}))).filter(({student})=>neighborhoodKey(student.neighborhood)===neighborhoodKey(selected));
    const source=state.neighborhoodDirectory?.neighborhoods.find(n=>neighborhoodKey(n.name)===neighborhoodKey(selected));
    document.getElementById('neighborhood-detail').innerHTML=`<h3>${escapeHtml(selected)} • ${people.length} pessoas</h3><p>Contagem por bairro declarado no cadastro. O mapa destaca o agrupamento em que este bairro é predominante. Para localidades sem agrupamento próprio, mostra os polígonos de origem associados. São áreas de referência, sujeitas à revisão municipal.</p><p>${source ? source.dominantSectorCodes.length+" polígonos com predominância • "+source.sectorCodes.length+" com endereços associados • CEPs: "+source.postalCodes.slice(0,10).map(c=>escapeHtml(c.replace(/^(\d{5})(\d{3})$/,"$1-$2"))).join(", ")+(source.postalCodes.length>10?"…":"") : "Bairro declarado no cadastro; sem correspondência confirmada no CNEFE."}</p>${state.isAdmin?people.map(({student:s})=>`<span class="pill">${escapeHtml(s.globalStudentId||'ID pendente')} · ${escapeHtml(s.fullName)}</span>`).join(''):''}`;
  }else document.getElementById('neighborhood-detail').innerHTML='<p>Selecione um bairro para consultar sua população cadastrada. Contagens consideram somente os cadastros autorizados e carregados.</p>';
}

document.getElementById('registry-search').addEventListener('input',renderRegistryTable);
document.getElementById('neighborhood-search').addEventListener('input',()=>renderNeighborhoodDirectory().catch(e=>toast(e.message,'error')));
document.getElementById('report-period-type').addEventListener('change',syncReportControls);
document.addEventListener('keydown',event=>{const card=event.target.closest('.interactive-stat');if(card&&['Enter',' '].includes(event.key)){event.preventDefault();card.click();}});

for(const id of ['occurrence-search','occurrence-category','occurrence-since','occurrence-until'])document.getElementById(id).addEventListener('input',renderOccurrences);

function neighborhoodKey(value){return censoKey(value).replace(/^(jd\.?|jdm)\s+/,'jardim ').replace(/^pq\.?\s+/,'parque ').replace(/^vl\.?\s+/,'vila ').replace(/[-–]/g,' ').replace(/\s+/g,' ').trim();}
document.getElementById('territory-layer-select').addEventListener('change',e=>handleV11Action(e.target).catch(err=>toast(err.message,'error')));

async function syncActivityCatalogue() {
  if(state.isDemo)return;
  const items=state.classes.slice();
  for(let index=0;index<items.length;index+=400){
    const batch=writeBatch(firebase.db);
    for(const cl of items.slice(index,index+400))batch.set(doc(firebase.db,'activityCatalogue',cl.id),{name:cl.name||'',sport:cl.sport||'',location:cl.location||'',schedule:cl.schedule||'',ageGroup:cl.ageGroup||'',territoryZoneId:cl.territoryZoneId||'',teacherName:cl.teacherName||'',active:cl.active!==false});
    await batch.commit();
  }
  if(state.isAdmin){
    const valid=new Set(items.map(c=>c.id)), snapshot=await getDocs(collection(firebase.db,'activityCatalogue'));
    const stale=snapshot.docs.filter(d=>!valid.has(d.id));
    for(let index=0;index<stale.length;index+=400){const batch=writeBatch(firebase.db);stale.slice(index,index+400).forEach(d=>batch.delete(d.ref));await batch.commit();}
  }
}

function subscribeSportsCenters() {
  state.unsubscribers.sportsCenters?.();
  if(state.isDemo){state.sportsCenters=mergeSportsCenters(demoData().sportsCenters||{});return;}
  state.unsubscribers.sportsCenters=onSnapshot(collection(firebase.db,'sportsCenters'),snapshot=>{
    state.sportsCenters=mergeSportsCenters(Object.fromEntries(snapshot.docs.map(d=>[d.id,d.data()])));
    if(state.activeView==='territory')renderTerritory();
  },e=>toast('Polos oficiais carregados. Ajustes locais dependem das regras Firestore V11.','error'));
}
function mergeSportsCenters(overrides) {
  const base=(state.bundledSportsCenters||[]).map(center=>({...center,...overrides[center.id],id:center.id}));
  state.sportsCenterOverrides=overrides;
  return base;
}
function validCenterPoint(center) {
  return Number.isFinite(center.latitude)&&Number.isFinite(center.longitude)&&center.latitude>-23.75&&center.latitude<-23.45&&center.longitude>-47.60&&center.longitude<-47.20;
}
function territoryActivities() {
  const entries = new Map((state.activityCatalogue || []).map(cl => [cl.id, cl]));
  state.classes.forEach(cl => entries.set(cl.id, cl));
  return [...entries.values()];
}
function allSportsCenters() {
  return completeVenueDirectory(state.sportsCenters || [], territoryActivities(), window.CensoV2?.places || [], state.territoryZones)
    .map(center => ({...center, ...state.sportsCenterOverrides?.[center.id], id: center.id}));
}
function visibleSportsCenters() {
  return allSportsCenters().filter(center=>validCenterPoint(center)&&(!state.selectedNeighborhood||neighborhoodKey(center.neighborhood)===neighborhoodKey(state.selectedNeighborhood)));
}
function classesForSportsCenter(center) {
  const labels=[center.name,...(center.aliases||[])].map(venueKey);
  return territoryActivities().filter(cl=>labels.includes(venueKey(cl.location)));
}
function sportsCenterPopup(center) {
  const classes=classesForSportsCenter(center);
  const positionLabel=center.positionStatus==='public-map-address-needs-review'?'Equipamento identificado em mapa público • referência a conferir':center.positionStatus==='address-cnefe-2022-review-entrance'?'Ponto de referência do endereço • entrada a conferir':center.positionStatus==='manual-map-selection'?'Posição revisada pela administração':'Equipamento localizado por cadastro público';
  return '<div class="sports-center-popup"><span class="v11-green-label">● POLO ESPORTIVO</span><h3>'+escapeHtml(center.name)+'</h3><p>'+escapeHtml(center.address)+'</p><p><small>'+escapeHtml(positionLabel)+'</small></p><h4>Atividades cadastradas no sistema</h4>'+(classes.length?'<ul>'+classes.map(cl=>'<li><strong>'+escapeHtml(cl.sport)+'</strong> • '+escapeHtml(cl.name)+'<br>'+escapeHtml(cl.schedule||'Horário não informado')+'</li>').join('')+'</ul>':'<p>Nenhuma turma vinculada a este polo no sistema.</p>')+(center.officialActivities?.length?'<p><strong>Oferta na fonte pública (set/2026)</strong><br>'+center.officialActivities.map(escapeHtml).join(' • ')+'</p>':'')+(center.positionNote?'<p>'+escapeHtml(center.positionNote)+'</p>':'')+(center.sourceUrl?'<a target="_blank" rel="noopener" href="'+escapeAttr(center.sourceUrl)+'">Consultar fonte da Prefeitura ↗</a>':'')+'</div>';
}
function mountSportsCentersLeaflet(map) {
  state.sportsCenterMarkers=new Map();
  if(document.getElementById('show-sports-centers').checked)visibleSportsCenters().forEach(center=>{
    const icon=window.L.divIcon({className:'v11-center-marker',html:'<span aria-hidden="true"></span>',iconSize:[24,24],iconAnchor:[12,12]});
    const marker=window.L.marker([center.latitude,center.longitude],{icon,title:center.name,alt:center.name,keyboard:true,zIndexOffset:700}).addTo(map);
    marker.bindTooltip(center.name,{direction:'top',offset:[0,-12]});marker.bindPopup(sportsCenterPopup(center),{maxWidth:360});state.sportsCenterMarkers.set(center.id,marker);
  });
  map.on('click',event=>{if(state.placingCenterId)confirmSportsCenterPosition(event.latlng.lat,event.latlng.lng).catch(e=>toast(e.message,'error'));});
}
function mountSportsCentersGoogle(map,maps) {
  state.googleSportsCenterMarkers=new Map();
  if(document.getElementById('show-sports-centers').checked)visibleSportsCenters().forEach(center=>{
    const marker=new maps.Marker({map,position:{lat:center.latitude,lng:center.longitude},title:center.name,icon:{path:maps.SymbolPath.CIRCLE,scale:9,fillColor:'#149653',fillOpacity:1,strokeColor:'#fff',strokeWeight:3},zIndex:900});
    const popup=new maps.InfoWindow({content:sportsCenterPopup(center)});marker.addListener('click',()=>popup.open({map,anchor:marker}));state.googleSportsCenterMarkers.set(center.id,{marker,popup});
  });
  map.addListener('click',event=>{if(state.placingCenterId)confirmSportsCenterPosition(event.latLng.lat(),event.latLng.lng()).catch(e=>toast(e.message,'error'));});
}
async function focusSportsCenter(id) {
  const center=allSportsCenters().find(c=>c.id===id);if(!center||!validCenterPoint(center))return;
  state.selectedNeighborhood='';state.selectedTerritoryZoneId=null;document.getElementById('show-sports-centers').checked=true;
  renderTerritory();
  await state.territoryMapReady;
  const leafletMarker=state.sportsCenterMarkers?.get(id);
  const googleMarker=state.googleSportsCenterMarkers?.get(id);
  if(leafletMarker){state.territoryMap.setView([center.latitude,center.longitude],16);leafletMarker.openPopup();}
  else if(googleMarker){state.googleTerritoryMap.setCenter({lat:center.latitude,lng:center.longitude});state.googleTerritoryMap.setZoom(16);googleMarker.popup.open({map:state.googleTerritoryMap,anchor:googleMarker.marker});}
  else {toast('O mapa está indisponível. O endereço permanece na lista de locais.','error');}
  document.getElementById('territory-map').scrollIntoView({behavior:'smooth',block:'center'});
}
function renderSportsCenterDirectory() {
  const target=document.getElementById('sports-center-directory');if(!target)return;
  const search=venueKey(document.getElementById('sports-center-search')?.value);
  const centers=allSportsCenters().filter(c=>(!state.selectedNeighborhood||neighborhoodKey(c.neighborhood)===neighborhoodKey(state.selectedNeighborhood))&&(!search||venueKey([c.name,c.neighborhood,c.address,...(c.aliases||[])].join(' ')).includes(search)));
  document.getElementById('sports-center-count').textContent=centers.filter(validCenterPoint).length+' pontos verdes • '+centers.length+' locais • '+centers.filter(c=>!validCenterPoint(c)).length+' com posição a revisar'+(state.selectedNeighborhood?' • filtro: '+state.selectedNeighborhood:'');
  target.innerHTML=centers.map(c=>'<article class="v11-center-card"><span class="v11-green-label">● '+escapeHtml(c.neighborhood||'Bairro a vincular')+'</span><h4>'+escapeHtml(c.name)+'</h4><p>'+escapeHtml(c.address||'Endereço a completar pela administração')+'</p><small>'+classesForSportsCenter(c).length+' turma(s) vinculada(s)'+(!validCenterPoint(c)?' • localização pendente de revisão':'')+'</small><div class="v11-actions">'+(validCenterPoint(c)?'<button class="button button-secondary button-compact" type="button" data-v11="center" data-id="'+escapeAttr(c.id)+'">Ver no mapa</button>':'')+(state.isAdmin?'<button class="text-button" type="button" data-v11="place-center" data-id="'+escapeAttr(c.id)+'">'+(validCenterPoint(c)?'Ajustar ponto':'Posicionar no mapa')+'</button>':'')+'</div></article>').join('')||'<p>Nenhum polo cadastrado com este bairro. Limpe a seleção para ver a rede completa.</p>';
}
async function confirmSportsCenterPosition(latitude,longitude) {
  if(!state.isAdmin||!state.placingCenterId)return;
  const center=allSportsCenters().find(c=>c.id===state.placingCenterId);state.placingCenterId=null;
  if(!center||!validCenterPoint({latitude,longitude}))throw Error('Selecione um ponto dentro da região de Votorantim.');
  if(!confirm('Confirmar a localização de '+center.name+' em '+latitude.toFixed(6)+', '+longitude.toFixed(6)+'?'))return;
  const patch={latitude,longitude,positionStatus:'manual-map-selection',updatedAt:state.isDemo?new Date().toISOString():serverTimestamp()};
  if(state.isDemo){const data=demoData();data.sportsCenters||={};data.sportsCenters[center.id]=patch;writeDemoData(data);state.sportsCenters=mergeSportsCenters(data.sportsCenters);renderTerritory();}
  else await setDoc(doc(firebase.db,'sportsCenters',center.id),patch,{merge:true});
  toast('Localização do polo atualizada.');
}
document.getElementById('show-sports-centers').addEventListener('change',renderTerritory);
document.getElementById('sports-center-search').addEventListener('input',renderSportsCenterDirectory);

function resolvePostalTerritory(postalCode, neighborhood='', municipality='') {
  const empty={zone:null,neighborhood:'',candidates:[],outside:false};
  if(municipality&&municipality!=='3557006')return {...empty,outside:true};
  const code=String(postalCode||'').replace(/\D/g,'');
  if(code.length!==8)return empty;
  const record=state.postalDirectory?.[code];
  const names=[...new Set(record?.localities.map(n=>n.name)||[])];
  const find=name=>state.territoryZones.find(z=>neighborhoodKey(z.name)===neighborhoodKey(name));
  if(neighborhood){
    const zone=find(neighborhood), candidate=names.find(n=>neighborhoodKey(n)===neighborhoodKey(neighborhood));
    if(zone&&(candidate||!record))return {zone,neighborhood:candidate||neighborhood,candidates:[],outside:false};
    if(zone&&!candidate&&record)return {...empty,candidates:[...new Set([neighborhood,...names])]};
  }
  if(names.length===1){const zone=find(names[0]);if(zone)return {zone,neighborhood:names[0],candidates:[],outside:false};}
  return {...empty,candidates:names};
}
function applyPostalTerritory(form,neighborhood,zone,method) {
  form.elements.neighborhood.value=neighborhood;form.elements.territoryZoneId.value=zone.id;form.elements.territoryMatchMethod.value=method;syncTerritoryFields(form);
}
document.getElementById('postal-neighborhood-choice').addEventListener('change',event=>{
  const name=event.target.value, zone=state.territoryZones.find(z=>neighborhoodKey(z.name)===neighborhoodKey(name));
  if(zone){applyPostalTerritory(ui['student-form'],name,zone,'cep-reviewed');ui['postal-code-help'].textContent='Bairro confirmado • zona vinculada: '+zone.name;}
  else if(name){ui['student-form'].elements.neighborhood.value=name;ui['postal-code-help'].textContent='Bairro registrado; escolha uma zona manualmente para concluir a classificação.';}
});
ui['student-form'].elements.postalCode.addEventListener('blur',()=>{const value=String(ui['student-form'].elements.postalCode.value).replace(/\D/g,'');if(value.length===8&&value!==state.lastPostalLookup){state.lastPostalLookup=value;lookupPostalCode().catch(e=>toast(e.message,'error'));}});
ui['student-form'].elements.postalCode.addEventListener('input',()=>{state.postalRequestId=(state.postalRequestId||0)+1;ui['lookup-postal-code'].disabled=false;ui['student-form'].elements.territoryZoneId.value='';ui['student-form'].elements.territoryMatchMethod.value='not-classified';syncTerritoryFields(ui['student-form']);});
ui['student-form'].elements.neighborhood.addEventListener('change',()=>{const form=ui['student-form'];const zone=state.territoryZones.find(z=>neighborhoodKey(z.name)===neighborhoodKey(form.elements.neighborhood.value));form.elements.territoryZoneId.value=zone?.id||'';form.elements.territoryMatchMethod.value=zone?'manual-zone-selection':'not-classified';syncTerritoryFields(form);});
