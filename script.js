const screens = document.querySelectorAll('.screen');

function showScreen(target) {
  screens.forEach(screen => screen.classList.remove('active'));
  document.getElementById(target)?.classList.add('active');
  window.scrollTo(0, 0);
}

document.querySelectorAll('[data-go]').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.go));
});

document.getElementById('loginForm')?.addEventListener('submit', event => {
  event.preventDefault();
  showScreen('homeScreen');
});

document.getElementById('sendReport')?.addEventListener('click', () => {
  alert('Reporte enviado correctamente');
  showScreen('trackingScreen');
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
    if (Math.abs(distance) > 55) {
      distance < 0 ? updateCarousel(currentSlide + 1) : previousSlide();
    } else {
      updateCarousel(currentSlide);
    }
    startAutoSlide();
  });

  carousel.addEventListener('mousedown', event => {
    stopAutoSlide();
    isDragging = true;
    startX = event.clientX;
    currentX = startX;
  });

  window.addEventListener('mousemove', event => {
    if (!isDragging) return;
    currentX = event.clientX;
    dragTo(currentX - startX);
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    resetTransition();
    const distance = currentX - startX;
    if (Math.abs(distance) > 55) {
      distance < 0 ? updateCarousel(currentSlide + 1) : previousSlide();
    } else {
      updateCarousel(currentSlide);
    }
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
    const selected = document.getElementById('selectedCategory');
    if (selected) selected.textContent = button.dataset.category;
  });
});
