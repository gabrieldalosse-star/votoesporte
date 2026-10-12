import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
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

const DEMO_STORE_KEY = "votorantim-esporte-chamada-demo-v1";
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
  territoryZones: [],
  selectedTerritoryZoneId: null,
  selectedClassId: null,
  classDetailTab: "students",
  studentsByClass: {},
  histories: {},
  attendance: { classId: "", date: localDate(), records: {}, dirty: false },
  report: null,
  importRows: [],
  activeView: "dashboard",
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

async function bootstrap() {
  wireStaticEvents();
  ui["attendance-date"].value = state.attendance.date;
  ui["report-month"].value = localMonth();
  renderHelp();

  const configured = isFirebaseConfigured(window.FIREBASE_CONFIG);
  if (!configured) {
    ui["firebase-setup-card"].classList.remove("hidden");
    ui["google-sign-in"].disabled = true;
    ui["demo-sign-in"].classList.remove("hidden");
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
    ui["firebase-setup-card"].classList.remove("hidden");
    ui["demo-sign-in"].classList.remove("hidden");
    showAuthMessage("Não foi possível iniciar o Firebase. Revise firebase-config.js.");
    finishLoading();
  }
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
  state.user = {
    uid: firebaseUser.uid,
    email: firebaseUser.email || "",
    displayName: firebaseUser.displayName || "",
    photoURL: firebaseUser.photoURL || ""
  };
  await prepareWorkspace();
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

async function prepareWorkspace() {
  try {
    finishLoading();
    state.profile = await repository.getProfile();
    state.isAdmin = state.isDemo || (!state.isDemo && (await repository.isAdmin()));
    state.profile ||= null;

    ui["auth-screen"].classList.add("hidden");
    ui.workspace.classList.remove("hidden");
    ui["mode-badge"].classList.toggle("hidden", !state.isDemo);
    ui["admin-nav"].classList.toggle("hidden", !state.isAdmin);
    ui["open-territory-import"].classList.toggle("hidden", !state.isAdmin);
    updateProfileUi();
    setActiveView("dashboard", { preserveScroll: true });
    subscribeClasses();
    subscribeTerritoryZones();

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

function finishLoading() {
  ui["loading-screen"].classList.add("hidden");
}

function showAuthScreen() {
  ui.workspace.classList.add("hidden");
  ui["auth-screen"].classList.remove("hidden");
}

function clearWorkspaceState() {
  stopSubscriptions();
  state.profile = null;
  state.user = null;
  state.classes = [];
  state.territoryZones = [];
  state.studentsByClass = {};
  state.histories = {};
  state.selectedClassId = null;
  state.report = null;
}

function wireStaticEvents() {
  ui["google-sign-in"].addEventListener("click", signInWithGoogle);
  ui["demo-sign-in"].addEventListener("click", startDemo);
  ui["mobile-menu"].addEventListener("click", () => ui.sidebar.classList.toggle("open"));
  ui["profile-menu"].addEventListener("click", () => {
    const open = ui["profile-popover"].classList.toggle("hidden");
    ui["profile-menu"].setAttribute("aria-expanded", String(!open));
  });
  ui["edit-profile"].addEventListener("click", () => {
    ui["profile-popover"].classList.add("hidden");
    openProfileDialog();
  });
  ui["sign-out"].addEventListener("click", signOutUser);
  ui["quick-attendance"].addEventListener("click", () => openAttendanceFor(state.selectedClassId || state.classes[0]?.id));
  ui["dashboard-add-class"].addEventListener("click", () => openClassDialog());
  ui["add-class"].addEventListener("click", () => openClassDialog());
  ui["save-attendance"].addEventListener("click", saveAttendance);
  ui["mark-all-present"].addEventListener("click", markAllPresent);
  ui["clear-attendance"].addEventListener("click", clearAttendance);
  ui["attendance-class"].addEventListener("change", onAttendanceFilterChange);
  ui["attendance-date"].addEventListener("change", onAttendanceFilterChange);
  ui["generate-report"].addEventListener("click", generateReport);
  ui["export-csv"].addEventListener("click", exportReportCsv);
  ui["print-report"].addEventListener("click", printReport);
  ui["import-file"].addEventListener("change", handleCsvFile);
  ui["confirm-import"].addEventListener("click", importStudents);
  ui["open-territory-import"].addEventListener("click", openTerritoryImportDialog);
  ui["territory-import-form"].addEventListener("submit", importTerritoryZones);
  ui["start-tour"].addEventListener("click", startTour);
  ui["tour-back"].addEventListener("click", () => advanceTour(-1));
  ui["tour-next"].addEventListener("click", () => advanceTour(1));

  ui["profile-form"].addEventListener("submit", saveProfile);
  ui["class-form"].addEventListener("submit", saveClass);
  ui["student-form"].addEventListener("submit", saveStudent);

  $$("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setActiveView(button.dataset.view));
  });
  $$('[data-close-dialog]').forEach((button) => {
    button.addEventListener("click", () => closeDialog(button.dataset.closeDialog));
  });

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
    }
  });
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

function setAuthBusy(busy) {
  ui["google-sign-in"].disabled = busy;
  ui["google-sign-in"].lastChild.textContent = busy ? "Abrindo acesso…" : "Continuar com Google";
}

