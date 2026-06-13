/* =========================================================
   ConectaMartínez - Limpieza visual del panel Superadmin
   ---------------------------------------------------------
   Evita que el CRUD de administradores se vea repetido fuera
   de Panel > Administradores y deja el resumen principal limpio.
   ========================================================= */

const SUPERADMIN_EMAIL = 'adminp@gmail.com';
let cleanObserver = null;
let cleanInterval = null;

function normalize(value = '') {
  return String(value || '').trim().toLowerCase();
}

function getStoredProfile() {
  try {
    return JSON.parse(localStorage.getItem('conectaPerfil') || '{}');
  } catch {
    return {};
  }
}

function currentEmail() {
  const profile = getStoredProfile();
  return normalize(profile.correo || profile.email || document.getElementById('loginEmail')?.value || '');
}

function currentRole() {
  const profile = getStoredProfile();
  return normalize(profile.rol || '');
}

function isSuperadmin() {
  return currentEmail() === SUPERADMIN_EMAIL || currentRole().includes('superadmin');
}

function injectCleanStyle() {
  if (document.getElementById('superadminCleanLayoutStyle')) return;

  const style = document.createElement('style');
  style.id = 'superadminCleanLayoutStyle';
  style.textContent = `
    body.superadmin-clean-panel #adminScreen .quick-grid {
      display: none !important;
    }

    body.superadmin-clean-panel #adminCleanRoot {
      margin-top: 12px;
    }

    body.superadmin-clean-panel #adminCleanRoot > .admin-clean-tab {
      display: none !important;
    }

    body.superadmin-clean-panel #adminCleanRoot > .admin-clean-tab.superadmin-section-active {
      display: block !important;
    }

    body.superadmin-clean-panel #adminManagersTab .admin-crud-section {
      display: none !important;
    }

    body.superadmin-clean-panel #adminManagersTab .admin-crud-section.superadmin-crud-active {
      display: block !important;
    }

    body.superadmin-clean-panel #adminSummaryTab > #superadminMovementPanel,
    body.superadmin-clean-panel #adminSummaryTab > #superadminNotificationsPanel {
      display: none !important;
    }

    body.superadmin-clean-panel #adminSummaryTab .admin-data-card {
      margin-top: 14px;
    }

    body.superadmin-clean-panel .admin-window-tabs {
      position: sticky;
      top: 0;
      z-index: 6;
      padding: 8px 0;
      backdrop-filter: blur(12px);
    }

    body.superadmin-clean-panel #adminManagersTab .admin-clean-note {
      display: block;
      padding: 12px 14px;
      margin: 10px 0 12px;
      border-radius: 16px;
      background: rgba(255, 255, 255, .08);
      color: #dbe7ff;
      font-size: 13px;
      line-height: 1.4;
    }
  `;

  document.head.appendChild(style);
}

function sectionId(tabName) {
  return {
    summary: 'adminSummaryTab',
    incidents: 'adminIncidentsTab',
    admins: 'adminManagersTab',
    users: 'adminUsersTab'
  }[tabName] || 'adminSummaryTab';
}

function crudId(tabName) {
  return {
    list: 'adminCrudList',
    form: 'adminCrudForm',
    history: 'adminCrudHistory'
  }[tabName] || 'adminCrudList';
}

function currentPanelTab() {
  const active = document.querySelector('#adminCleanRoot [data-admin-tab].active')?.dataset.adminTab;
  return active || localStorage.getItem('superadminActivePanelTab') || 'summary';
}

function currentCrudTab() {
  const active = document.querySelector('#adminManagersTab [data-admin-crud-tab].active')?.dataset.adminCrudTab;
  return active || localStorage.getItem('superadminActiveCrudTab') || 'list';
}

function applyPanelTab(tabName = currentPanelTab()) {
  const finalTab = ['summary', 'incidents', 'admins', 'users'].includes(tabName) ? tabName : 'summary';
  localStorage.setItem('superadminActivePanelTab', finalTab);

  ['summary', 'incidents', 'admins', 'users'].forEach(name => {
    const section = document.getElementById(sectionId(name));
    if (!section) return;

    const active = name === finalTab;
    section.classList.toggle('superadmin-section-active', active);
    section.hidden = !active;
    section.style.display = active ? '' : 'none';
  });

  document.querySelectorAll('#adminCleanRoot [data-admin-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.adminTab === finalTab);
  });

  if (finalTab === 'admins') {
    applyCrudTab(currentCrudTab());
    document.getElementById('adminManagersTab')?.querySelector('#adminCleanManagers')?.closest('.admin-crud-section')?.classList.add('superadmin-crud-active');
  } else {
    ['adminCrudList', 'adminCrudForm', 'adminCrudHistory'].forEach(id => {
      const section = document.getElementById(id);
      if (!section) return;
      section.classList.remove('superadmin-crud-active');
      section.hidden = true;
      section.style.display = 'none';
    });
  }
}

