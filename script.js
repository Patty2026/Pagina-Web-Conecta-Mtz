import {
  registrarUsuario,
  iniciarSesion,
  cerrarSesion,
  escucharSesion,
  crearIncidencia,
  obtenerIncidenciasPorUsuario,
  obtenerTodasLasIncidencias
} from './firebase-service.js';

const screens = document.querySelectorAll('.screen');

let currentUser = null;
let selectedCategoryValue = 'Baches en vialidades';
let selectedEvidenceName = 'Sin archivo';
let selectedSeverity = 'Media';
let currentLocation = null;
let locationLabel = 'Ubicación no capturada';

let mapInstance = null;
let mapMarker = null;
let reportsMapInstance = null;
let reportMarkersLayer = null;

let cachedReports = [];
let cachedUserReports = [];
let selectedReport = null;

const defaultLocation = {
  latitud: 20.0708,
  longitud: -97.0608
};

/* ===============================
   NAVEGACIÓN ENTRE PANTALLAS
================================ */

function showScreen(target) {
  screens.forEach(screen => screen.classList.remove('active'));

  const screen = document.getElementById(target);
  if (screen) screen.classList.add('active');

  window.scrollTo(0, 0);

  if (target === 'locationScreen') {
    initMap();
    setTimeout(() => mapInstance?.invalidateSize(), 300);
  }

  if (target === 'mapScreen') {
    initReportsMap();
    setTimeout(() => reportsMapInstance?.invalidateSize(), 300);
    loadReportsMap();
  }

  if (target === 'trackingScreen') {
    renderTrackingScreen();
  }

  if (target === 'profileScreen') {
    fillProfileDataForm();
    renderProfileReports();
  }
}

/* ===============================
   MODAL INICIAL ACERCA DE LA APP
================================ */

function initSplashInfoModal() {
  const openBtn = document.getElementById('openSplashInfo');
  const closeBtn = document.getElementById('closeSplashInfo');
  const overlay = document.getElementById('splashInfoOverlay');

  if (!openBtn || !closeBtn || !overlay) return;

  const openModal = () => {
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
  };

  const closeModal = () => {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
  };

  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);

  overlay.addEventListener('click', event => {
    if (event.target === overlay) closeModal();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeModal();
  });
}

/* ===============================
   MENSAJES Y ERRORES
================================ */

function setAuthMessage(message, type = 'info') {
  const authMessage = document.getElementById('authMessage');
  if (!authMessage) return;

  authMessage.textContent = message;
  authMessage.dataset.type = type;
}

function friendlyFirebaseError(error) {
  console.error('Firebase error:', error);

  const code = error?.code || '';
  const message = error?.message || '';

  if (code.includes('auth/email-already-in-use')) {
    return 'Este correo ya está registrado. Usa otro correo o inicia sesión.';
  }

  if (code.includes('auth/invalid-email')) {
    return 'El correo electrónico no es válido.';
  }

  if (code.includes('auth/weak-password')) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }

  if (code.includes('auth/operation-not-allowed')) {
    return 'El acceso por correo/contraseña no está habilitado en Firebase.';
  }

  if (code.includes('auth/network-request-failed')) {
    return 'No hay conexión con Firebase. Revisa internet o WebView.';
  }

  if (
    code.includes('auth/invalid-credential') ||
    code.includes('auth/wrong-password') ||
    code.includes('auth/user-not-found')
  ) {
    return 'Correo o contraseña incorrectos.';
  }

  if (code.includes('permission-denied')) {
    return 'Firestore bloqueó la operación. Revisa las reglas.';
  }

  return `Error: ${code || message || 'No identificado'}`;
}

function getCategoryIcon(category = '') {
  const lower = category.toLowerCase();

  if (lower.includes('alumbrado')) return '💡';
  if (lower.includes('bache')) return '🚧';
  if (lower.includes('agua') || lower.includes('fuga')) return '💧';
  if (lower.includes('basura')) return '🗑️';
  if (lower.includes('verde')) return '🌳';

  return '📌';
}

