import {
  registrarUsuario,
  iniciarSesion,
  cerrarSesion,
  escucharSesion,
  crearIncidencia,
  obtenerIncidenciasPorUsuario
} from './firebase-service.js';

const screens = document.querySelectorAll('.screen');
let currentUser = null;
let selectedCategoryValue = 'Baches en vialidades';
let selectedEvidenceName = 'Sin archivo';
let selectedSeverity = 'Media';
let currentLocation = null;
let locationLabel = 'Ubicación no capturada';

function showScreen(target) {
  screens.forEach(screen => screen.classList.remove('active'));
  document.getElementById(target)?.classList.add('active');
  window.scrollTo(0, 0);

  if (target === 'locationScreen') {
    requestUserLocation();
  }
}

function setAuthMessage(message, type = 'info') {
  const authMessage = document.getElementById('authMessage');
  if (!authMessage) return;
  authMessage.textContent = message;
  authMessage.dataset.type = type;
}

function friendlyFirebaseError(error) {
  const code = error?.code || '';
  if (code.includes('auth/email-already-in-use')) return 'Este correo ya está registrado. Inicia sesión.';
  if (code.includes('auth/invalid-email')) return 'El correo electrónico no es válido.';
  if (code.includes('auth/weak-password')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password') || code.includes('auth/user-not-found')) return 'Correo o contraseña incorrectos.';
  if (code.includes('permission-denied')) return 'No tienes permisos para realizar esta acción. Revisa las reglas de Firestore.';
  return 'Ocurrió un error. Intenta nuevamente.';
}

function updateLocationUI(message) {
  const mapSmall = document.querySelector('#locationScreen .mini-map small');
  const summaryLocation = document.getElementById('summaryLocation');
  if (mapSmall) mapSmall.innerHTML = message.replaceAll('\n', '<br>');
  if (summaryLocation) summaryLocation.textContent = message.replaceAll('\n', ' · ');
}

function requestUserLocation() {
  if (!navigator.geolocation) {
    locationLabel = 'Geolocalización no disponible en este dispositivo';
    updateLocationUI(locationLabel);
    return;
  }

  locationLabel = 'Solicitando ubicación GPS...';
  updateLocationUI(locationLabel);

  navigator.geolocation.getCurrentPosition(
    position => {
      const { latitude, longitude, accuracy } = position.coords;
      currentLocation = {
        latitud: latitude,
        longitud: longitude,
        precisionMetros: Math.round(accuracy || 0)
      };
      locationLabel = `Ubicación capturada\nLat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}\nPrecisión: ${Math.round(accuracy || 0)} m`;
      updateLocationUI(locationLabel);
    },
    error => {
      currentLocation = null;
      if (error.code === 1) locationLabel = 'Permiso de ubicación denegado';
      else if (error.code === 2) locationLabel = 'No se pudo obtener la ubicación';
      else locationLabel = 'Tiempo de espera agotado al obtener ubicación';
      updateLocationUI(locationLabel);
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0
    }
  );
}

async function loadUserReports() {
  const reportsList = document.getElementById('reportsList');
  if (!reportsList || !currentUser) return;

  reportsList.innerHTML = '<div class="report-card"><span class="icon cyan">⏳</span><div><b>Cargando reportes...</b><small>Consultando Firestore</small></div></div>';

  try {
    const reports = await obtenerIncidenciasPorUsuario(currentUser.uid);
    if (!reports.length) {
      reportsList.innerHTML = '<div class="report-card"><span class="icon green">ℹ️</span><div><b>Sin reportes todavía</b><small>Crea tu primera incidencia</small></div><span>›</span></div>';
      return;
    }

    reportsList.innerHTML = reports.slice(0, 5).map(report => `
      <div class="report-card" data-go="trackingScreen">
        <span class="icon cyan">${getCategoryIcon(report.tipo)}</span>
        <div>
          <b>${report.folio || report.tipo || 'Incidencia'}</b>
          <small>${report.estado || 'Pendiente'} · ${report.ubicacion || 'Sin ubicación'}</small>
        </div>
        <span>›</span>
      </div>
    `).join('');

    reportsList.querySelectorAll('[data-go]').forEach(card => {
      card.addEventListener('click', () => showScreen(card.dataset.go));
    });
  } catch (error) {
    reportsList.innerHTML = '<div class="report-card"><span class="icon orange">⚠️</span><div><b>No se pudieron cargar los reportes</b><small>Revisa conexión o reglas de Firestore</small></div></div>';
  }
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

function updateSummary() {
  const desc = document.getElementById('desc')?.value?.trim() || 'Completa la descripción del problema.';
  const summaryDesc = document.getElementById('summaryDesc');
  const summaryEvidence = document.getElementById('summaryEvidence');
  const selectedCategory = document.getElementById('selectedCategory');
  const summaryLocation = document.getElementById('summaryLocation');

  if (summaryDesc) summaryDesc.textContent = desc;
  if (summaryEvidence) summaryEvidence.textContent = selectedEvidenceName;
  if (selectedCategory) selectedCategory.textContent = selectedCategoryValue;
  if (summaryLocation) summaryLocation.textContent = locationLabel.replaceAll('\n', ' · ');
}

document.querySelectorAll('[data-go]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.go === 'confirmScreen') updateSummary();
    showScreen(btn.dataset.go);
  });
});

