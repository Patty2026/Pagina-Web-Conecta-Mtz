function isSuperadminRole() {
  return window.getCurrentAdminRole?.() === 'Superadmin';
}

function enforceSuperadminVisibility() {
  const isSuper = isSuperadminRole();

  document.querySelectorAll('[data-superadmin-only]').forEach(element => {
    element.style.display = isSuper ? '' : 'none';
    element.hidden = !isSuper;
  });

  const managersTab = document.querySelector('[data-admin-window="adminManagersWindow"]');
  const managersWindow = document.getElementById('adminManagersWindow');

  if (!isSuper) {
    if (managersTab) {
      managersTab.style.display = 'none';
      managersTab.hidden = true;
      managersTab.classList.remove('active');
    }

    if (managersWindow) {
      managersWindow.style.display = 'none';
      managersWindow.hidden = true;
    }

    const incidentsWindow = document.getElementById('adminIncidentsWindow');
    const incidentsTab = document.querySelector('[data-admin-window="adminIncidentsWindow"]');

    if (incidentsWindow) {
      incidentsWindow.style.display = '';
      incidentsWindow.hidden = false;
    }

    if (incidentsTab) {
      incidentsTab.classList.add('active');
    }
  }
}

function blockBasicAdminManagersAccess() {
  document.addEventListener('click', event => {
    const managersButton = event.target.closest('[data-admin-window="adminManagersWindow"]');
    if (!managersButton) return;

    if (!isSuperadminRole()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      enforceSuperadminVisibility();
      alert('La pestaña Administradores solo está disponible para Superadmin.');
    }
  }, true);
}

window.enforceSuperadminVisibility = enforceSuperadminVisibility;

window.addEventListener('load', () => {
  blockBasicAdminManagersAccess();
  setInterval(enforceSuperadminVisibility, 700);
  setTimeout(enforceSuperadminVisibility, 500);
  setTimeout(enforceSuperadminVisibility, 1500);
});