function normalizeStatus(status = 'Pendiente') {
  const value = status.toLowerCase();

  if (value.includes('proceso')) return 'En proceso';
  if (value.includes('revision') || value.includes('revisión')) return 'En revisión';
  if (value.includes('resuelto') || value.includes('cerrado')) return 'Resuelto';

  return 'Pendiente';
}

/* ===============================
   GEOLOCALIZACIÓN CON MAPA
================================ */

function updateLocationUI(message) {
  const locationText = document.getElementById('locationText');
  const summaryLocation = document.getElementById('summaryLocation');

  if (locationText) {
    locationText.innerHTML = message.replaceAll('\n', '<br>');
  }

  if (summaryLocation) {
    summaryLocation.textContent = message.replaceAll('\n', ' · ');
  }
}

function setSelectedLocation(lat, lng, message = 'Ubicación seleccionada en el mapa', accuracy = null) {
  currentLocation = {
    latitud: lat,
    longitud: lng,
    precisionMetros: accuracy,
    fuente: message
  };

  if (mapMarker) {
    mapMarker.setLatLng([lat, lng]);
  }

  if (mapInstance) {
    mapInstance.setView([lat, lng], 16);
  }

  locationLabel = `${message}\nLat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}${accuracy ? `\nPrecisión: ${accuracy} m` : ''}`;

  updateLocationUI(locationLabel);
  updateSummary();
}

function initMap() {
  const mapContainer = document.getElementById('realMap');

  if (!mapContainer || typeof L === 'undefined') return;

  if (mapInstance) {
    setTimeout(() => mapInstance.invalidateSize(), 250);
    return;
  }

  mapInstance = L.map('realMap').setView(
    [defaultLocation.latitud, defaultLocation.longitud],
    14
  );

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(mapInstance);

  mapMarker = L.marker(
    [defaultLocation.latitud, defaultLocation.longitud],
    { draggable: true }
  ).addTo(mapInstance);

  mapMarker
    .bindPopup('Mueve este marcador a la zona exacta de la incidencia.')
    .openPopup();

  mapMarker.on('dragend', () => {
    const position = mapMarker.getLatLng();

    setSelectedLocation(
      position.lat,
      position.lng,
      'Ubicación ajustada manualmente en el mapa'
    );
  });

  mapInstance.on('click', event => {
    setSelectedLocation(
      event.latlng.lat,
      event.latlng.lng,
      'Ubicación seleccionada en el mapa'
    );
  });

  setSelectedLocation(
    defaultLocation.latitud,
    defaultLocation.longitud,
    'Ubicación inicial: Martínez de la Torre'
  );
}

function requestUserLocation() {
  initMap();

  if (!navigator.geolocation) {
    setSelectedLocation(
      defaultLocation.latitud,
      defaultLocation.longitud,
      'GPS no disponible. Mueve el marcador para indicar la zona'
    );
    return;
  }

  locationLabel = 'Solicitando ubicación GPS...';
  updateLocationUI(locationLabel);

  navigator.geolocation.getCurrentPosition(
    position => {
      const { latitude, longitude, accuracy } = position.coords;

      setSelectedLocation(
        latitude,
        longitude,
        'Ubicación GPS capturada. Puedes mover el marcador si la incidencia está en otra zona',
        Math.round(accuracy || 0)
      );
    },
    error => {
      let message = 'No se permitió GPS. Mueve el marcador para indicar la zona';

      if (error.code === 2) {
        message = 'No se pudo obtener la ubicación. Mueve el marcador manualmente';
      }

      if (error.code === 3) {
        message = 'Tiempo agotado. Mueve el marcador manualmente';
      }

      setSelectedLocation(
        defaultLocation.latitud,
        defaultLocation.longitud,
        message
      );
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0
    }
  );
}

document
  .getElementById('refreshLocationBtn')
  ?.addEventListener('click', requestUserLocation);

/* ===============================
   MAPA GENERAL DE INCIDENCIAS
================================ */

