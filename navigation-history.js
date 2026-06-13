/* =========================================================
   ConectaMartínez - Historial de navegación móvil
   ---------------------------------------------------------
   Permite que el botón físico Atrás de Android regrese a la
   pantalla anterior dentro de la app, en lugar de cerrar la
   página o volver siempre al inicio.
   ========================================================= */

const NAVIGATION_STORAGE_KEY = 'conectaNavigationStack';
const DEFAULT_SCREEN = 'splashScreen';
const LOGIN_SCREEN = 'loginScreen';

let navigationStack = [];
let restoringFromBrowserBack = false;
let internalNavigation = false;

function getActiveScreenId() {
  return document.querySelector('.screen.active')?.id || DEFAULT_SCREEN;
}

function screenExists(screenId) {
  return Boolean(document.getElementById(screenId));
}

function showScreen(screenId) {
  if (!screenExists(screenId)) return false;

  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });

  document.getElementById(screenId)?.classList.add('active');
  window.scrollTo(0, 0);

  setActiveBottomNav(screenId);
  return true;
}

function setActiveBottomNav(screenId) {
  document.querySelectorAll('.bottom-nav button').forEach(button => {
    const destination = button.dataset.go;
    button.classList.toggle('active', destination === screenId || (!destination && button.textContent.trim().toLowerCase().includes('mapa') && screenId === 'mapScreen'));
  });
}

function saveStack() {
  try {
    sessionStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify(navigationStack));
  } catch {
    // SessionStorage no disponible. No es crítico.
  }
}

function loadStack() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(NAVIGATION_STORAGE_KEY) || '[]');
    navigationStack = Array.isArray(stored) ? stored.filter(screenExists) : [];
  } catch {
    navigationStack = [];
  }
}

function pushScreen(screenId) {
  if (!screenExists(screenId)) return;

  const current = getActiveScreenId();

  if (current && current !== screenId) {
    const last = navigationStack[navigationStack.length - 1];
    if (last !== current) navigationStack.push(current);
  }

  saveStack();

  if (!restoringFromBrowserBack) {
    internalNavigation = true;
    history.pushState({ screenId }, '', `#${screenId}`);
    internalNavigation = false;
  }
}

function navigateTo(screenId, options = {}) {
  if (!screenExists(screenId)) return false;

  if (!options.replace) {
    pushScreen(screenId);
  }

  return showScreen(screenId);
}

function goBackInsideApp() {
  const previous = navigationStack.pop();
  saveStack();

  if (previous && screenExists(previous)) {
    restoringFromBrowserBack = true;
    showScreen(previous);
    restoringFromBrowserBack = false;
    return true;
  }

  const active = getActiveScreenId();

  if (active && ![DEFAULT_SCREEN, LOGIN_SCREEN].includes(active)) {
    restoringFromBrowserBack = true;
    showScreen(window.isAdminUser?.() ? 'adminScreen' : LOGIN_SCREEN);
    restoringFromBrowserBack = false;
    return true;
  }

  return false;
}

function patchGlobalNavigation() {
  const originalGoAdminPanel = window.goAdminPanel;

  if (typeof originalGoAdminPanel === 'function') {
    window.goAdminPanel = function patchedGoAdminPanel(...args) {
      pushScreen('adminScreen');
      return originalGoAdminPanel.apply(this, args);
    };
  }

  const originalForceAdminPanel = window.forceAdminPanel;

  if (typeof originalForceAdminPanel === 'function') {
    window.forceAdminPanel = function patchedForceAdminPanel(...args) {
      const current = getActiveScreenId();
      const result = originalForceAdminPanel.apply(this, args);
      if (current !== 'adminScreen' && document.getElementById('adminScreen')?.classList.contains('active')) {
        const last = navigationStack[navigationStack.length - 1];
        if (last !== current) navigationStack.push(current);
        saveStack();
      }
      return result;
    };
  }
}

function interceptDataGoNavigation() {
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-go]');
    if (!trigger) return;

    const destination = trigger.dataset.go;
    if (!destination || !screenExists(destination)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    navigateTo(destination);
  }, true);
}

function watchClassNavigation() {
  let lastActive = getActiveScreenId();

  const observer = new MutationObserver(() => {
    const current = getActiveScreenId();

    if (!current || current === lastActive) return;
    if (restoringFromBrowserBack || internalNavigation) {
      lastActive = current;
      return;
    }

    const last = navigationStack[navigationStack.length - 1];
    if (last !== lastActive && lastActive !== current) {
      navigationStack.push(lastActive);
      saveStack();
    }

    history.replaceState({ screenId: current }, '', `#${current}`);
    lastActive = current;
  });

  document.querySelectorAll('.screen').forEach(screen => {
    observer.observe(screen, {
      attributes: true,
      attributeFilter: ['class']
    });
  });
}

function setupBrowserBackButton() {
  if (!history.state?.screenId) {
    history.replaceState({ screenId: getActiveScreenId() }, '', `#${getActiveScreenId()}`);
  }

  window.addEventListener('popstate', event => {
    const handled = goBackInsideApp();

    if (handled) {
      const active = getActiveScreenId();
      history.replaceState({ screenId: active }, '', `#${active}`);
      return;
    }

    const targetScreen = event.state?.screenId;
    if (targetScreen && screenExists(targetScreen)) {
      showScreen(targetScreen);
    }
  });
}

function resetNavigationOnLogout() {
  document.addEventListener('click', event => {
    const logoutButton = event.target.closest('#logoutBtn, .logout, [data-admin-logout]');
    if (!logoutButton) return;

    navigationStack = [];
    saveStack();
    history.replaceState({ screenId: LOGIN_SCREEN }, '', `#${LOGIN_SCREEN}`);
  }, true);
}

window.navigateToScreen = navigateTo;
window.goBackInsideApp = goBackInsideApp;

window.addEventListener('load', () => {
  loadStack();
  interceptDataGoNavigation();
  patchGlobalNavigation();
  watchClassNavigation();
  setupBrowserBackButton();
  resetNavigationOnLogout();
});
