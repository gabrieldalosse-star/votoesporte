import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  GoogleAuthProvider,
  getIdTokenResult,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
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
const APP_VERSION = "9.0.0-rc1";
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

async function loadBundledTerritoryZones() {
  // Nenhuma delimitação oficial de setores foi comprovada no pacote recebido.
  // Não produzir polígonos sintéticos: administradores podem importar zonas validadas.
  state.bundledTerritoryZones = [];
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
    ? `${state.territoryZones.length} zona${state.territoryZones.length === 1 ? "" : "s"} aprovada${state.territoryZones.length === 1 ? "" : "s"} disponível${state.territoryZones.length === 1 ? "" : "is"}. A seleção permanece manual para proteger o endereço.`
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
  return loadedStudents().reduce((counts, student) => {
    const id = student.territoryZoneId || student.geo?.zoneId;
    if (id) counts[id] = (counts[id] || 0) + 1;
    return counts;
  }, {});
}

function classesForTerritoryZone(zone) {
  if (!zone) return [];
  const zoneName = comparableText(zone.name);
  return state.classes.filter((item) => {
    if (item.territoryZoneId === zone.id) return true;
    // Legacy classes did not have a zone field. Match only an explicit local
    // name so that an unrelated address never appears as territorial data.
    return zoneName && comparableText(item.location).includes(zoneName);
  });
}

function territoryZonePopup(zone, studentCount) {
  const classes = classesForTerritoryZone(zone);
  const activities = classes.length
    ? `<ul class="territory-map-classes">${classes.map((item) => `<li><strong>${escapeHtml(item.location || "Núcleo sem local")}</strong><span>${escapeHtml([item.sport, item.name, item.schedule].filter(Boolean).join(" · ") || "Aula sem detalhes")}</span></li>`).join("")}</ul>`
    : `<p class="territory-map-empty-detail">Nenhuma aula vinculada a este bairro ainda.</p>`;
  return `<div class="territory-map-popup"><h4>${escapeHtml(zone.name || "Bairro")}</h4><p>${studentCount} cadastro${studentCount === 1 ? "" : "s"} associado${studentCount === 1 ? "" : "s"} · ${classes.length} núcleo${classes.length === 1 ? "" : "s"}</p><h5>Núcleos e aulas</h5>${activities}</div>`;
}

function selectTerritoryZoneFromMap(zoneId) {
  state.selectedTerritoryZoneId = zoneId;
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
  const zones = state.territoryZones;
  renderTerritoryFilter(zones);
  const visibleZones = filteredTerritoryZones(zones);
  const counts = territoryStudentsByZone();
  const classified = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const loaded = loadedStudents().length;
  const neighborhoods = new Set(loadedStudents().map((student) => censoText(student.neighborhood)).filter(Boolean));
  const sourceLabels = [...new Set(zones.map((zone) => zone.sourceVersion).filter(Boolean))];
  ui["territory-summary"].innerHTML = [
    ["Setores no mapa", zones.length, zones.length ? "camada preliminar local" : "arquivo local indisponível"],
    ["Cadastros por zona", classified, loaded ? `de ${loaded} aluno${loaded === 1 ? "" : "s"} carregado${loaded === 1 ? "" : "s"}` : "nenhum aluno carregado"],
    ["Bairros no censo", neighborhoods.size, neighborhoods.size ? "contagem agregada no painel" : "aguardando bairro no cadastro"],
    ["Fonte territorial", sourceLabels.length ? "Preliminar" : "Pendente", sourceLabels.length ? "aproximação; não é limite oficial" : "sem geometria publicada"]
  ].map(([label, value, note]) => `<article class="panel stat-card territory-stat"><div class="stat-label"><span>${escapeHtml(String(label))}</span><i class="stat-icon" aria-hidden="true">⌖</i></div><strong>${escapeHtml(String(value))}</strong><small>${escapeHtml(String(note))}</small></article>`).join("");
  ui["territory-layer-status"].textContent = zones.length ? `${visibleZones.length}/${zones.length} setores` : "Sem camada";
  ui["territory-layer-status"].classList.toggle("inactive", !zones.length);
  ui["territory-map"].innerHTML = renderTerritoryMap(visibleZones, counts);
  mountOfficialTerritoryMap(visibleZones, counts);
  ui["territory-zone-list"].innerHTML = visibleZones.length ? visibleZones.map((zone) => {
    const count = counts[zone.id] || 0;
    const classCount = classesForTerritoryZone(zone).length;
    const selected = zone.id === state.selectedTerritoryZoneId;
    return `<button class="territory-zone-row ${selected ? "selected" : ""}" data-action="select-territory-zone" data-id="${escapeAttr(zone.id)}" type="button"><span class="zone-swatch" aria-hidden="true"></span><span><strong>${escapeHtml(zone.name || "Zona sem nome")}</strong><small>${escapeHtml(zone.sector || "Setor não informado")} · ${classCount} núcleo${classCount === 1 ? "" : "s"}</small></span><b>${count}</b></button>`;
  }).join("") : `<div class="territory-empty"><span aria-hidden="true">⌖</span><strong>Nenhum setor neste filtro</strong><p>Selecione “Todos os setores” para visualizar a camada preliminar completa.</p></div>`;
}