function initReportsMap() {
  const mapContainer = document.getElementById('reportsMap');

  if (!mapContainer || typeof L === 'undefined') return;

  if (reportsMapInstance) {
    setTimeout(() => reportsMapInstance.invalidateSize(), 250);
    return;
  }

  reportsMapInstance = L.map('reportsMap').setView(
    [defaultLocation.latitud, defaultLocation.longitud],
    13
  );

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(reportsMapInstance);

  reportMarkersLayer = L.layerGroup().addTo(reportsMapInstance);
}

function markerIconForReport(report) {
  const icon = getCategoryIcon(report.tipo);

  return L.divIcon({
    className: 'incident-map-marker',
    html: `<span>${icon}</span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 38],
    popupAnchor: [0, -34]
  });
}

function updateMapInfoCard(title, detail, icon = '🗺️') {
  const card = document.getElementById('mapInfoCard');

  if (!card) return;

  card.innerHTML = `
    <span class="icon orange">${icon}</span>
    <div>
      <b>${title}</b>
      <small>${detail}</small>
    </div>
  `;
}

function drawReportsOnMap(reports = cachedReports) {
  initReportsMap();

  if (!reportsMapInstance || !reportMarkersLayer) return;

  reportMarkersLayer.clearLayers();

  const validReports = reports.filter(report =>
    Number.isFinite(report?.coordenadas?.latitud) &&
    Number.isFinite(report?.coordenadas?.longitud)
  );

  if (!validReports.length) {
    updateMapInfoCard(
      'Sin incidencias con ubicación',
      'Cuando envíes reportes con coordenadas aparecerán aquí.',
      'ℹ️'
    );

    reportsMapInstance.setView(
      [defaultLocation.latitud, defaultLocation.longitud],
      13
    );

    return;
  }

  const bounds = [];

  validReports.forEach(report => {
    const lat = report.coordenadas.latitud;
    const lng = report.coordenadas.longitud;

    bounds.push([lat, lng]);

    const marker = L.marker(
      [lat, lng],
      { icon: markerIconForReport(report) }
    ).addTo(reportMarkersLayer);

    const folio = report.folio || 'Incidencia';
    const tipo = report.tipo || 'Reporte ciudadano';
    const estado = report.estado || 'Pendiente';
    const descripcion = report.descripcion || 'Sin descripción';

    marker.bindPopup(`
      <b>${folio}</b><br>
      ${getCategoryIcon(tipo)} ${tipo}<br>
      <small>${estado}</small><br>
      <small>${descripcion}</small>
    `);

    marker.on('click', () => {
      selectedReport = report;

      updateMapInfoCard(
        `${folio} · ${tipo}`,
        `${estado} · ${descripcion}`,
        getCategoryIcon(tipo)
      );
    });
  });

  reportsMapInstance.fitBounds(bounds, {
    padding: [32, 32],
    maxZoom: 16
  });

  updateMapInfoCard(
    `${validReports.length} incidencia(s) en el mapa`,
    'Toca un marcador para ver el detalle del reporte.',
    '📍'
  );
}

async function loadReportsMap() {
  initReportsMap();

  updateMapInfoCard(
    'Cargando incidencias...',
    'Consultando reportes guardados en Firestore.',
    '⏳'
  );

  try {
    cachedReports = await obtenerTodasLasIncidencias();
    drawReportsOnMap(cachedReports);
  } catch (error) {
    console.error(error);

    updateMapInfoCard(
      'No se pudieron cargar incidencias',
      'Revisa conexión o permisos de Firestore.',
      '⚠️'
    );
  }
}

/* ===============================
   RESUMEN DEL REPORTE
================================ */

function updateSummary() {
  const category = document.getElementById('selectedCategory');
  const desc = document.getElementById('summaryDesc');
  const evidence = document.getElementById('summaryEvidence');

  if (category) category.textContent = selectedCategoryValue;

  const description = document.getElementById('desc')?.value?.trim();
  if (desc) desc.textContent = description || 'Completa la descripción del problema.';

  if (evidence) evidence.textContent = selectedEvidenceName;
}

/* ===============================
   REPORTES EN INICIO Y PERFIL
================================ */

function renderReportCard(report) {
  const status = normalizeStatus(report.estado || 'Pendiente');
  const folio = report.folio || `#${report.id?.slice(0, 8) || 'INC'}`;
  const tipo = report.tipo || 'Reporte ciudadano';
  const desc = report.descripcion || 'Sin descripción';

  return `
    <div class="report-card" data-report-id="${report.id}">
      <span class="icon cyan">${getCategoryIcon(tipo)}</span>
      <div>
        <b>${folio} · ${tipo}</b>
        <small>${status} · ${desc}</small>
      </div>
      <span>›</span>
    </div>
  `;
}

function attachReportCardEvents(container) {
  container.querySelectorAll('[data-report-id]').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.reportId;
      selectedReport = cachedReports.find(report => report.id === id) ||
        cachedUserReports.find(report => report.id === id) ||
        null;

      showScreen('trackingScreen');
    });
  });
}