document.getElementById('loginForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const email = document.getElementById('loginEmail')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value;

  if (!email || !password) {
    setAuthMessage('Escribe correo y contraseña.', 'error');
    return;
  }

  setAuthMessage('Iniciando sesión...', 'info');
  try {
    await iniciarSesion(email, password);
    setAuthMessage('Sesión iniciada correctamente.', 'success');
    showScreen('homeScreen');
  } catch (error) {
    setAuthMessage(friendlyFirebaseError(error), 'error');
  }
});

document.getElementById('registerBtn')?.addEventListener('click', async () => {
  const email = document.getElementById('loginEmail')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value;

  if (!email || !password) {
    setAuthMessage('Para registrarte escribe correo y contraseña.', 'error');
    return;
  }

  setAuthMessage('Registrando usuario...', 'info');
  try {
    await registrarUsuario(email, password, document.getElementById('roleSelect')?.value || 'Ciudadano');
    setAuthMessage('Registro exitoso. Bienvenida a Conecta Martínez.', 'success');
    showScreen('homeScreen');
  } catch (error) {
    setAuthMessage(friendlyFirebaseError(error), 'error');
  }
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  try {
    await cerrarSesion();
    showScreen('loginScreen');
    setAuthMessage('Sesión cerrada.', 'info');
  } catch (error) {
    setAuthMessage('No se pudo cerrar sesión.', 'error');
  }
});

document.getElementById('sendReport')?.addEventListener('click', async () => {
  if (!currentUser) {
    alert('Debes iniciar sesión para enviar un reporte.');
    showScreen('loginScreen');
    return;
  }

  const desc = document.getElementById('desc')?.value?.trim();
  const tiempo = document.getElementById('incidentTime')?.value || 'No especificado';

  if (!desc) {
    alert('Agrega una descripción del problema.');
    showScreen('reportInfoScreen');
    return;
  }

  try {
    const folio = `#INC-${new Date().getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-5)}`;
    await crearIncidencia({
      folio,
      tipo: selectedCategoryValue,
      descripcion: desc,
      tiempo,
      gravedad: selectedSeverity,
      ubicacion: locationLabel,
      coordenadas: currentLocation,
      evidenciaNombre: selectedEvidenceName,
      idCiudadano: currentUser.uid,
      correoCiudadano: currentUser.email,
      estado: 'Pendiente',
      asignadoA: 'Apoyo comunitario'
    });

    alert(`Reporte enviado correctamente: ${folio}`);
    document.getElementById('incidentForm')?.reset();
    selectedEvidenceName = 'Sin archivo';
    const evidenceLabel = document.getElementById('evidenceLabel');
    if (evidenceLabel) evidenceLabel.textContent = 'Tomar foto o seleccionar imagen';
    await loadUserReports();
    showScreen('homeScreen');
  } catch (error) {
    alert(friendlyFirebaseError(error));
  }
});

document.getElementById('evidenceFile')?.addEventListener('change', event => {
  const file = event.target.files?.[0];
  selectedEvidenceName = file ? file.name : 'Sin archivo';
  const evidenceLabel = document.getElementById('evidenceLabel');
  if (evidenceLabel) evidenceLabel.textContent = selectedEvidenceName;
  updateSummary();
});

