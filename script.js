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

const defaultLocation = { latitud: 20.0708, longitud: -97.0608 };

function showScreen(target) {
  screens.forEach(screen => screen.classList.remove('active'));
  document.getElementById(target)?.classList.add('active');
  window.scrollTo(0, 0);
  if (target === 'locationScreen') { initMap(); setTimeout(() => mapInstance?.invalidateSize(), 300); }
  if (target === 'mapScreen') { initReportsMap(); setTimeout(() => reportsMapInstance?.invalidateSize(), 300); loadReportsMap(); }
  if (target === 'trackingScreen') renderTrackingScreen();
}

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
  if (code.includes('auth/email-already-in-use')) return 'Este correo ya está registrado. Usa otro correo o inicia sesión.';
  if (code.includes('auth/invalid-email')) return 'El correo electrónico no es válido.';
  if (code.includes('auth/weak-password')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (code.includes('auth/operation-not-allowed')) return 'El acceso por correo/contraseña no está habilitado en Firebase.';
  if (code.includes('auth/network-request-failed')) return 'No hay conexión con Firebase. Revisa internet o WebView.';
  if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password') || code.includes('auth/user-not-found')) return 'Correo o contraseña incorrectos.';
  if (code.includes('permission-denied')) return 'Firestore bloqueó la operación. Revisa las reglas.';
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

function updateLocationUI(message) {
  const locationText = document.getElementById('locationText');
  const summaryLocation = document.getElementById('summaryLocation');
  if (locationText) locationText.innerHTML = message.replaceAll('\n', '<br>');
  if (summaryLocation) summaryLocation.textContent = message.replaceAll('\n', ' · ');
}

function setSelectedLocation(lat, lng, message = 'Ubicación seleccionada en el mapa', accuracy = null) {
  currentLocation = { latitud: lat, longitud: lng, precisionMetros: accuracy, fuente: message };
  if (mapMarker) mapMarker.setLatLng([lat, lng]);
  if (mapInstance) mapInstance.setView([lat, lng], 16);
  locationLabel = `${message}\nLat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}${accuracy ? `\nPrecisión: ${accuracy} m` : ''}`;
  updateLocationUI(locationLabel);
  updateSummary();
}

function initMap() {
  const mapContainer = document.getElementById('realMap');
  if (!mapContainer || typeof L === 'undefined') return;
  if (mapInstance) { setTimeout(() => mapInstance.invalidateSize(), 250); return; }
  mapInstance = L.map('realMap').setView([defaultLocation.latitud, defaultLocation.longitud], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapInstance);
  mapMarker = L.marker([defaultLocation.latitud, defaultLocation.longitud], { draggable: true }).addTo(mapInstance);
  mapMarker.bindPopup('Mueve este marcador a la zona exacta de la incidencia.').openPopup();
  mapMarker.on('dragend', () => { const position = mapMarker.getLatLng(); setSelectedLocation(position.lat, position.lng, 'Ubicación ajustada manualmente en el mapa'); });
  mapInstance.on('click', event => setSelectedLocation(event.latlng.lat, event.latlng.lng, 'Ubicación seleccionada en el mapa'));
  setSelectedLocation(defaultLocation.latitud, defaultLocation.longitud, 'Ubicación inicial: Martínez de la Torre');
}

function requestUserLocation() {
  initMap();
  if (!navigator.geolocation) return setSelectedLocation(defaultLocation.latitud, defaultLocation.longitud, 'GPS no disponible. Mueve el marcador para indicar la zona');
  locationLabel = 'Solicitando ubicación GPS...';
  updateLocationUI(locationLabel);
  navigator.geolocation.getCurrentPosition(
    position => {
      const { latitude, longitude, accuracy } = position.coords;
      setSelectedLocation(latitude, longitude, 'Ubicación GPS capturada. Puedes mover el marcador si la incidencia está en otra zona', Math.round(accuracy || 0));
    },
    error => {
      let message = 'No se permitió GPS. Mueve el marcador para indicar la zona';
      if (error.code === 2) message = 'No se pudo obtener la ubicación. Mueve el marcador manualmente';
      if (error.code === 3) message = 'Tiempo agotado. Mueve el marcador manualmente';
      setSelectedLocation(defaultLocation.latitud, defaultLocation.longitud, message);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

document.getElementById('refreshLocationBtn')?.addEventListener('click', requestUserLocation);

function initReportsMap() {
  const mapContainer = document.getElementById('reportsMap');
  if (!mapContainer || typeof L === 'undefined') return;
  if (reportsMapInstance) { setTimeout(() => reportsMapInstance.invalidateSize(), 250); return; }
  reportsMapInstance = L.map('reportsMap').setView([defaultLocation.latitud, defaultLocation.longitud], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(reportsMapInstance);
  reportMarkersLayer = L.layerGroup().addTo(reportsMapInstance);
}

function markerIconForReport(report) {
  const icon = getCategoryIcon(report.tipo);
  return L.divIcon({ className: 'incident-map-marker', html: `<span>${icon}</span>`, iconSize: [38, 38], iconAnchor: [19, 38], popupAnchor: [0, -34] });
}

function updateMapInfoCard(title, detail, icon = '🗺️') {
  const card = document.getElementById('mapInfoCard');
  if (!card) return;
  card.innerHTML = `<span class="icon orange">${icon}</span><div><b>${title}</b><small>${detail}</small></div>`;
}

function drawReportsOnMap(reports = cachedReports) {
  initReportsMap();
  if (!reportsMapInstance || !reportMarkersLayer) return;
  reportMarkersLayer.clearLayers();
  const validReports = reports.filter(report => Number.isFinite(report?.coordenadas?.latitud) && Number.isFinite(report?.coordenadas?.longitud));
  if (!validReports.length) {
    updateMapInfoCard('Sin incidencias con ubicación', 'Cuando envíes reportes con coordenadas aparecerán aquí.', 'ℹ️');
    reportsMapInstance.setView([defaultLocation.latitud, defaultLocation.longitud], 13);
    return;
  }
  const bounds = [];
  validReports.forEach(report => {
    const lat = report.coordenadas.latitud;
    const lng = report.coordenadas.longitud;
    bounds.push([lat, lng]);
    const marker = L.marker([lat, lng], { icon: markerIconForReport(report) }).addTo(reportMarkersLayer);
    const folio = report.folio || 'Incidencia';
    const tipo = report.tipo || 'Reporte ciudadano';
    const estado = report.estado || 'Pendiente';
    const descripcion = report.descripcion || 'Sin descripción';
    marker.bindPopup(`<b>${folio}</b><br>${getCategoryIcon(tipo)} ${tipo}<br><small>${estado}</small><br><small>${descripcion}</small>`);
    marker.on('click', () => { selectedReport = report; updateMapInfoCard(`${folio} · ${tipo}`, `${estado} · ${descripcion}`, getCategoryIcon(tipo)); });
  });
  reportsMapInstance.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
  updateMapInfoCard(`${validReports.length} incidencia(s) en el mapa`, 'Toca un marcador para ver el detalle del reporte.', '📍');
}

async function loadReportsMap() {
  initReportsMap();
  updateMapInfoCard('Cargando incidencias...', 'Consultando reportes guardados en Firestore.', '⏳');
  try {
    cachedReports = await obtenerTodasLasIncidencias();
    drawReportsOnMap(cachedReports);
  } catch (error) {
    console.error(error);
    updateMapInfoCard('No se pudieron cargar incidencias', 'Revisa conexión o permisos de Firestore.', '⚠️');
  }
}

document.getElementById('mapSearchInput')?.addEventListener('input', event => {
  const term = event.target.value.trim().toLowerCase();
  const filtered = !term ? cachedReports : cachedReports.filter(report => `${report.folio || ''} ${report.tipo || ''} ${report.descripcion || ''} ${report.ubicacion || ''} ${report.estado || ''}`.toLowerCase().includes(term));
  drawReportsOnMap(filtered);
  if (term && !filtered.length) updateMapInfoCard('Sin resultados', `No se encontraron reportes con “${term}”.`, '🔎');
});

async function loadUserReports() {
  const reportsList = document.getElementById('reportsList');
  if (!reportsList || !currentUser) return;
  reportsList.innerHTML = '<div class="report-card"><span class="icon cyan">⏳</span><div><b>Cargando reportes...</b><small>Consultando Firestore</small></div></div>';
  try {
    const reports = await obtenerIncidenciasPorUsuario(currentUser.uid);
    cachedUserReports = reports;
    if (!reports.length) {
      reportsList.innerHTML = '<div class="report-card"><span class="icon green">ℹ️</span><div><b>Sin reportes todavía</b><small>Crea tu primera incidencia</small></div><span>›</span></div>';
      return;
    }
    reportsList.innerHTML = reports.slice(0, 5).map((report, index) => `<div class="report-card user-report-card" data-report-index="${index}"><span class="icon cyan">${getCategoryIcon(report.tipo)}</span><div><b>${report.folio || report.tipo || 'Incidencia'}</b><small>${report.estado || 'Pendiente'} · ${report.descripcion || 'Sin descripción'}</small></div><span>›</span></div>`).join('');
    reportsList.querySelectorAll('.user-report-card').forEach(card => card.addEventListener('click', () => { selectedReport = cachedUserReports[Number(card.dataset.reportIndex)] || null; showScreen('trackingScreen'); }));
  } catch (error) {
    console.error(error);
    reportsList.innerHTML = '<div class="report-card"><span class="icon orange">⚠️</span><div><b>No se pudieron cargar los reportes</b><small>Revisa conexión o reglas de Firestore</small></div></div>';
  }
}

function renderTrackingScreen() {
  const report = selectedReport || cachedUserReports[0] || null;
  const statusBanner = document.querySelector('#trackingScreen .status-banner');
  const title = document.querySelector('#trackingScreen h3');
  const timeline = document.querySelector('#trackingScreen .timeline');
  if (!report) {
    if (statusBanner) statusBanner.innerHTML = 'Sin reporte seleccionado<br><small>Vuelve a Mis reportes y selecciona una incidencia.</small>';
    if (title) title.innerHTML = 'Sin folio<br><span>No hay datos disponibles</span>';
    if (timeline) timeline.innerHTML = '<p>⚠️ No se encontró información del reporte.</p>';
    return;
  }
  const status = normalizeStatus(report.estado);
  const folio = report.folio || `#${report.id?.slice(0, 8) || 'INC'}`;
  const type = report.tipo || 'Incidencia ciudadana';
  const description = report.descripcion || 'Sin descripción';
  const location = report.ubicacion || 'Ubicación no registrada';
  const steps = ['Pendiente', 'En revisión', 'En proceso', 'Resuelto'];
  const activeIndex = Math.max(0, steps.indexOf(status));
  if (statusBanner) statusBanner.innerHTML = `${status}<br><small>${description}</small>`;
  if (title) title.innerHTML = `${folio}<br><span>${type}</span><small style="display:block;color:#6d7191;margin-top:10px;font-size:.9rem;line-height:1.5">${location}</small>`;
  if (timeline) timeline.innerHTML = steps.map((step, index) => {
    const icon = index < activeIndex ? '✅' : index === activeIndex ? (step === 'Resuelto' ? '✅' : '🟠') : '⚪';
    const label = step === 'Pendiente' ? 'Reporte recibido' : step;
    return `<p>${icon} ${label}</p>`;
  }).join('');
}

function updateSummary() {
  const desc = document.getElementById('desc')?.value?.trim() || 'Completa la descripción del problema.';
  document.getElementById('summaryDesc') && (document.getElementById('summaryDesc').textContent = desc);
  document.getElementById('summaryEvidence') && (document.getElementById('summaryEvidence').textContent = selectedEvidenceName);
  document.getElementById('selectedCategory') && (document.getElementById('selectedCategory').textContent = selectedCategoryValue);
  document.getElementById('summaryLocation') && (document.getElementById('summaryLocation').textContent = locationLabel.replaceAll('\n', ' · '));
}

document.querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => { if (btn.dataset.go === 'confirmScreen') updateSummary(); showScreen(btn.dataset.go); }));

document.getElementById('loginForm')?.addEventListener('submit', async event => { event.preventDefault(); const email = document.getElementById('loginEmail')?.value?.trim(); const password = document.getElementById('loginPassword')?.value; if (!email || !password) return setAuthMessage('Escribe correo y contraseña.', 'error'); setAuthMessage('Iniciando sesión...', 'info'); try { await iniciarSesion(email, password); setAuthMessage('Sesión iniciada correctamente.', 'success'); showScreen('homeScreen'); } catch (error) { setAuthMessage(friendlyFirebaseError(error), 'error'); } });

document.getElementById('registerBtn')?.addEventListener('click', async () => { const email = document.getElementById('loginEmail')?.value?.trim(); const password = document.getElementById('loginPassword')?.value; const role = document.getElementById('roleSelect')?.value || 'Ciudadano'; if (!email || !password) return setAuthMessage('Para registrarte escribe correo y contraseña.', 'error'); setAuthMessage('Registrando usuario...', 'info'); try { await registrarUsuario(email, password, role); setAuthMessage('Registro exitoso. Usuario creado en Firebase.', 'success'); showScreen('homeScreen'); } catch (error) { setAuthMessage(friendlyFirebaseError(error), 'error'); } });

document.getElementById('logoutBtn')?.addEventListener('click', async () => { try { await cerrarSesion(); showScreen('loginScreen'); setAuthMessage('Sesión cerrada.', 'info'); } catch { setAuthMessage('No se pudo cerrar sesión.', 'error'); } });

document.getElementById('sendReport')?.addEventListener('click', async () => { if (!currentUser) { alert('Debes iniciar sesión para enviar un reporte.'); return showScreen('loginScreen'); } const desc = document.getElementById('desc')?.value?.trim(); const tiempo = document.getElementById('incidentTime')?.value || 'No especificado'; if (!desc) { alert('Agrega una descripción del problema.'); return showScreen('reportInfoScreen'); } try { const folio = `#INC-${new Date().getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-5)}`; await crearIncidencia({ folio, tipo: selectedCategoryValue, descripcion: desc, tiempo, gravedad: selectedSeverity, ubicacion: locationLabel, coordenadas: currentLocation, evidenciaNombre: selectedEvidenceName, idCiudadano: currentUser.uid, correoCiudadano: currentUser.email, estado: 'Pendiente', asignadoA: 'Apoyo comunitario' }); alert(`Reporte enviado correctamente: ${folio}`); document.getElementById('incidentForm')?.reset(); selectedEvidenceName = 'Sin archivo'; const evidenceLabel = document.getElementById('evidenceLabel'); if (evidenceLabel) evidenceLabel.textContent = 'Tomar foto o seleccionar imagen'; await loadUserReports(); await loadReportsMap(); showScreen('homeScreen'); } catch (error) { alert(friendlyFirebaseError(error)); } });

document.getElementById('evidenceFile')?.addEventListener('change', event => { const file = event.target.files?.[0]; selectedEvidenceName = file ? file.name : 'Sin archivo'; const evidenceLabel = document.getElementById('evidenceLabel'); if (evidenceLabel) evidenceLabel.textContent = selectedEvidenceName; updateSummary(); });

document.querySelectorAll('.severity button').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.severity button').forEach(btn => btn.classList.remove('active')); button.classList.add('active'); selectedSeverity = button.textContent.trim(); }));

escucharSesion(user => { currentUser = user; const role = document.getElementById('roleSelect')?.value || 'Ciudadano'; if (user) { const name = user.email?.split('@')[0] || 'Usuario'; document.getElementById('homeGreeting') && (document.getElementById('homeGreeting').textContent = `¡Hola, ${name}! 👋`); document.getElementById('profileName') && (document.getElementById('profileName').textContent = name); document.getElementById('profileRole') && (document.getElementById('profileRole').textContent = `${role} activo`); loadUserReports(); } });

const carousel = document.getElementById('incidentCarousel'); const slides = Array.from(document.querySelectorAll('.incident-slide')); const dots = Array.from(document.querySelectorAll('#onboardingDots span')); const title = document.getElementById('onboardingTitle'); const text = document.getElementById('onboardingText'); const nextSlideBtn = document.getElementById('nextSlideBtn'); let currentSlide = 0, startX = 0, currentX = 0, isDragging = false, autoSlideTimer = null;
function updateCarousel(index) { if (!slides.length) return; currentSlide = (index + slides.length) % slides.length; slides.forEach((slide, i) => { slide.classList.toggle('active', i === currentSlide); slide.style.transform = `translateX(${(i - currentSlide) * 100}%)`; }); dots.forEach((dot, i) => dot.classList.toggle('active', i === currentSlide)); const activeSlide = slides[currentSlide]; if (title) title.innerHTML = activeSlide.dataset.title || ''; if (text) text.textContent = activeSlide.dataset.text || ''; }
function nextSlide() { currentSlide === slides.length - 1 ? showScreen('loginScreen') : updateCarousel(currentSlide + 1); }
function previousSlide() { updateCarousel(currentSlide - 1); }
function stopAutoSlide() { if (autoSlideTimer) clearInterval(autoSlideTimer); }
function startAutoSlide() { stopAutoSlide(); autoSlideTimer = setInterval(() => { if (document.getElementById('onboardingScreen')?.classList.contains('active')) updateCarousel(currentSlide + 1); }, 5200); }
function dragTo(distance) { slides.forEach((slide, i) => { slide.style.transition = 'none'; slide.style.transform = `translateX(calc(${(i - currentSlide) * 100}% + ${distance}px))`; }); }
function resetTransition() { slides.forEach(slide => { slide.style.transition = 'transform .36s cubic-bezier(.22,.61,.36,1), opacity .25s ease'; }); }
if (carousel && slides.length) { updateCarousel(0); startAutoSlide(); carousel.addEventListener('touchstart', e => { stopAutoSlide(); isDragging = true; startX = e.touches[0].clientX; currentX = startX; }, { passive: true }); carousel.addEventListener('touchmove', e => { if (!isDragging) return; currentX = e.touches[0].clientX; dragTo(currentX - startX); }, { passive: true }); carousel.addEventListener('touchend', () => { if (!isDragging) return; isDragging = false; resetTransition(); const d = currentX - startX; Math.abs(d) > 55 ? (d < 0 ? updateCarousel(currentSlide + 1) : previousSlide()) : updateCarousel(currentSlide); startAutoSlide(); }); dots.forEach((dot, index) => dot.addEventListener('click', () => { stopAutoSlide(); updateCarousel(index); startAutoSlide(); })); nextSlideBtn?.addEventListener('click', () => { stopAutoSlide(); nextSlide(); startAutoSlide(); }); }

document.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => { selectedCategoryValue = button.dataset.category || selectedCategoryValue; const selected = document.getElementById('selectedCategory'); if (selected) selected.textContent = selectedCategoryValue; }));
document.addEventListener('click', event => { const target = event.target.closest('[data-go]'); if (!target) return; const screenId = target.dataset.go; if (!screenId) return; document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active')); document.getElementById(screenId)?.classList.add('active'); window.scrollTo(0, 0); if (screenId === 'locationScreen') { initMap(); setTimeout(() => mapInstance?.invalidateSize(), 300); } if (screenId === 'mapScreen') { initReportsMap(); setTimeout(() => reportsMapInstance?.invalidateSize(), 300); loadReportsMap(); } if (screenId === 'trackingScreen') renderTrackingScreen(); });
