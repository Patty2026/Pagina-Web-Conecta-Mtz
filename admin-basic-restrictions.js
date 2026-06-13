/* Restricciones visuales para Administrador básico */
(function () {
  function isBasicAdmin() {
    return window.getCurrentAdminRole?.() === 'Administrador';
  }

  function applyBasicAdminRestrictions() {
    if (!window.isAdminUser?.()) return;

    const isBasic = isBasicAdmin();

    document.querySelectorAll('[data-superadmin-only]').forEach(item => {
      item.style.display = isBasic ? 'none' : '';
    });

    if (!isBasic) return;

    const usersCards = [
      '#adminUsersList',
      '#adminUsersCount',
      '#adminManagersWindow',
      '#adminManagersList',
      '#adminAccessHistory'
    ];

    usersCards.forEach(selector => {
      const element = document.querySelector(selector);
      const card = element?.closest('article, div, section');
      if (card) card.style.display = 'none';
    });

    document.querySelectorAll('h3, small, b').forEach(element => {
      const text = element.textContent.toLowerCase();
      if (text.includes('usuarios registrados') || text.includes('administradores')) {
        const card = element.closest('article, section, div');
        if (card) card.style.display = 'none';
      }
    });

    const description = document.getElementById('adminRoleDescription');
    if (description) {
      description.textContent = 'Acceso operativo: consulta de incidentes, ubicaciones, mapa y estados en tiempo real.';
    }
  }

  window.applyBasicAdminRestrictions = applyBasicAdminRestrictions;

  window.addEventListener('load', () => {
    setInterval(applyBasicAdminRestrictions, 900);
  });
})();