function renderTerritoryMap(zones, counts) {
  const usingGoogle = Boolean(window.GOOGLE_MAPS_CONFIG?.apiKey);
  return `<div id="official-territory-map" class="official-territory-map" aria-label="Mapa de Votorantim com contorno ilustrativo não oficial"></div><p class="territory-map-credit">Contorno territorial do pacote: ILUSTRATIVO, sem precisão ou origem oficial comprovada · Base: ${usingGoogle ? "Google Maps Platform" : "© OpenStreetMap contributors"}. Setores só aparecem após importação aprovada.</p>`;
}

async function mountOfficialTerritoryMap(zones, counts) {
  const target = document.getElementById("official-territory-map");
  if (!target) return;
  state.territoryMap?.remove();
  state.territoryMap = null;
  state.googleTerritoryMap = null;
  target.replaceChildren();
  try {
    const response = await fetch("data/votorantim-contorno-ilustrativo.geojson", { cache: "force-cache" });
    if (!response.ok) throw new Error("Limite municipal indisponível");
    const boundary = await response.json();
    if (window.GOOGLE_MAPS_CONFIG?.apiKey) {
      try {
        await loadGoogleMaps(window.GOOGLE_MAPS_CONFIG);
        mountGoogleTerritoryMap(target, boundary, zones, counts);
        return;
      } catch (error) {
        console.warn("Google Maps indisponível; usando mapa alternativo", error);
      }
    }
    if (!window.L) throw new Error("Biblioteca do mapa indisponível");
    const map = window.L.map(target, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
    state.territoryMap = map;
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
    const boundaryLayer = window.L.geoJSON(boundary, {
      style: { color: "#063b79", weight: 3, fillColor: "#2f94bf", fillOpacity: 0.07 },
      onEachFeature: (_, layer) => layer.bindTooltip("Contorno ilustrativo de Votorantim — não oficial", { sticky: true })
    }).addTo(map);
    map.fitBounds(boundaryLayer.getBounds(), { padding: [16, 16] });
    zones.filter((zone) => geometryPoints(zone.geometry).length).forEach((zone) => {
      const total = counts[zone.id] || 0;
      const selected = zone.id === state.selectedTerritoryZoneId;
      const layer = window.L.geoJSON({ type: "Feature", properties: {}, geometry: zone.geometry }, {
        style: { color: selected ? "#9e1f2a" : "#1268b2", weight: selected ? 3 : 2, fillColor: selected ? "#c62d37" : "#2f94bf", fillOpacity: selected ? 0.38 : 0.22 }
      }).addTo(map);
      layer.bindTooltip(`${zone.name || "Zona"} · ${total} cadastro${total === 1 ? "" : "s"}`, { sticky: true });
      layer.bindPopup(territoryZonePopup(zone, total), { maxWidth: 360 });
      layer.on("click", () => selectTerritoryZoneFromMap(zone.id));
    });
  } catch (error) {
    console.error("Falha ao carregar a geometria ilustrativa", error);
    target.innerHTML = `<div class="territory-map-empty"><span aria-hidden="true">!</span><h4>Mapa não disponível</h4><p>Verifique os dados territoriais e a conexão com a base cartográfica.</p></div>`;
  }
}

function loadGoogleMaps(config) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  const existing = document.querySelector('script[data-google-maps-platform]');
  if (existing) return new Promise((resolve, reject) => {
    existing.addEventListener("load", () => resolve(window.google?.maps), { once: true });
    existing.addEventListener("error", () => reject(new Error("Não foi possível carregar o Google Maps")), { once: true });
  });
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.dataset.googleMapsPlatform = "true";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.apiKey)}&v=weekly&language=pt-BR&region=BR`;
    script.async = true;
    script.onload = () => window.google?.maps ? resolve(window.google.maps) : reject(new Error("Google Maps não foi inicializado"));
    script.onerror = () => reject(new Error("Não foi possível carregar o Google Maps"));
    document.head.append(script);
  });
}

function mountGoogleTerritoryMap(target, boundary, zones, counts) {
  const maps = window.google.maps;
  const map = new maps.Map(target, {
    center: { lat: -23.544, lng: -47.452 }, zoom: 12,
    mapId: window.GOOGLE_MAPS_CONFIG?.mapId || undefined,
    streetViewControl: false, fullscreenControl: true, mapTypeControl: true
  });
  state.googleTerritoryMap = map;
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
function censoPersonKey(student) { const name = censoKey(student.fullName || student.name); const birth = censoText(student.birthDate); return name ? `${name}|${birth}` : ""; }
function censoUnique(rows) { const found = new Set(); return rows.filter(({student}) => { const key = censoPersonKey(student); if (!key || found.has(key)) return false; found.add(key); return true; }); }
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
  const filtered = all.filter(matches), people = censoUnique(filtered);
  const summary=document.getElementById("censo-filter-summary");
  if (summary) summary.innerHTML = `<strong>${people.length}</strong> participante${people.length===1?"":"s"} identificado${people.length===1?"":"s"} · <strong>${filtered.length}</strong> vínculo${filtered.length===1?"":"s"} em turma · <strong>${bairros.length}</strong> bairro${bairros.length===1?"":"s"} com cadastro`;
  const byBairro = censoRank(people,({student})=>censoText(student.neighborhood)||"Bairro não informado");
  const byActivity = censoRank(filtered,({cl})=>censoText(cl.sport)||"Atividade não informada");
  const byAge = censoRank(people,({student})=>{const a=censoAge(student);return a===null?"Idade não informada":a<=6?"0 a 6 anos":a<=11?"7 a 11 anos":a<=14?"12 a 14 anos":a<=17?"15 a 17 anos":a<=29?"18 a 29 anos":a<=59?"30 a 59 anos":"60 anos ou mais";});
  const ageOrder=["0 a 6 anos","7 a 11 anos","12 a 14 anos","15 a 17 anos","18 a 29 anos","30 a 59 anos","60 anos ou mais","Idade não informada"];
  byAge.sort((a,b)=>ageOrder.indexOf(a[0])-ageOrder.indexOf(b[0]));
  const byGender = censoRank(people,({student})=>censoText(student.gender)||"Não informado");
  censoPlot("censo-chart-neighborhood",byBairro,people.length,"Cadastre participantes com bairro para visualizar a distribuição.");
  censoPlot("censo-chart-activity",byActivity,filtered.length,"Não há matrículas neste filtro.");
  censoPlot("censo-chart-age",byAge,people.length,"Não há participantes neste filtro.");
  censoPlot("censo-chart-gender",byGender,people.length,"Não há participantes neste filtro.");
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
    ? `<div class="student-table-wrap"><table class="student-table"><thead><tr><th>Aluno</th><th>Matrícula</th><th>Responsável</th><th>Território</th><th>Situação</th><th>Contato</th><th aria-label="Ações"></th></tr></thead><tbody>${students.map((student) => `
      <tr><td><div class="student-name"><span class="student-initial">${initials(student.preferredName || student.fullName)}</span><span>${escapeHtml(student.preferredName || student.fullName || "Sem nome")}</span></div></td><td>${escapeHtml(student.enrollmentCode || "—")}</td><td>${escapeHtml(student.guardianName || "—")}</td><td>${renderTerritoryPill(student)}</td><td><span class="pill">${escapeHtml(student.enrollmentStatus || "Ativa")}</span></td><td>${renderContactActions(student, classItem.id)}</td><td><div class="row-actions"><button class="row-action" data-action="edit-student" data-id="${escapeAttr(student.id)}" data-class-id="${escapeAttr(classItem.id)}" type="button">Editar</button>${state.isAdmin ? `<button class="row-action danger" data-action="delete-student" data-id="${escapeAttr(student.id)}" data-class-id="${escapeAttr(classItem.id)}" type="button">Excluir</button>` : ""}</div></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty-state"><span aria-hidden="true">+</span><h3>Lista vazia, por enquanto</h3><p>Cadastre um aluno por vez ou importe uma planilha CSV revisada.</p><button class="button button-secondary" data-action="open-student-dialog" data-class-id="${escapeAttr(classItem.id)}" type="button">Cadastrar aluno</button></div>`;
  const historyContent = history.length ? `<div class="history-list">${history.map((entry) => {
    const marked = Number(entry.markedCount || countMarked(entry.records));
    const present = Number(entry.presentCount || countPresent(entry.records));
    const rate = marked ? Math.round((present / marked) * 100) : 0;
    return `<div class="history-row"><div><strong>${formatDate(entry.date)}${entry.sessionTime ? ` · ${escapeHtml(entry.sessionTime)}` : ""}</strong><small>${marked} marcação${marked === 1 ? "" : "ões"}</small></div><span class="pill">${present} presença${present === 1 ? "" : "s"}</span><span class="history-rate">${marked ? `${rate}%` : "—"}</span></div>`;
  }).join("")}</div>` : `<div class="empty-state"><span aria-hidden="true">✓</span><h3>Ainda não há histórico</h3><p>A primeira chamada salva aparecerá aqui, com data e percentual de presença.</p><button class="button button-secondary" data-action="open-attendance" data-id="${escapeAttr(classItem.id)}" type="button">Fazer chamada</button></div>`;
  const content = state.classDetailTab === "history" ? historyContent : studentContent;
  const countText = students.length ? `${students.length} aluno${students.length === 1 ? "" : "s"} carregado${students.length === 1 ? "" : "s"}` : "Sem alunos cadastrados";
  return `<article class="panel class-detail"><div class="class-detail-header"><div><h3>${escapeHtml(classItem.name || "Turma sem nome")}</h3><p>${escapeHtml([classItem.sport, classItem.ageGroup, classItem.location, classItem.schedule].filter(Boolean).join(" · ") || "Complete os dados operacionais da turma.")}</p></div><div class="class-detail-actions"><button class="button button-ghost button-compact" data-action="edit-class" data-id="${escapeAttr(classItem.id)}" type="button">Editar turma</button>${state.isAdmin ? `<button class="button button-ghost button-compact" style="color:#b42318" data-action="delete-class-admin" data-id="${escapeAttr(classItem.id)}" type="button">Excluir turma e dados</button>` : ""}<button class="button button-primary button-compact" data-action="open-attendance" data-id="${escapeAttr(classItem.id)}" type="button">Fazer chamada</button></div></div><div class="class-detail-tabs"><button class="detail-tab ${state.classDetailTab === "students" ? "active" : ""}" data-action="detail-tab" data-tab="students" type="button">Alunos <span>(${students.length})</span></button><button class="detail-tab ${state.classDetailTab === "history" ? "active" : ""}" data-action="detail-tab" data-tab="history" type="button">Histórico <span>(${history.length})</span></button></div><div class="student-toolbar"><p>${state.classDetailTab === "students" ? countText : "Últimas 30 chamadas desta turma"}</p>${state.classDetailTab === "students" ? `<button class="button button-secondary button-compact" data-action="open-student-dialog" data-class-id="${escapeAttr(classItem.id)}" type="button">+ Cadastrar aluno</button>` : ""}</div>${content}</article>`;
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
    state.attendance = { classId, date, sessionTime: entry?.sessionTime || state.attendance.sessionTime || localTime(), records: structuredClone(entry?.records || {}), dirty: false };
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
  form.elements.classId.value = classId;
  form.elements.studentId.value = studentId;
  const student = (state.studentsByClass[classId] || []).find((item) => item.id === studentId);
  populateTerritoryZoneOptions(student?.territoryZoneId || student?.geo?.zoneId || "");
  if (student) {
    ui["student-dialog-title"].textContent = "Editar aluno";
    Object.entries(student).forEach(([key, value]) => {
      if (form.elements[key] && typeof value === "string") form.elements[key].value = value;
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
  const form = ui["student-form"];
  const postalCode = String(form.elements.postalCode?.value || "").replace(/\D/g, "");
  const helper = ui["postal-code-help"];
  if (postalCode.length !== 8) {
    helper.textContent = "Informe os 8 dígitos do CEP para receber uma sugestão de bairro.";
    return;
  }
  helper.textContent = "Consultando o CEP…";
  try {
    const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`);
    if (!response.ok) throw new Error("Consulta indisponível");
    const result = await response.json();
    if (result.erro) throw new Error("CEP não encontrado");
    const suggestions = { street: result.logradouro, neighborhood: result.bairro, city: result.localidade, state: result.uf };
    Object.entries(suggestions).forEach(([key, value]) => {
      if (value && form.elements[key] && !String(form.elements[key].value || "").trim()) form.elements[key].value = value;
    });
    form.elements.postalCode.value = formatPostalCode(postalCode);
    helper.textContent = result.bairro ? `Bairro sugerido: ${result.bairro}. Confira com a referência territorial antes de salvar.` : "CEP localizado, sem bairro informado pela fonte.";
  } catch (error) {
    helper.textContent = "Não foi possível consultar este CEP. Informe o bairro manualmente.";
  }
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
  async saveStudent(values) {
    const { classId, studentId, ...fields } = values;
    const payload = buildStudentPayload(fields, state.isDemo ? new Date().toISOString() : serverTimestamp());
    if (state.isDemo) {
      const data = demoData();
      const id = studentId || createId();
      data.students[classId] ||= {};
      data.students[classId][id] = { ...(data.students[classId][id] || {}), ...payload, createdAt: data.students[classId][id]?.createdAt || new Date().toISOString() };
      writeDemoData(data);
      if (state.selectedClassId === classId) observeSelectedStudents(classId); else state.studentsByClass[classId] = this.getDemoStudents(classId);
      return id;
    }
    const ref = studentId ? doc(firebase.db, "classes", classId, "students", studentId) : doc(collection(firebase.db, "classes", classId, "students"));
    await setDoc(ref, { ...payload, ...(studentId ? {} : { createdAt: serverTimestamp() }) }, { merge: Boolean(studentId) });
    return ref.id;
  },
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
    if (state.isDemo) {
      const data = demoData();
      data.students[classId] ||= {};
      rows.forEach((row) => {
        const id = row.enrollmentCode ? `m-${safeId(row.enrollmentCode)}` : createId();
        data.students[classId][id] = { ...(data.students[classId][id] || {}), ...buildStudentPayload(row, new Date().toISOString()), createdAt: data.students[classId][id]?.createdAt || new Date().toISOString() };
      });
      writeDemoData(data);
      if (state.selectedClassId === classId) observeSelectedStudents(classId);
      return;
    }
    // Firestore batch writes cap at 500. The interface limits each file to 400 rows.
    const batch = writeBatch(firebase.db);
    rows.forEach((row) => {
      const id = row.enrollmentCode ? `m-${safeId(row.enrollmentCode)}` : createId();
      batch.set(doc(firebase.db, "classes", classId, "students", id), { ...buildStudentPayload(row, serverTimestamp()), createdAt: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
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
  "fullName", "preferredName", "enrollmentCode", "birthDate", "gender",
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
  const requestedZoneId = fields.territoryZoneId || fields.geo?.zoneId || "";
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
      matchMethod: zone ? "manual-zone-selection" : (fields.geo?.matchMethod || "not-classified")
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
    matricula_codigo: "enrollmentCode", codigo_matricula: "enrollmentCode", matricula: "enrollmentCode",
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
    fullName: 120, preferredName: 120, enrollmentCode: 80, birthDate: 10, gender: 40, pcdStatus: 3, registrationDate: 10,
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
  const code = error?.code || "";
  const messages = {
    "auth/popup-closed-by-user": "A janela de acesso foi fechada antes da conclusão.",
    "auth/popup-blocked": "O navegador bloqueou a janela de acesso. Permita pop-ups e tente novamente.",
    "auth/unauthorized-domain": "Este domínio ainda não está autorizado no Firebase Authentication.",
    "auth/network-request-failed": "Não foi possível conectar ao Firebase. Verifique sua rede.",
    "auth/invalid-credential": "E-mail ou senha inválidos.",
    "auth/invalid-email": "Informe um e-mail válido.",
    "auth/email-already-in-use": "Este e-mail já possui uma conta.",
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
function currentAuthPassword() { return String(ui["auth-password"]?.value || "").trim(); }

async function signInWithEmailPassword(event) {
  event?.preventDefault?.();
  if (!firebase.auth) return;
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
  if (!firebase.auth) return;
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
  ui["profile-form"]?.addEventListener("submit", saveProfile);
  ui["class-form"]?.addEventListener("submit", saveClass);
  ui["student-form"]?.addEventListener("submit", saveStudent);
  ui["occurrence-form"]?.addEventListener("submit", saveOccurrence);
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
  document.addEventListener("click", handleDynamicClick);
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
    if (ui["google-sign-in"]) ui["google-sign-in"].disabled = true;
    ui["demo-sign-in"]?.classList.remove("hidden");
    finishLoading();
    showAuthScreen();
    return;
  }

  try {
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
  [ui["google-sign-in"], ui["email-sign-in"], ui["email-sign-up"]].forEach((button) => { if (button) button.disabled = busy; });
  if (ui["google-sign-in"]) ui["google-sign-in"].lastChild.textContent = busy ? "Abrindo acesso…" : "Entrar com Google (admin)";
  if (ui["email-sign-in"]) ui["email-sign-in"].textContent = busy ? "Entrando…" : "Entrar com e-mail";
  if (ui["email-sign-up"]) ui["email-sign-up"].textContent = busy ? "Criando…" : "Criar conta";
}

function setActiveView(view, { preserveScroll = false } = {}) {
  if (view === "admin" && !state.isAdmin) view = "dashboard";
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
  if (view === "territory") { renderTerritory(); renderTerritoryLinks(); }
  if (view === "occurrences") renderOccurrences();
  if (view === "modalities") renderModalities();
  if (view === "settings") renderSettings();
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
  const occurrenceQuery = state.isAdmin ? query(source, limit(80)) : query(source, where("teacherId", "==", state.user.uid), limit(80));
  state.unsubscribers.occurrences = onSnapshot(occurrenceQuery, (snapshot) => {
    state.occurrences = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => `${b.date || ""}T${b.time || "00:00"}`.localeCompare(`${a.date || ""}T${a.time || "00:00"}`));
    renderOccurrences();
    renderDashboard();
  }, (error) => console.error("Falha ao carregar ocorrências", error));
}

function afterClassesChanged() {
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

  const seen = new Set();
  Object.values(state.studentsByClass).flat().forEach((student) => {
    const key = [String(student.fullName || "").trim().toLocaleLowerCase("pt-BR"), student.birthDate || ""].join("|");
    if (key !== "|") seen.add(key);
  });
  const uniqueParticipants = seen.size;
  const activeClasses = state.classes.filter((item) => item.active !== false).length;
  const sports = new Set(state.classes.map((item) => item.sport).filter(Boolean)).size;
  const locations = new Set(state.classes.map((item) => item.location).filter(Boolean)).size;
  ui["dashboard-stats"].innerHTML = [
    ["Participantes identificados", uniqueParticipants || "—", "estimativa entre os cadastros carregados", "◉"],
    ["Matrículas carregadas", totalStudents || "—", "vínculos nas turmas acessíveis", "◎"],
    ["Turmas ativas", activeClasses, "turmas acessíveis", "◒"],
    ["Atividades", sports, "modalidades das turmas", "◆"],
    ["Locais", locations, "polos das turmas", "⌖"],
    ["Chamadas no mês", histories.length, "registros já salvos", "✓"],
    ["Presença no mês", marked ? `${rate}%` : "—", marked ? `${present} presença${present === 1 ? "" : "s"} marcada${present === 1 ? "" : "s"}` : "aguardando primeira chamada", "↗"],
    ["Faltas justificadas", justified || "—", justified ? "marcadas no período" : "sem justificativas salvas", "J"],
    ["Ocorrências do mês", monthOccurrences || "—", monthOccurrences ? "registros operacionais" : "nenhuma ocorrência", "⚑"],
    ["Na última chamada", latestAttendance ? latestPresent : "—", latestAttendance ? `${formatDate(latestAttendance.date)}${latestAttendance.sessionTime ? ` às ${latestAttendance.sessionTime}` : ""}` : "aguardando primeira chamada", "◉"]
  ].map(([label, value, note, icon]) => `<article class="panel stat-card"><div class="stat-label"><span>${label}</span><i class="stat-icon" aria-hidden="true">${icon}</i></div><strong>${value}</strong><small>${note}</small></article>`).join("");

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
  const classId = state.attendance.classId || state.selectedClassId || state.classes[0]?.id || "";
  const students = state.studentsByClass[classId] || [];
  const records = state.attendance.records || {};
  const marked = countMarked(records);
  ui["attendance-date"].value = state.attendance.date || localDate();
  ui["attendance-time"].value = state.attendance.sessionTime || localTime();
  if (classId) ui["attendance-class"].value = classId;
  ui["attendance-marked"].textContent = `${marked} / ${students.length}`;
  ui["attendance-progress"].style.width = students.length ? `${Math.round((marked / students.length) * 100)}%` : "0%";
  ui["attendance-save-state"].textContent = state.attendance.dirty ? "Alterações não salvas" : "Sem alterações";
  ui["attendance-save-state"].classList.toggle("changed", state.attendance.dirty);
  ui["save-attendance"].disabled = !classId || !students.length;
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
    const context = [student.enrollmentCode || "Sem código de matrícula", student.territoryZoneName || student.geo?.zoneLabel].filter(Boolean).join(" · ");
    return `<div class="attendance-row ${rowClass}"><div class="attendance-person"><span class="student-initial">${initials(student.preferredName || student.fullName)}</span><div><strong>${escapeHtml(student.preferredName || student.fullName || "Sem nome")}</strong><small>${escapeHtml(context)}</small></div></div><div class="attendance-note"><input data-attendance-note="${escapeAttr(student.id)}" value="${escapeAttr(record.note || "")}" maxlength="160" placeholder="${status === "J" ? "Justificativa obrigatória" : "Observação opcional"}" aria-label="Nota para ${escapeAttr(student.preferredName || student.fullName || "aluno")}" /></div><div class="attendance-actions"><button class="attendance-status present ${status === "P" ? "active" : ""}" data-action="set-attendance" data-id="${escapeAttr(student.id)}" data-status="P" type="button" aria-pressed="${status === "P"}">P</button><button class="attendance-status justified ${status === "J" ? "active" : ""}" data-action="set-attendance" data-id="${escapeAttr(student.id)}" data-status="J" type="button" aria-pressed="${status === "J"}">J</button><button class="attendance-status absent ${status === "F" ? "active" : ""}" data-action="set-attendance" data-id="${escapeAttr(student.id)}" data-status="F" type="button" aria-pressed="${status === "F"}">F</button></div></div>`;
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
  const students = state.studentsByClass[state.attendance.classId] || [];
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
  if (!classItem || !students.length) return;
  const marked = countMarked(state.attendance.records);
  if (!marked) {
    toast("Marque ao menos uma presença, justificativa ou falta antes de salvar.", "error");
    return;
  }
  const justifiedWithoutNote = Object.values(state.attendance.records).some((record) => record?.status === "J" && !String(record.note || "").trim());
  if (justifiedWithoutNote) {
    toast("Toda falta justificada precisa de uma descrição.", "error");
    return;
  }
  const records = cleanAttendanceRecords(state.attendance.records);
  const entry = {
    date,
    sessionTime: sessionTime || localTime(),
    classId,
    className: classItem.name || "",
    teacherId: classItem.teacherId || state.user.uid,
    teacherName: classItem.teacherName || state.profile?.displayName || state.user.displayName || "",
    records,
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
  state.classes.forEach((item) => {
    const sport = item.sport || "Modalidade não informada";
    const loc = item.location || "Núcleo sem nome";
    centers.add(loc);
    if (!groups.has(sport)) groups.set(sport, []);
    groups.get(sport).push(item);
  });
  const sorted = [...groups].sort((a,b) => a[0].localeCompare(b[0], "pt-BR"));
  const filtered = sorted.filter(([sport, rows]) => !q || [sport,...rows.map(r=>r.location),...rows.map(r=>r.name)].join(" ").toLocaleLowerCase("pt-BR").includes(q));
  const stats = [["Modalidades", sorted.length],["Núcleos distintos", centers.size],["Turmas", state.classes.length]];
  ui["modalities-stats"].innerHTML = stats.map(([name, val]) => `<article class="panel stat-card"><div class="stat-label"><span>${escapeHtml(name)}</span><i class="stat-icon">◆</i></div><strong>${val}</strong><small>registros disponíveis ao seu perfil</small></article>`).join("");
  ui["modalities-content"].innerHTML = filtered.length ? filtered.map(([name, rows]) => {
    const places = new Set(rows.map(r=>r.location).filter(Boolean));
    return `<article class="modality-card"><div class="modality-heading"><h4>${escapeHtml(name)}</h4><span class="pill">${rows.length} turma${rows.length === 1 ? "" : "s"} · ${places.size} núcleo${places.size === 1 ? "" : "s"}</span></div>${rows.map((item) => {
      const zone = state.territoryZones.find(z=>z.id === item.territoryZoneId);
      const zoneLabel = zone ? `${zone.name}${zone.sector ? ` · ${zone.sector}` : ""}` : "Setor não confirmado";
      return `<div class="modality-row"><div><strong>${escapeHtml(item.location || "Núcleo não informado")}</strong><small>${escapeHtml(item.name || "Turma")}${item.schedule ? ` · ${escapeHtml(item.schedule)}` : ""}</small><small>${escapeHtml(zoneLabel)}</small></div><button class="button button-secondary button-compact" type="button" data-action="open-attendance" data-id="${escapeAttr(item.id)}">Chamada</button></div>`;
    }).join("")}</article>`;
  }).join("") : `<div class="empty-state">Nenhuma modalidade encontrada para o filtro escolhido.</div>`;
}

function renderOccurrences() {
  if (!ui["occurrence-list"]) return;
  const rows = state.occurrences.filter((item) => state.occurrenceFilterClass === "all" || item.classId === state.occurrenceFilterClass);
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
  const visibleZones = filteredTerritoryZones(state.territoryZones);
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
  ui["admin-content"].innerHTML = `<div class="admin-stats"><article class="panel stat-card"><div class="stat-label"><span>Turmas no acesso</span><i class="stat-icon">◒</i></div><strong>${state.classes.length}</strong><small>todas as turmas autorizadas</small></article><article class="panel stat-card"><div class="stat-label"><span>Turmas ativas</span><i class="stat-icon">✓</i></div><strong>${active}</strong><small>disponíveis para chamada</small></article><article class="panel stat-card"><div class="stat-label"><span>Professores</span><i class="stat-icon">◉</i></div><strong>${teachers.length}</strong><small>contas identificadas</small></article></div><article class="panel admin-note"><strong>Gestão segura de acesso.</strong> Professores entram com e-mail/senha ou Google, mas somente os UIDs provisionados em <code>adminUsers</code> terão painel administrativo.</article><article class="panel" style="margin-top:16px;padding:20px;overflow:auto"><div class="panel-heading"><div><p class="eyebrow">TURMAS E RESPONSÁVEIS</p><h3>Reatribuição de turmas</h3></div><button class="button button-secondary button-compact" data-action="open-import" type="button">Abrir importação</button></div><p class="muted">Você pode associar uma turma a um professor mesmo depois que ele criar a conta.</p><table class="admin-table"><thead><tr><th>Turma</th><th>Modalidade</th><th>Professor atual</th><th>Alunos</th><th>Status</th><th>Nova associação</th></tr></thead><tbody>${state.classes.length ? state.classes.map((item) => `<tr><td>${escapeHtml(item.name || "Turma sem nome")}</td><td>${escapeHtml(item.sport || "—")}</td><td>${escapeHtml(item.teacherName || "—")}</td><td>${(state.studentsByClass[item.id] || []).length}</td><td>${item.active === false ? "Inativa" : "Ativa"}</td><td><div class="admin-assignment"><select id="teacher-select-${escapeAttr(item.id)}"><option value="">Selecione</option>${teacherOptions}</select><button class="row-action" data-action="assign-teacher" data-id="${escapeAttr(item.id)}" type="button">Salvar</button></div></td></tr>`).join("") : '<tr><td colspan="6">Nenhuma turma disponível.</td></tr>'}</tbody></table></article>`;
  state.classes.forEach((item) => {
    const select = document.getElementById(`teacher-select-${item.id}`);
    if (select) select.value = item.teacherId || "";
  });
}

function renderHelp() {
  ui["help-accordions"].innerHTML = HELP_ARTICLES.map((item, index) => `<details class="accordion" ${index === 0 ? "open" : ""}><summary>${escapeHtml(item.title)}</summary><div class="accordion-body"><p>${escapeHtml(item.body)}</p></div></details>`).join("");
}

function handleDynamicClick(event) {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const { action, id, classId, tab, status } = actionButton.dataset;
  if (action === "open-class-dialog") openClassDialog();
  if (action === "select-class") selectClass(id);
  if (action === "edit-class") openClassDialog(id);
  if (action === "delete-class-admin") deleteClassAsAdmin(id);
  if (action === "open-attendance") openAttendanceFor(id);
  if (action === "open-import") setActiveView("import");
  if (action === "open-import-for-class") {
    ui["import-class"].value = id;
    setActiveView("import");
    updateImportReadiness();
  }
  if (action === "open-student-dialog") openStudentDialog(classId);
  if (action === "edit-student") openStudentDialog(classId, id);
  if (action === "delete-student") deleteStudent(classId, id);
  if (action === "contact-whatsapp") contactStudent(classId, id, "whatsapp");
  if (action === "contact-call") contactStudent(classId, id, "call");
  if (action === "select-territory-zone") {
    state.selectedTerritoryZoneId = id === state.selectedTerritoryZoneId ? null : id;
    renderTerritory();
    renderTerritoryLinks();
  }
  if (action === "detail-tab") { state.classDetailTab = tab; renderClasses(); }
  if (action === "set-attendance") updateAttendanceStatus(id, status);
  if (action === "assign-teacher") assignTeacherToClass(id);
}

function handleDynamicInput(event) {
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
  if (event.target.name === "territoryZoneId" && event.target.form === ui["student-form"]) syncTerritoryFields(ui["student-form"]);
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