async function loadUserReports() {
  const list = document.getElementById('reportsList');
  if (!list || !currentUser) return;

  list.innerHTML = `
    <div class="report-card">
      <span class="icon orange">⏳</span>
      <div><b>Cargando reportes...</b><small>Consultando Firestore</small></div>
      <span>·</span>
    </div>
  `;

  try {
    cachedUserReports = await obtenerIncidenciasPorUsuario(currentUser.uid);
    cachedReports = cachedUserReports;

    if (!cachedUserReports.length) {
      list.innerHTML = `
        <div class="report-card">
          <span class="icon green">ℹ️</span>
          <div><b>Sin reportes todavía</b><small>Crea tu primera incidencia</small></div>
          <span>›</span>
        </div>
      `;
      return;
    }

    list.innerHTML = cachedUserReports.slice(0, 3).map(renderReportCard).join('');
    attachReportCardEvents(list);
  } catch (error) {
    console.error(error);

    list.innerHTML = `
      <div class="report-card">
        <span class="icon orange">⚠️</span>
        <div><b>No se pudieron cargar los reportes</b><small>Revisa conexión o reglas de Firestore</small></div>
        <span>·</span>
      </div>
    `;
  }
}

function renderTrackingScreen() {
  const title = document.querySelector('#trackingScreen h3');
  const banner = document.querySelector('#trackingScreen .status-banner');
  const timeline = document.querySelector('#trackingScreen .timeline');

  const report = selectedReport || cachedUserReports[0];

  if (!report) return;

  const status = normalizeStatus(report.estado || 'Pendiente');
  const tipo = report.tipo || 'Reporte ciudadano';
  const folio = report.folio || `#${report.id?.slice(0, 8) || 'INC'}`;
  const desc = report.descripcion || 'Sin descripción';

  if (banner) {
    banner.innerHTML = `${status}<br><small>${status === 'Resuelto' ? 'Tu reporte fue marcado como resuelto' : 'Tu reporte está siendo atendido'}</small>`;
  }

  if (title) {
    title.innerHTML = `${folio}<br><span>${tipo}</span><br><small>${desc}</small>`;
  }

  if (timeline) {
    const steps = ['Pendiente', 'En revisión', 'En proceso', 'Resuelto'];
    const currentIndex = steps.indexOf(status);

    timeline.innerHTML = steps.map((step, index) => {
      const icon = index <= currentIndex ? '✅' : '⚪';
      return `<p>${icon} ${step}</p>`;
    }).join('');
  }
}

/* ===============================
   PERFIL DESPLEGABLE
================================ */

function initProfilePanels() {
  document.querySelectorAll('.profile-toggle').forEach(button => {
    button.addEventListener('click', () => {
      const panelId = button.dataset.profilePanel;
      const panel = document.getElementById(panelId);

      if (!panel) return;

      const isOpen = panel.classList.contains('open');

      document.querySelectorAll('.profile-panel').forEach(item => item.classList.remove('open'));
      document.querySelectorAll('.profile-toggle').forEach(item => item.classList.remove('active'));

      if (!isOpen) {
        panel.classList.add('open');
        button.classList.add('active');
      }

      if (panelId === 'panelReports') renderProfileReports();
    });
  });
}