function showAuthMessage(message) {
  ui["auth-message"].textContent = message || "";
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
  if (view === "territory") renderTerritory();
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
    state.territoryZones = repository.getDemoTerritoryZones();
    afterTerritoryZonesChanged();
    return;
  }

  state.unsubscribers.territoryZones = onSnapshot(
    query(collection(firebase.db, "territoryZones"), orderBy("name")),
    (snapshot) => {
      state.territoryZones = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
      afterTerritoryZonesChanged();
    },
    (error) => toast(friendlyFirebaseError(error), "error")
  );
}

function afterTerritoryZonesChanged() {
  populateTerritoryZoneOptions();
  renderTerritory();
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

function syncTerritoryFields(form) {
  const zoneId = form.elements.territoryZoneId?.value || "";
  const zone = state.territoryZones.find((item) => item.id === zoneId);
  if (!zone) return;
  form.elements.territoryZoneName.value = zone.name || "";
  form.elements.territorySector.value = zone.sector || "";
  form.elements.territorySource.value = zone.sourceVersion || "";
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

function renderTerritory() {
  if (!ui["territory-summary"]) return;
  const zones = state.territoryZones;
  const counts = territoryStudentsByZone();
  const classified = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const loaded = loadedStudents().length;
  const sourceLabels = [...new Set(zones.map((zone) => zone.sourceVersion).filter(Boolean))];
  ui["territory-summary"].innerHTML = [
    ["Zonas aprovadas", zones.length, zones.length ? "na camada atual" : "aguardando importação"],
    ["Cadastros classificados", classified, loaded ? `de ${loaded} aluno${loaded === 1 ? "" : "s"} carregado${loaded === 1 ? "" : "s"}` : "nenhum aluno carregado"],
    ["Fonte territorial", sourceLabels.length ? "Validar" : "Pendente", sourceLabels.length ? "verifique versão e licença" : "sem geometria publicada"]
  ].map(([label, value, note]) => `<article class="panel stat-card territory-stat"><div class="stat-label"><span>${escapeHtml(String(label))}</span><i class="stat-icon" aria-hidden="true">⌖</i></div><strong>${escapeHtml(String(value))}</strong><small>${escapeHtml(String(note))}</small></article>`).join("");
  ui["territory-layer-status"].textContent = zones.length ? `${zones.length} zona${zones.length === 1 ? "" : "s"}` : "Sem camada";
  ui["territory-layer-status"].classList.toggle("inactive", !zones.length);
  ui["territory-map"].innerHTML = renderTerritoryMap(zones, counts);
  ui["territory-zone-list"].innerHTML = zones.length ? zones.map((zone) => {
    const count = counts[zone.id] || 0;
    const selected = zone.id === state.selectedTerritoryZoneId;
    return `<button class="territory-zone-row ${selected ? "selected" : ""}" data-action="select-territory-zone" data-id="${escapeAttr(zone.id)}" type="button"><span class="zone-swatch" aria-hidden="true"></span><span><strong>${escapeHtml(zone.name || "Zona sem nome")}</strong><small>${escapeHtml(zone.sector || "Setor não informado")}</small></span><b>${count}</b></button>`;
  }).join("") : `<div class="territory-empty"><span aria-hidden="true">⌖</span><strong>Camada ainda não importada</strong><p>${state.isAdmin ? "Use o botão acima para importar um GeoJSON aprovado." : "Peça à gestão a importação de uma camada aprovada."}</p></div>`;
}

function renderTerritoryMap(zones, counts) {
  const drawable = zones.filter((zone) => geometryPoints(zone.geometry).length);
  if (!zones.length) return `<div class="territory-map-empty"><span aria-hidden="true">⌖</span><h4>Mapa aguardando camada oficial</h4><p>O modelo GeoJSON está pronto. Nenhum limite de bairro ou setor foi inventado nesta plataforma.</p></div>`;
  if (!drawable.length) return `<div class="territory-map-empty"><span aria-hidden="true">◫</span><h4>Camada sem geometria desenhável</h4><p>Confira se o GeoJSON usa polígonos em latitude e longitude (EPSG:4326).</p></div>`;
  const bounds = geometryBounds(drawable.map((zone) => zone.geometry));
  const paths = drawable.map((zone, index) => {
    const selected = zone.id === state.selectedTerritoryZoneId;
    const count = counts[zone.id] || 0;
    return `<path class="territory-shape ${selected ? "selected" : ""}" data-action="select-territory-zone" data-id="${escapeAttr(zone.id)}" data-count="${count}" style="--zone-index:${index}" d="${geoPath(zone.geometry, bounds)}" tabindex="0" role="button" aria-label="Selecionar ${escapeAttr(zone.name || "zona")}, ${count} cadastro${count === 1 ? "" : "s"} carregado${count === 1 ? "" : "s"}"><title>${escapeHtml(`${zone.name || "Zona"} · ${count} cadastro${count === 1 ? "" : "s"}`)}</title></path>`;
  }).join("");
  return `<svg class="territory-svg" viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid meet" aria-label="Mapa de zonas com ${drawable.length} polígonos"><rect class="territory-map-background" width="1000" height="620" rx="28"></rect><path class="territory-contour" d="M-40 510C180 390 290 600 492 440S811 220 1050 300"/><path class="territory-contour" d="M-20 170C170 280 298 120 465 205s348 168 568-28"/>${paths}</svg>`;
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
  renderTerritory();
  if (state.attendance.classId) renderAttendance();
}

function stopSubscriptions() {
  Object.values(state.unsubscribers).forEach((unsubscribe) => unsubscribe?.());
  state.unsubscribers = { classes: null, selectedStudents: null, territoryZones: null };
  state.selectedStudentsSubscriptionId = null;
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
      renderTerritory();
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

function refreshClassSelectors() {
  const labels = state.classes.map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name || "Turma sem nome")}</option>`).join("");
  const selects = [ui["attendance-class"], ui["import-class"]];
  selects.forEach((select) => {
    const prior = select.value;
    select.innerHTML = state.classes.length ? `<option value="">Selecionar turma</option>${labels}` : `<option value="">Nenhuma turma cadastrada</option>`;
    select.value = state.classes.some((item) => item.id === prior) ? prior : "";
    select.disabled = !state.classes.length;
  });

  const reportPrior = ui["report-class"].value;
  ui["report-class"].innerHTML = `<option value="all">${state.isAdmin ? "Todas as turmas acessíveis" : "Todas as minhas turmas"}</option>${labels}`;
  ui["report-class"].value = state.classes.some((item) => item.id === reportPrior) || reportPrior === "all" ? reportPrior : "all";

  if (!state.attendance.classId && state.classes.length) {
    state.attendance.classId = state.selectedClassId || state.classes[0].id;
  }
  if (state.attendance.classId && state.classes.some((item) => item.id === state.attendance.classId)) {
    ui["attendance-class"].value = state.attendance.classId;
  }
}

function updateProfileUi() {
  const displayName = state.profile?.displayName || state.user?.displayName || "Perfil";
  ui["profile-name"].textContent = displayName;
  ui["profile-avatar"].textContent = initials(displayName);
  ui["dashboard-subtitle"].textContent = state.profile
    ? `Olá, ${displayName.split(" ")[0] || displayName}. Veja suas turmas e a presença do período.`
    : "Confirme seu perfil profissional para começar a organizar suas turmas.";
}

function renderDashboard() {
  const totalStudents = Object.values(state.studentsByClass).reduce((sum, list) => sum + list.length, 0);
  const currentMonth = localMonth();
  const histories = Object.values(state.histories).flat().filter((entry) => entry.date?.startsWith(currentMonth));
  const marked = histories.reduce((sum, entry) => sum + Number(entry.markedCount || countMarked(entry.records)), 0);
  const present = histories.reduce((sum, entry) => sum + Number(entry.presentCount || countPresent(entry.records)), 0);
  const rate = marked ? Math.round((present / marked) * 100) : 0;

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
    ["Presença no mês", marked ? `${rate}%` : "—", marked ? `${present} presença${present === 1 ? "" : "s"} marcada${present === 1 ? "" : "s"}` : "aguardando primeira chamada", "↗"]
  ].map(([label, value, note, icon]) => `<article class="panel stat-card"><div class="stat-label"><span>${label}</span><i class="stat-icon" aria-hidden="true">${icon}</i></div><strong>${value}</strong><small>${note}</small></article>`).join("");

  if (!state.classes.length) {
    ui["today-classes"].innerHTML = emptyInline("Nenhuma turma cadastrada", "Cadastre sua primeira turma para criar listas e chamadas.", "Cadastrar turma", "open-class-dialog");
  } else {
    ui["today-classes"].innerHTML = state.classes.slice(0, 4).map((item) => `
      <div class="today-item">
        <div><h4>${escapeHtml(item.name || "Turma sem nome")}</h4><p>${escapeHtml([item.sport, item.schedule].filter(Boolean).join(" · ") || "Sem horário informado")}</p></div>
        <button class="button button-secondary" data-action="open-attendance" data-id="${escapeAttr(item.id)}" type="button">Chamar</button>
      </div>`).join("");
  }

  const progressSource = state.classes.map((item) => {
    const entries = (state.histories[item.id] || []).filter((entry) => entry.date?.startsWith(currentMonth));
    const entryMarked = entries.reduce((sum, entry) => sum + Number(entry.markedCount || countMarked(entry.records)), 0);
    const entryPresent = entries.reduce((sum, entry) => sum + Number(entry.presentCount || countPresent(entry.records)), 0);
    return { item, rate: entryMarked ? Math.round((entryPresent / entryMarked) * 100) : null, entries: entries.length };
  }).filter((row) => row.rate !== null);

  ui["dashboard-progress"].innerHTML = progressSource.length
    ? `<div class="progress-list">${progressSource.slice(0, 5).map((row) => `<div class="progress-item"><strong>${escapeHtml(row.item.name || "Turma")}</strong><span>${row.rate}%</span><div class="progress-track"><i style="width:${row.rate}%"></i></div></div>`).join("")}</div>`
    : "Ainda não há chamadas concluídas neste período.";
}

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

function isContactAllowed(permission, channel) {
  if (channel === "whatsapp") return ["whatsapp", "both"].includes(permission);
  return ["call", "both"].includes(permission);
}

function renderContactActions(student, classId) {
  const contact = getStudentContact(student);
  const whatsAppDisabled = !contact.phone || !isContactAllowed(contact.permission, "whatsapp");
  const callDisabled = !contact.phone || !isContactAllowed(contact.permission, "call");
  return `<div class="contact-actions"><button class="contact-action whatsapp" data-action="contact-whatsapp" data-id="${escapeAttr(student.id)}" data-class-id="${escapeAttr(classId)}" type="button" ${whatsAppDisabled ? "disabled" : ""} aria-label="Abrir WhatsApp de ${escapeAttr(contact.label)}">WhatsApp</button><button class="contact-action call" data-action="contact-call" data-id="${escapeAttr(student.id)}" data-class-id="${escapeAttr(classId)}" type="button" ${callDisabled ? "disabled" : ""} aria-label="Ligar para ${escapeAttr(contact.label)}">Ligar</button></div>`;
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
      <tr><td><div class="student-name"><span class="student-initial">${initials(student.preferredName || student.fullName)}</span><span>${escapeHtml(student.preferredName || student.fullName || "Sem nome")}</span></div></td><td>${escapeHtml(student.enrollmentCode || "—")}</td><td>${escapeHtml(student.guardianName || "—")}</td><td>${renderTerritoryPill(student)}</td><td><span class="pill">${escapeHtml(student.enrollmentStatus || "Ativa")}</span></td><td>${renderContactActions(student, classItem.id)}</td><td><div class="row-actions"><button class="row-action" data-action="edit-student" data-id="${escapeAttr(student.id)}" data-class-id="${escapeAttr(classItem.id)}" type="button">Editar</button><button class="row-action danger" data-action="delete-student" data-id="${escapeAttr(student.id)}" data-class-id="${escapeAttr(classItem.id)}" type="button">Excluir</button></div></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty-state"><span aria-hidden="true">+</span><h3>Lista vazia, por enquanto</h3><p>Cadastre um aluno por vez ou importe uma planilha CSV revisada.</p><button class="button button-secondary" data-action="open-student-dialog" data-class-id="${escapeAttr(classItem.id)}" type="button">Cadastrar aluno</button></div>`;
  const historyContent = history.length ? `<div class="history-list">${history.map((entry) => {
    const marked = Number(entry.markedCount || countMarked(entry.records));
    const present = Number(entry.presentCount || countPresent(entry.records));
    const rate = marked ? Math.round((present / marked) * 100) : 0;
    return `<div class="history-row"><div><strong>${formatDate(entry.date)}</strong><small>${marked} marcação${marked === 1 ? "" : "ões"}</small></div><span class="pill">${present} presença${present === 1 ? "" : "s"}</span><span class="history-rate">${marked ? `${rate}%` : "—"}</span></div>`;
  }).join("")}</div>` : `<div class="empty-state"><span aria-hidden="true">✓</span><h3>Ainda não há histórico</h3><p>A primeira chamada salva aparecerá aqui, com data e percentual de presença.</p><button class="button button-secondary" data-action="open-attendance" data-id="${escapeAttr(classItem.id)}" type="button">Fazer chamada</button></div>`;
  const content = state.classDetailTab === "history" ? historyContent : studentContent;
  const countText = students.length ? `${students.length} aluno${students.length === 1 ? "" : "s"} carregado${students.length === 1 ? "" : "s"}` : "Sem alunos cadastrados";
  return `<article class="panel class-detail"><div class="class-detail-header"><div><h3>${escapeHtml(classItem.name || "Turma sem nome")}</h3><p>${escapeHtml([classItem.sport, classItem.ageGroup, classItem.location, classItem.schedule].filter(Boolean).join(" · ") || "Complete os dados operacionais da turma.")}</p></div><div class="class-detail-actions"><button class="button button-ghost button-compact" data-action="edit-class" data-id="${escapeAttr(classItem.id)}" type="button">Editar turma</button><button class="button button-primary button-compact" data-action="open-attendance" data-id="${escapeAttr(classItem.id)}" type="button">Fazer chamada</button></div></div><div class="class-detail-tabs"><button class="detail-tab ${state.classDetailTab === "students" ? "active" : ""}" data-action="detail-tab" data-tab="students" type="button">Alunos <span>(${students.length})</span></button><button class="detail-tab ${state.classDetailTab === "history" ? "active" : ""}" data-action="detail-tab" data-tab="history" type="button">Histórico <span>(${history.length})</span></button></div><div class="student-toolbar"><p>${state.classDetailTab === "students" ? countText : "Últimas 30 chamadas desta turma"}</p>${state.classDetailTab === "students" ? `<button class="button button-secondary button-compact" data-action="open-student-dialog" data-class-id="${escapeAttr(classItem.id)}" type="button">+ Cadastrar aluno</button>` : ""}</div>${content}</article>`;
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
    state.attendance = { classId, date, records: structuredClone(entry?.records || {}), dirty: false };
    renderAttendance();
  } catch (error) {
    toast(friendlyFirebaseError(error), "error");
  }
}