document.querySelectorAll('.severity button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.severity button').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
    selectedSeverity = button.textContent.trim();
  });
});

escucharSesion(user => {
  currentUser = user;
  const homeGreeting = document.getElementById('homeGreeting');
  const profileName = document.getElementById('profileName');
  const profileRole = document.getElementById('profileRole');
  const role = document.getElementById('roleSelect')?.value || 'Ciudadano';

  if (user) {
    const name = user.email?.split('@')[0] || 'Usuario';
    if (homeGreeting) homeGreeting.textContent = `¡Hola, ${name}! 👋`;
    if (profileName) profileName.textContent = name;
    if (profileRole) profileRole.textContent = `${role} activo`;
    loadUserReports();
  }
});

const carousel = document.getElementById('incidentCarousel');
const slides = Array.from(document.querySelectorAll('.incident-slide'));
const dots = Array.from(document.querySelectorAll('#onboardingDots span'));
const title = document.getElementById('onboardingTitle');
const text = document.getElementById('onboardingText');
const nextSlideBtn = document.getElementById('nextSlideBtn');
let currentSlide = 0;
let startX = 0;
let currentX = 0;
let isDragging = false;
let autoSlideTimer = null;

function updateCarousel(index) {
  if (!slides.length) return;
  currentSlide = (index + slides.length) % slides.length;
  slides.forEach((slide, i) => {
    slide.classList.toggle('active', i === currentSlide);
    slide.style.transform = `translateX(${(i - currentSlide) * 100}%)`;
  });
  dots.forEach((dot, i) => dot.classList.toggle('active', i === currentSlide));
  const activeSlide = slides[currentSlide];
  if (title) title.innerHTML = activeSlide.dataset.title || '';
  if (text) text.textContent = activeSlide.dataset.text || '';
}

function nextSlide() {
  if (currentSlide === slides.length - 1) {
    showScreen('loginScreen');
    return;
  }
  updateCarousel(currentSlide + 1);
}

function previousSlide() {
  updateCarousel(currentSlide - 1);
}

function stopAutoSlide() {
  if (autoSlideTimer) clearInterval(autoSlideTimer);
}

function startAutoSlide() {
  stopAutoSlide();
  autoSlideTimer = setInterval(() => {
    if (document.getElementById('onboardingScreen')?.classList.contains('active')) {
      updateCarousel(currentSlide + 1);
    }
  }, 5200);
}

function dragTo(distance) {
  slides.forEach((slide, i) => {
    slide.style.transition = 'none';
    slide.style.transform = `translateX(calc(${(i - currentSlide) * 100}% + ${distance}px))`;
  });
}

function resetTransition() {
  slides.forEach(slide => {
    slide.style.transition = 'transform .36s cubic-bezier(.22,.61,.36,1), opacity .25s ease';
  });
}

if (carousel && slides.length) {
  updateCarousel(0);
  startAutoSlide();

  carousel.addEventListener('touchstart', event => {
    stopAutoSlide();
    isDragging = true;
    startX = event.touches[0].clientX;
    currentX = startX;
  }, { passive: true });

  carousel.addEventListener('touchmove', event => {
    if (!isDragging) return;
    currentX = event.touches[0].clientX;
    dragTo(currentX - startX);
  }, { passive: true });

  carousel.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    resetTransition();
    const distance = currentX - startX;
    Math.abs(distance) > 55 ? (distance < 0 ? updateCarousel(currentSlide + 1) : previousSlide()) : updateCarousel(currentSlide);
    startAutoSlide();
  });

  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      stopAutoSlide();
      updateCarousel(index);
      startAutoSlide();
    });
  });

  nextSlideBtn?.addEventListener('click', () => {
    stopAutoSlide();
    nextSlide();
    startAutoSlide();
  });
}

document.querySelectorAll('[data-category]').forEach(button => {
  button.addEventListener('click', () => {
    selectedCategoryValue = button.dataset.category || selectedCategoryValue;
    const selected = document.getElementById('selectedCategory');
    if (selected) selected.textContent = selectedCategoryValue;
  });
});