function fillProfileDataForm() {
  const storedProfile = JSON.parse(localStorage.getItem('conectaPerfil') || '{}');
  const email = currentUser?.email || storedProfile.correo || '';
  const name = storedProfile.nombre || email.split('@')[0] || 'Usuario';
  const phone = storedProfile.telefono || '';
  const role = storedProfile.rol || document.getElementById('roleSelect')?.value || 'Ciudadano';

  const profileName = document.getElementById('profileName');
  const profileRole = document.getElementById('profileRole');
  const avatar = document.querySelector('.avatar');

  if (profileName) profileName.textContent = name;
  if (profileRole) profileRole.textContent = `${role} activo`;
  if (avatar) avatar.textContent = name.charAt(0).toUpperCase();

  const nameInput = document.getElementById('profileNameInput');
  const emailInput = document.getElementById('profileEmailInput');
  const phoneInput = document.getElementById('profilePhoneInput');
  const roleInput = document.getElementById('profileRoleInput');

  if (nameInput) nameInput.value = name;
  if (emailInput) emailInput.value = email;
  if (phoneInput) phoneInput.value = phone;
  if (roleInput) roleInput.value = role;
}

function renderProfileReports() {
  const container = document.getElementById('profileReportsList');
  if (!container) return;

  const reports = cachedUserReports.length ? cachedUserReports : cachedReports;

  if (!reports.length) {
    container.innerHTML = `
      <div class="empty-state">
        <b>No hay reportes disponibles</b>
        <small>Cuando registres una incidencia aparecerá aquí.</small>
      </div>
    `;
    return;
  }

  container.innerHTML = reports.map(report => {
    const status = normalizeStatus(report.estado || 'Pendiente');
    const folio = report.folio || `#${report.id?.slice(0, 8) || 'INC'}`;
    const tipo = report.tipo || 'Reporte ciudadano';
    const desc = report.descripcion || 'Sin descripción';

    return `
      <div class="profile-report-item" data-profile-report="${report.id}">
        <span>${getCategoryIcon(tipo)}</span>
        <div>
          <b>${folio}</b>
          <small>${tipo}</small>
          <small>${desc}</small>
        </div>
        <span class="mini-status">${status}</span>
        <div class="profile-actions">
          <button type="button" data-profile-view="${report.id}">Ver</button>
          <button type="button" data-profile-map="${report.id}">Mapa</button>
          <button type="button" data-profile-delete="${report.id}" class="danger">Eliminar</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-profile-view]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.profileView;
      selectedReport = reports.find(report => report.id === id);
      showScreen('trackingScreen');
    });
  });

  container.querySelectorAll('[data-profile-map]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.profileMap;
      selectedReport = reports.find(report => report.id === id);
      showScreen('mapScreen');
    });
  });

  container.querySelectorAll('[data-profile-delete]').forEach(button => {
    button.addEventListener('click', () => {
      alert('Función demo: para eliminar reportes se requiere habilitar deleteDoc en Firebase.');
    });
  });
}

/* ===============================
   ONBOARDING
================================ */

const slides = document.querySelectorAll('.incident-slide');
const dots = document.querySelectorAll('#onboardingDots span');
const title = document.getElementById('onboardingTitle');
const text = document.getElementById('onboardingText');
const nextSlideBtn = document.getElementById('nextSlideBtn');
const carousel = document.getElementById('incidentCarousel');
let currentSlide = 0;
let startX = 0;

function renderSlide(index) {
  slides.forEach((slide, i) => {
    slide.classList.toggle('active', i === index);
    slide.style.transform = `translateX(${(i - index) * 100}%)`;
  });

  dots.forEach((dot, i) => dot.classList.toggle('active', i === index));

  if (title && text && slides[index]) {
    title.innerHTML = slides[index].dataset.title;
    text.textContent = slides[index].dataset.text;
  }
}

function nextSlide() {
  currentSlide += 1;

  if (currentSlide >= slides.length) {
    showScreen('loginScreen');
    return;
  }

  renderSlide(currentSlide);
}

nextSlideBtn?.addEventListener('click', nextSlide);

dots.forEach((dot, index) => {
  dot.addEventListener('click', () => {
    currentSlide = index;
    renderSlide(currentSlide);
  });
});

carousel?.addEventListener('touchstart', event => {
  startX = event.touches[0].clientX;
});

carousel?.addEventListener('touchend', event => {
  const endX = event.changedTouches[0].clientX;

  if (startX - endX > 45) nextSlide();
  if (endX - startX > 45 && currentSlide > 0) {
    currentSlide -= 1;
    renderSlide(currentSlide);
  }
});

renderSlide(currentSlide);

/* ===============================
   EVENTOS DE NAVEGACIÓN
================================ */

document.addEventListener('click', event => {
  const button = event.target.closest('[data-go]');

  if (!button) return;

  const target = button.dataset.go;

  if (button.dataset.category) {
    selectedCategoryValue = button.dataset.category;
    updateSummary();
  }

  showScreen(target);
});

/* ===============================
   FORMULARIO DE INCIDENCIA
================================ */

document.getElementById('desc')?.addEventListener('input', updateSummary);

document.querySelectorAll('.severity button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.severity button').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    selectedSeverity = button.textContent.trim();
  });
});

document.getElementById('evidenceFile')?.addEventListener('change', event => {
  const file = event.target.files?.[0];
  selectedEvidenceName = file ? file.name : 'Sin archivo';

  const label = document.getElementById('evidenceLabel');
  if (label) label.textContent = selectedEvidenceName;

  updateSummary();
});

document.getElementById('sendReport')?.addEventListener('click', async () => {
  if (!currentUser) {
    alert('Debes iniciar sesión para enviar un reporte.');
    return showScreen('loginScreen');
  }

  const description = document.getElementById('desc')?.value?.trim();

  if (!description) {
    alert('Agrega una descripción del problema.');
    return showScreen('reportInfoScreen');
  }

  if (!currentLocation) {
    alert('Selecciona una ubicación en el mapa.');
    return showScreen('locationScreen');
  }

  const folio = `#INC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    await crearIncidencia({
      folio,
      idCiudadano: currentUser.uid,
      correoCiudadano: currentUser.email,
      tipo: selectedCategoryValue,
      descripcion: description,
      gravedad: selectedSeverity,
      tiempo: document.getElementById('incidentTime')?.value || 'Sin especificar',
      evidenciaNombre: selectedEvidenceName,
      ubicacion: locationLabel,
      coordenadas: currentLocation,
      estado: 'Pendiente'
    });

    alert(`Reporte enviado correctamente: ${folio}`);

    document.getElementById('incidentForm')?.reset();
    selectedEvidenceName = 'Sin archivo';
    await loadUserReports();
    showScreen('homeScreen');
  } catch (error) {
    alert(friendlyFirebaseError(error));
  }
});