function renderAttendance() {
  const { classId, records } = state.attendance;
  const students = state.studentsByClass[classId] || [];
  ui["attendance-date"].value = state.attendance.date || localDate();
  if (classId) ui["attendance-class"].value = classId;
  const marked = countMarked(records);
  ui["attendance-marked"].textContent = `${marked} / ${students.length}`;
  ui["attendance-progress"].style.width = students.length ? `${Math.round((marked / students.length) * 100)}%` : "0%";
  ui["attendance-save-state"].textContent = state.attendance.dirty ? "Alterações não salvas" : "Sem alterações";
  ui["attendance-save-state"].classList.toggle("changed", state.attendance.dirty);
  ui["save-attendance"].disabled = !classId || !students.length;
  ui["mark-all-present"].disabled = !students.length;
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
  ui["attendance-helper"].textContent = students.length ? "Use P para presença e F para falta. Notas são opcionais." : "Esta turma ainda não tem alunos cadastrados.";
  ui["attendance-list"].innerHTML = students.length ? students.map((student) => {
    const record = records[student.id] || {};
    const status = record.status || "";
    const rowClass = status === "P" ? "has-present" : status === "F" ? "has-absent" : "";
    const context = [student.enrollmentCode || "Sem código de matrícula", student.territoryZoneName || student.geo?.zoneLabel].filter(Boolean).join(" · ");
    return `<div class="attendance-row ${rowClass}"><div class="attendance-person"><span class="student-initial">${initials(student.preferredName || student.fullName)}</span><div><strong>${escapeHtml(student.preferredName || student.fullName || "Sem nome")}</strong><small>${escapeHtml(context)}</small></div></div><div class="attendance-note"><input data-attendance-note="${escapeAttr(student.id)}" value="${escapeAttr(record.note || "")}" maxlength="160" placeholder="Nota opcional" aria-label="Nota para ${escapeAttr(student.preferredName || student.fullName || "aluno")}" /></div><div class="attendance-actions"><button class="attendance-status present ${status === "P" ? "active" : ""}" data-action="set-attendance" data-id="${escapeAttr(student.id)}" data-status="P" type="button" aria-pressed="${status === "P"}">P</button><button class="attendance-status absent ${status === "F" ? "active" : ""}" data-action="set-attendance" data-id="${escapeAttr(student.id)}" data-status="F" type="button" aria-pressed="${status === "F"}">F</button></div></div>`;
  }).join("") : `<div class="empty-state"><span aria-hidden="true">+</span><h3>Inclua alunos nesta turma</h3><p>Sem alunos não é possível registrar uma chamada.</p><button class="button button-secondary" data-action="open-student-dialog" data-class-id="${escapeAttr(classId)}" type="button">Cadastrar aluno</button></div>`;
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
  const { classId, date } = state.attendance;
  const classItem = state.classes.find((item) => item.id === classId);
  const students = state.studentsByClass[classId] || [];
  if (!classItem || !students.length) return;
  const marked = countMarked(state.attendance.records);
  if (!marked) {
    toast("Marque ao menos uma presença ou falta antes de salvar.", "error");
    return;
  }
  const records = cleanAttendanceRecords(state.attendance.records);
  const entry = {
    date,
    classId,
    className: classItem.name || "",
    teacherId: classItem.teacherId || state.user.uid,
    teacherName: state.profile?.displayName || state.user.displayName || "",
    records,
    markedCount: countMarked(records),
    presentCount: countPresent(records),
    absentCount: countAbsent(records),
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
    renderDashboard();
  } catch (error) {
    toast(friendlyFirebaseError(error), "error");
  } finally {
    button.textContent = "Salvar chamada";
    renderAttendance();
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
  if (item) {
    ui["class-dialog-title"].textContent = "Editar turma";
    ["name", "sport", "ageGroup", "location", "schedule", "notes"].forEach((key) => { form.elements[key].value = item[key] || ""; });
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
  if (values.birthDate && !ageAtEndOf2026(values.birthDate)) {
    setFormMessage("student-form-message", "Confira a data de nascimento: informe uma data válida até 2026.");
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

async function deleteStudent(classId, studentId) {
  const student = (state.studentsByClass[classId] || []).find((row) => row.id === studentId);
  if (!student) return;
  const confirmed = window.confirm(`Excluir o cadastro de ${student.preferredName || student.fullName || "este aluno"}? As chamadas já gravadas não serão apagadas.`);
  if (!confirmed) return;
  try {
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
    if (JSON.stringify(geometry).length > 750000) throw new Error(`A geometria da zona “${name}” é grande demais para um documento Firestore.`);
    let id = `zone-${safeId(name)}`;
    let suffix = 2;
    while (seen.has(id)) { id = `zone-${safeId(name)}-${suffix}`; suffix += 1; }
    seen.add(id);
    return {
      id,
      name: name.slice(0, 120),
      sector: sector.slice(0, 100),
      sourceVersion: String(values.sourceVersion).trim().slice(0, 180),
      geometry,
      geometryType: geometry.type,
      importedFrom: "geojson-approved",
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

async function buildReport(month, classes, mode = "month") {
  const { start, end } = mode === "week" ? isoWeekBounds(month) : monthBounds(month);
  const classReports = [];
  const individualRows = [];
  const territory = new Map();
  let totalMarked = 0;
  let totalPresent = 0;
  let sessions = 0;

  for (const classItem of classes) {
    const students = await loadStudents(classItem.id);
    const attendance = await repository.getAttendanceRange(classItem.id, start, end);
    const roster = new Map(students.map((student) => [student.id, student]));
    const stats = new Map(students.map((student) => [student.id, { student, marked: 0, present: 0, absent: 0, sessions: [] }]));
    attendance.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    attendance.forEach((entry) => {
      const records = entry.records || {};
      Object.entries(records).forEach(([studentId, record]) => {
        if (!["P", "F"].includes(record?.status)) return;
        if (!stats.has(studentId)) {
          stats.set(studentId, { student: roster.get(studentId) || { id: studentId, fullName: "Registro sem cadastro atual" }, marked: 0, present: 0, absent: 0, sessions: [] });
        }
        const row = stats.get(studentId);
        row.marked += 1;
        row.present += record.status === "P" ? 1 : 0;
        row.absent += record.status === "F" ? 1 : 0;
        row.sessions.push({ date: entry.date, status: record.status });
      });
    });
    const classMarked = [...stats.values()].reduce((sum, row) => sum + row.marked, 0);
    const classPresent = [...stats.values()].reduce((sum, row) => sum + row.present, 0);
    totalMarked += classMarked;
    totalPresent += classPresent;
    sessions += attendance.length;
    classReports.push({ classItem, attendance, students, marked: classMarked, present: classPresent, rate: classMarked ? Math.round((classPresent / classMarked) * 100) : null });
    stats.forEach((row) => {
      if (!row.marked) return;
      individualRows.push({
        className: classItem.name || "Turma sem nome",
        teacherName: classItem.teacherName || "",
        student: row.student,
        marked: row.marked,
        present: row.present,
        absent: row.absent,
        rate: Math.round((row.present / row.marked) * 100),
        trend: calculateTrend(row.sessions)
      });
      const zoneLabel = row.student.territoryZoneName || row.student.geo?.zoneLabel || "";
      if (zoneLabel) {
        const zone = territory.get(zoneLabel) || { label: zoneLabel, sector: row.student.territorySector || row.student.geo?.sector || "", students: new Set(), marked: 0, present: 0, absent: 0 };
        zone.students.add(row.student.id);
        zone.marked += row.marked;
        zone.present += row.present;
        zone.absent += row.absent;
        territory.set(zoneLabel, zone);
      }
    });
  }
  individualRows.sort((a, b) => a.rate - b.rate || String(a.student.fullName).localeCompare(String(b.student.fullName), "pt-BR"));
  const teachers = new Map();
  classReports.forEach((row) => {
    const key = row.classItem.teacherId || "sem-responsavel";
    const current = teachers.get(key) || { name: row.classItem.teacherName || "Professor não identificado", classes: 0, sessions: 0, marked: 0, present: 0 };
    current.classes += 1;
    current.sessions += row.attendance.length;
    current.marked += row.marked;
    current.present += row.present;
    teachers.set(key, current);
  });
  const teacherReports = [...teachers.values()].map((row) => ({ ...row, rate: row.marked ? Math.round((row.present / row.marked) * 100) : null })).sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
  const territoryReports = [...territory.values()]
    .filter((row) => row.students.size >= 5)
    .map((row) => ({ ...row, students: row.students.size, rate: row.marked ? Math.round((row.present / row.marked) * 100) : null }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label), "pt-BR"));
  return { month, mode, start, end, classes, classReports, teacherReports, territoryReports, individualRows, totalMarked, totalPresent, sessions, rate: totalMarked ? Math.round((totalPresent / totalMarked) * 100) : 0, generatedAt: new Date() };
}

function renderReport() {
  const report = state.report;
  if (!report) return;
  ui["report-empty"].classList.add("hidden");
  ui["report-content"].classList.remove("hidden");
  const period = report.mode === "week" ? `Semana ${report.month.slice(6)} de ${report.month.slice(0,4)} (${report.start} a ${report.end})` : formatMonth(report.month);
  const participantCount = report.individualRows.length;
  const classSummary = report.classReports.map((row) => `
    <div class="class-report-row"><div><strong>${escapeHtml(row.classItem.name || "Turma")}</strong><small>${row.attendance.length} chamada${row.attendance.length === 1 ? "" : "s"} · ${row.marked} marcação${row.marked === 1 ? "" : "ões"}</small></div><span>${row.rate === null ? "—" : `${row.rate}%`}</span><div class="progress-track"><i style="width:${row.rate || 0}%"></i></div></div>`).join("") || `<p>Nenhuma turma com dados no período.</p>`;
  const individual = report.individualRows.length ? report.individualRows.map((row) => {
    const trendClass = row.trend.value > 0 ? "trend-positive" : row.trend.value < 0 ? "trend-negative" : "trend-neutral";
    return `<tr><td>${escapeHtml(row.student.preferredName || row.student.fullName || "Registro sem cadastro")}</td><td>${escapeHtml(row.className)}</td><td>${row.present}</td><td>${row.absent}</td><td><strong>${row.rate}%</strong></td><td class="${trendClass}">${escapeHtml(row.trend.label)}</td></tr>`;
  }).join("") : `<tr><td colspan="6">Nenhuma presença ou falta marcada neste período.</td></tr>`;
  const teachers = report.teacherReports.map((row) => `<div class="teacher-report-row"><div><strong>${escapeHtml(row.name)}</strong><small>${row.classes} turma${row.classes === 1 ? "" : "s"} · ${row.sessions} chamada${row.sessions === 1 ? "" : "s"}</small></div><span>${row.rate === null ? "—" : `${row.rate}%`}</span></div>`).join("") || "<p>Nenhum responsável encontrado no escopo.</p>";
  const territory = report.territoryReports.map((row) => `<div class="territory-report-row"><div><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.sector || "Setor não informado")} · ${row.students} alunos com marcações</small></div><span>${row.rate === null ? "—" : `${row.rate}%`}</span><div class="progress-track"><i style="width:${row.rate || 0}%"></i></div></div>`).join("") || "<p>O painel territorial mostra somente zonas com pelo menos 5 alunos com marcações no período.</p>";
  ui["report-content"].innerHTML = `
    <section class="report-header"><div><p class="eyebrow">RELATÓRIO DE PRESENÇA</p><h3>${escapeHtml(period)}</h3><p>${report.classes.length} turma${report.classes.length === 1 ? "" : "s"} no escopo · acesso ${state.isAdmin ? "administrativo" : "do professor"}</p></div><p class="report-generated">Gerado em ${formatDateTime(report.generatedAt)}<br/>Votorantim · Rede Esportiva</p></section>
    <section class="report-stat-grid"><article class="report-stat"><span>Presença geral</span><strong>${report.totalMarked ? `${report.rate}%` : "—"}</strong></article><article class="report-stat"><span>Presenças</span><strong>${report.totalPresent}</strong></article><article class="report-stat"><span>Faltas</span><strong>${report.totalMarked - report.totalPresent}</strong></article><article class="report-stat"><span>Chamadas</span><strong>${report.sessions}</strong></article></section>
    <section class="report-grid"><article class="panel"><h3>Visão por turma</h3><p>Percentual calculado apenas sobre marcações P e F efetivamente salvas.</p><div class="class-report-list">${classSummary}</div></article><article class="panel"><h3>Evolução individual</h3><p>${participantCount ? "Tendência compara as metades do mês quando há registros suficientes." : "Os indicadores individuais aparecerão após as chamadas."}</p><div class="individual-report-wrap"><table class="individual-report"><thead><tr><th>Aluno</th><th>Turma</th><th>P</th><th>F</th><th>Presença</th><th>Tendência</th></tr></thead><tbody>${individual}</tbody></table></div></article></section><section class="report-grid"><article class="panel teacher-report"><h3>Visão por professor</h3><p>Consolidado das turmas incluídas neste relatório. Para um professor, este bloco confirma o próprio escopo.</p><div class="teacher-report-list">${teachers}</div></article><article class="panel territory-report"><h3>Frequência por zona</h3><p>Resumo agregado, sem endereços e com mínimo de 5 alunos com marcações.</p><div class="territory-report-list">${territory}</div></article></section>`;
}

function exportReportCsv() {
  const report = state.report;
  if (!report) {
    toast("Gere um relatório antes de exportar.", "error");
    return;
  }
  const lines = [
    ["periodo", "professor", "turma", "aluno", "zona_territorial", "setor_territorial", "presencas", "faltas", "marcacoes", "percentual_presenca", "tendencia"],
    ...report.individualRows.map((row) => [report.month, row.teacherName, row.className, row.student.preferredName || row.student.fullName || "", row.student.territoryZoneName || row.student.geo?.zoneLabel || "", row.student.territorySector || row.student.geo?.sector || "", row.present, row.absent, row.marked, `${row.rate}%`, row.trend.label])
  ];
  const csv = "\uFEFF" + lines.map((line) => line.map(csvCell).join(";")).join("\n");
  downloadBlob(csv, `relatorio-presenca-${report.mode || "mes"}-${report.month}.csv`, "text/csv;charset=utf-8");
  toast("CSV preparado para download.");
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
    if (!normalized.length) throw new Error("Não encontramos linhas válidas com nome_completo.");
    if (normalized.length > 400) throw new Error("Importe no máximo 400 alunos por arquivo para revisar com segurança.");
    state.importRows = normalized;
    ui["confirm-import"].disabled = false;
    ui["import-summary"].textContent = `${normalized.length} aluno${normalized.length === 1 ? "" : "s"} pronto${normalized.length === 1 ? "" : "s"} para revisão e importação.`;
    renderImportPreview();
  } catch (error) {
    state.importRows = [];
    ui["confirm-import"].disabled = true;
    ui["import-summary"].textContent = error.message || "Não foi possível ler o arquivo.";
    ui["import-preview"].classList.add("hidden");
    toast(error.message || "Arquivo inválido.", "error");
  }
}

function renderImportPreview() {
  const preview = state.importRows.slice(0, 5);
  ui["import-preview"].classList.remove("hidden");
  ui["import-preview"].innerHTML = `<h3>Prévia de importação</h3><p>Mostrando ${preview.length} de ${state.importRows.length} linha${state.importRows.length === 1 ? "" : "s"}. Confira antes de salvar.</p><table class="preview-table"><thead><tr><th>Nome</th><th>Matrícula</th><th>Responsável</th><th>Canal autorizado</th><th>Território</th><th>Escola</th></tr></thead><tbody>${preview.map((row) => `<tr><td>${escapeHtml(row.fullName)}</td><td>${escapeHtml(row.enrollmentCode || "—")}</td><td>${escapeHtml(row.guardianName || "—")}</td><td>${escapeHtml(contactPermissionLabel(row.contactPermission))}</td><td>${escapeHtml(row.territoryZoneName || row.territorySector || "—")}</td><td>${escapeHtml(row.school || "—")}</td></tr>`).join("")}</tbody></table>`;
}

async function importStudents() {
  const classId = ui["import-class"].value;
  if (!classId || !state.importRows.length) {
    toast("Selecione uma turma e carregue uma planilha válida.", "error");
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
    ui["import-summary"].textContent = "Importação concluída. Carregue outro arquivo se necessário.";
    ui["import-preview"].classList.add("hidden");
    if (state.isDemo || state.selectedClassId !== classId) await loadStudents(classId);
    renderClasses();
    renderAttendance();
  } catch (error) {
    toast(friendlyFirebaseError(error), "error");
  } finally {
    button.textContent = "Importar alunos revisados";
    button.disabled = !state.importRows.length;
  }
}

function renderAdmin() {
  if (!state.isAdmin || !ui["admin-content"]) return;
  const teachers = new Set(state.classes.map((item) => item.teacherId).filter(Boolean));
  const active = state.classes.filter((item) => item.active !== false).length;
  ui["admin-content"].innerHTML = `<div class="admin-stats"><article class="panel stat-card"><div class="stat-label"><span>Turmas no acesso</span><i class="stat-icon">◒</i></div><strong>${state.classes.length}</strong><small>todas as turmas autorizadas</small></article><article class="panel stat-card"><div class="stat-label"><span>Turmas ativas</span><i class="stat-icon">✓</i></div><strong>${active}</strong><small>disponíveis para chamada</small></article><article class="panel stat-card"><div class="stat-label"><span>Professores</span><i class="stat-icon">◉</i></div><strong>${teachers.size}</strong><small>identificados pelas turmas</small></article></div><article class="panel admin-note"><strong>Acesso administrativo é provisionado fora da interface.</strong> Para manter a segurança, esta tela não cria administradores. Siga o guia Firebase para cadastrar o UID autorizado em <code>adminUsers</code> usando o Console ou Admin SDK.</article><article class="panel" style="margin-top:16px;padding:20px;overflow:auto"><h3 style="margin-bottom:14px">Turmas acessíveis</h3><table class="admin-table"><thead><tr><th>Turma</th><th>Modalidade</th><th>Professor responsável</th><th>Local</th><th>Status</th></tr></thead><tbody>${state.classes.length ? state.classes.map((item) => `<tr><td>${escapeHtml(item.name || "Turma sem nome")}</td><td>${escapeHtml(item.sport || "—")}</td><td>${escapeHtml(item.teacherName || "—")}</td><td>${escapeHtml(item.location || "—")}</td><td>${item.active === false ? "Inativa" : "Ativa"}</td></tr>`).join("") : "<tr><td colspan=\"5\">Nenhuma turma disponível.</td></tr>"}</tbody></table></article>`;
}

function renderHelp() {
  ui["help-accordions"].innerHTML = HELP_ARTICLES.map((item, index) => `<details class="accordion" ${index === 0 ? "open" : ""}><summary>${escapeHtml(item.title)}</summary><div class="accordion-body"><p>${escapeHtml(item.body)}</p></div></details>`).join("");
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

function handleDynamicClick(event) {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const { action, id, classId, tab, status } = actionButton.dataset;
  if (action === "open-class-dialog") openClassDialog();
  if (action === "select-class") selectClass(id);
  if (action === "edit-class") openClassDialog(id);
  if (action === "open-attendance") openAttendanceFor(id);
  if (action === "open-student-dialog") openStudentDialog(classId);
  if (action === "edit-student") openStudentDialog(classId, id);
  if (action === "delete-student") deleteStudent(classId, id);
  if (action === "contact-whatsapp") contactStudent(classId, id, "whatsapp");
  if (action === "contact-call") contactStudent(classId, id, "call");
  if (action === "select-territory-zone") {
    state.selectedTerritoryZoneId = id === state.selectedTerritoryZoneId ? null : id;
    renderTerritory();
  }
  if (action === "detail-tab") { state.classDetailTab = tab; renderClasses(); }
  if (action === "set-attendance") updateAttendanceStatus(id, status);
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
  if (event.target.name === "territoryZoneId") syncTerritoryFields(ui["student-form"]);
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
  async importTerritoryZones(zones) {
    if (!state.isAdmin) throw new Error("A importação de zonas é restrita à gestão autorizada.");
    if (state.isDemo) {
      const data = demoData();
      data.territoryZones ||= {};
      zones.forEach(({ id, ...zone }) => {
        data.territoryZones[id] = { ...(data.territoryZones[id] || {}), ...zone, updatedAt: new Date().toISOString() };
      });
      writeDemoData(data);
      subscribeTerritoryZones();
      return;
    }
    const batch = writeBatch(firebase.db);
    zones.forEach(({ id, ...zone }) => {
      batch.set(doc(firebase.db, "territoryZones", id), { ...zone, updatedAt: serverTimestamp() }, { merge: true });
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
  return { profile: null, classes: {}, students: {}, territoryZones: {}, attendance: {} };
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
function updateStudentAgePreview() {
  const input = ui["student-age-preview"];
  if (input) input.value = ageAtEndOf2026(ui["student-form"]?.elements.birthDate?.value) || "";
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

function detectSeparator(text) {
  const header = text.split("\n")[0] || "";
  return (header.match(/;/g) || []).length > (header.match(/,/g) || []).length ? ";" : ",";
}

function normalizeHeader(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function cleanAttendanceRecords(records) {
  return Object.fromEntries(Object.entries(records)
    .filter(([, record]) => ["P", "F"].includes(record?.status))
    .map(([id, record]) => [id, { status: record.status, note: String(record.note || "").trim() }]));
}

function countMarked(records = {}) { return Object.values(records).filter((record) => ["P", "F"].includes(record?.status)).length; }
function countPresent(records = {}) { return Object.values(records).filter((record) => record?.status === "P").length; }
function countAbsent(records = {}) { return Object.values(records).filter((record) => record?.status === "F").length; }

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