function applyCrudTab(tabName = currentCrudTab()) {
  const finalTab = ['list', 'form', 'history'].includes(tabName) ? tabName : 'list';
  localStorage.setItem('superadminActiveCrudTab', finalTab);

  ['list', 'form', 'history'].forEach(name => {
    const section = document.getElementById(crudId(name));
    if (!section) return;

    const active = name === finalTab;
    section.classList.toggle('superadmin-crud-active', active);
    section.hidden = !active;
    section.style.display = active ? '' : 'none';
  });

  document.querySelectorAll('#adminManagersTab [data-admin-crud-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.adminCrudTab === finalTab);
  });
}

function removeRepeatedAdminCrud() {
  const managersTab = document.getElementById('adminManagersTab');
  if (!managersTab) return;

  ['adminCleanManagers', 'adminCleanForm', 'adminAccessHistory'].forEach(id => {
    document.querySelectorAll(`#${id}`).forEach(element => {
      if (!managersTab.contains(element)) {
        const wrapper = element.closest('.admin-crud-section, .admin-data-card, .admin-live-list, section, div');
        (wrapper || element).remove();
      }
    });
  });

  document.querySelectorAll('#adminManagersRegistered, #adminManagersActive, #adminManagersInactive').forEach(element => {
    if (!managersTab.contains(element)) {
      const wrapper = element.closest('.admin-mini-metrics, .admin-data-card, section, div');
      (wrapper || element).remove();
    }
  });
}

function addAdminCleanNote() {
  const managersTab = document.getElementById('adminManagersTab');
  if (!managersTab || document.getElementById('adminCleanOnlyHereNote')) return;

  const note = document.createElement('small');
  note.id = 'adminCleanOnlyHereNote';
  note.className = 'admin-clean-note';
  note.textContent = 'La gestión de administradores se muestra únicamente en esta pestaña para mantener limpio el Panel principal.';

  const metrics = managersTab.querySelector('.admin-mini-metrics');
  managersTab.insertBefore(note, metrics?.nextSibling || managersTab.firstChild);
}

function keepSummaryMinimal() {
  const summary = document.getElementById('adminSummaryTab');
  if (!summary) return;

  document.getElementById('superadminMovementPanel')?.remove();
  document.getElementById('superadminNotificationsPanel')?.remove();

  const title = summary.querySelector('.section-title h3');
  if (title) title.textContent = 'Resumen principal';
}

function bindCleanEvents() {
  if (window.__superadminCleanLayoutEvents) return;
  window.__superadminCleanLayoutEvents = true;

  document.addEventListener('click', event => {
    const panelButton = event.target.closest('[data-admin-tab]');
    if (panelButton) {
      localStorage.setItem('superadminActivePanelTab', panelButton.dataset.adminTab || 'summary');
      setTimeout(() => applyPanelTab(panelButton.dataset.adminTab), 80);
      return;
    }

    const crudButton = event.target.closest('[data-admin-crud-tab]');
    if (crudButton) {
      localStorage.setItem('superadminActiveCrudTab', crudButton.dataset.adminCrudTab || 'list');
      setTimeout(() => applyCrudTab(crudButton.dataset.adminCrudTab), 80);
    }
  });
}

function applyCleanLayout() {
  if (!isSuperadmin()) return;

  document.body.classList.add('superadmin-clean-panel');
  injectCleanStyle();
  removeRepeatedAdminCrud();
  keepSummaryMinimal();
  addAdminCleanNote();
  applyPanelTab(currentPanelTab());
}

export function startSuperadminCleanLayout() {
  if (!isSuperadmin()) return;

  bindCleanEvents();
  applyCleanLayout();

  if (!cleanObserver) {
    cleanObserver = new MutationObserver(() => applyCleanLayout());
    cleanObserver.observe(document.body, { childList: true, subtree: true });
  }

  if (!cleanInterval) {
    cleanInterval = setInterval(applyCleanLayout, 1600);
  }
}

export function stopSuperadminCleanLayout() {
  cleanObserver?.disconnect();
  cleanObserver = null;

  if (cleanInterval) clearInterval(cleanInterval);
  cleanInterval = null;

  document.body.classList.remove('superadmin-clean-panel');
}

window.startSuperadminCleanLayout = startSuperadminCleanLayout;
window.stopSuperadminCleanLayout = stopSuperadminCleanLayout;
window.addEventListener('load', () => setTimeout(startSuperadminCleanLayout, 1900));