/* ===============================
   AUTENTICACIÓN
================================ */

document.getElementById('loginForm')?.addEventListener('submit', async event => {
  event.preventDefault();

  const email = document.getElementById('loginEmail')?.value.trim();
  const password = document.getElementById('loginPassword')?.value;
  const role = document.getElementById('roleSelect')?.value || 'Ciudadano';

  setAuthMessage('Iniciando sesión...', 'info');

  try {
    const credential = await iniciarSesion(email, password);
    currentUser = credential.user;

    localStorage.setItem('conectaPerfil', JSON.stringify({
      ...JSON.parse(localStorage.getItem('conectaPerfil') || '{}'),
      correo: email,
      nombre: email.split('@')[0],
      rol: role
    }));

    setAuthMessage('Sesión iniciada correctamente.', 'success');
    fillProfileDataForm();
    await loadUserReports();
    showScreen(role.toLowerCase().includes('apoyo') ? 'supportScreen' : 'homeScreen');
  } catch (error) {
    setAuthMessage(friendlyFirebaseError(error), 'error');
  }
});

document.getElementById('registerBtn')?.addEventListener('click', async () => {
  const email = document.getElementById('loginEmail')?.value.trim();
  const password = document.getElementById('loginPassword')?.value;
  const role = document.getElementById('roleSelect')?.value || 'Ciudadano';

  if (!email || !password) {
    setAuthMessage('Escribe correo y contraseña para registrarte.', 'error');
    return;
  }

  setAuthMessage('Creando cuenta...', 'info');

  try {
    const credential = await registrarUsuario(email, password, role);
    currentUser = credential.user;

    localStorage.setItem('conectaPerfil', JSON.stringify({
      correo: email,
      nombre: email.split('@')[0],
      telefono: '',
      rol: role
    }));

    setAuthMessage('Cuenta creada correctamente.', 'success');
    fillProfileDataForm();
    await loadUserReports();
    showScreen(role.toLowerCase().includes('apoyo') ? 'supportScreen' : 'homeScreen');
  } catch (error) {
    setAuthMessage(friendlyFirebaseError(error), 'error');
  }
});

escucharSesion(async user => {
  currentUser = user;

  if (user) {
    const stored = JSON.parse(localStorage.getItem('conectaPerfil') || '{}');

    localStorage.setItem('conectaPerfil', JSON.stringify({
      ...stored,
      correo: user.email,
      nombre: stored.nombre || user.email.split('@')[0]
    }));

    fillProfileDataForm();
    await loadUserReports();
  }
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  try {
    await cerrarSesion();
    currentUser = null;
    cachedUserReports = [];
    showScreen('loginScreen');
  } catch (error) {
    alert(friendlyFirebaseError(error));
  }
});

/* ===============================
   CONFIGURACIÓN Y SOPORTE
================================ */

document.getElementById('profileDataForm')?.addEventListener('submit', event => {
  event.preventDefault();

  const storedProfile = JSON.parse(localStorage.getItem('conectaPerfil') || '{}');
  const updatedProfile = {
    ...storedProfile,
    nombre: document.getElementById('profileNameInput')?.value || storedProfile.nombre,
    telefono: document.getElementById('profilePhoneInput')?.value || '',
    rol: document.getElementById('profileRoleInput')?.value || storedProfile.rol || 'Ciudadano',
    correo: currentUser?.email || storedProfile.correo || ''
  };

  localStorage.setItem('conectaPerfil', JSON.stringify(updatedProfile));
  fillProfileDataForm();

  const message = document.getElementById('profileDataMessage');
  if (message) message.textContent = 'Datos guardados correctamente.';
});

document.getElementById('saveSettingsBtn')?.addEventListener('click', () => {
  const settings = {
    notifyReports: document.getElementById('notifyReports')?.checked,
    allowLocation: document.getElementById('allowLocationSetting')?.checked,
    compactMode: document.getElementById('compactModeSetting')?.checked
  };

  localStorage.setItem('conectaConfiguracion', JSON.stringify(settings));

  const message = document.getElementById('settingsMessage');
  if (message) message.textContent = 'Configuración guardada correctamente.';
});

document.getElementById('sendSupportBtn')?.addEventListener('click', () => {
  const supportMessage = document.getElementById('supportMessage')?.value.trim();
  const result = document.getElementById('supportMessageResult');

  if (!supportMessage) {
    if (result) result.textContent = 'Escribe un mensaje antes de enviar.';
    return;
  }

  if (result) result.textContent = 'Mensaje enviado a soporte.';
  document.getElementById('supportMessage').value = '';
});

/* ===============================
   INICIALIZACIÓN
================================ */

document.addEventListener('DOMContentLoaded', () => {
  initSplashInfoModal();
  initProfilePanels();
  fillProfileDataForm();
});
