/* Ajustes visuales ligeros para filtros y mapa */
(function () {
  const styleId = 'conecta-ui-cleanup-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .date-filter-field {
        display: grid;
        gap: 6px;
        color: var(--muted, #c7d2fe);
        font-size: .82rem;
        font-weight: 900;
        letter-spacing: .02em;
      }
      .date-filter-field input[type="date"] {
        min-height: 46px;
      }
      .filter-grid .date-filter-field {
        min-width: 0;
      }
      .map-box .empty-state small,
      #interactiveMap .empty-state small {
        display: block;
        margin-top: 6px;
      }
      .conecta-marker {
        display: grid;
        place-items: center;
        width: 34px !important;
        height: 34px !important;
        border-radius: 50%;
        background: rgba(7, 19, 60, .92);
        border: 2px solid rgba(46, 168, 255, .9);
        box-shadow: 0 10px 22px rgba(0,0,0,.32);
      }
    `;
    document.head.appendChild(style);
  }

  function wrapDateInput(input, labelText) {
    if (!input || input.closest('.date-filter-field')) return;
    const wrapper = document.createElement('label');
    wrapper.className = 'date-filter-field';
    wrapper.textContent = labelText;
    wrapper.setAttribute('aria-label', labelText);
    input.setAttribute('aria-label', labelText);
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
  }

  function polishFilters() {
    wrapDateInput(document.getElementById('filterFechaInicio'), 'Fecha inicial');
    wrapDateInput(document.getElementById('filterFechaFin'), 'Fecha final');
  }

  document.addEventListener('DOMContentLoaded', polishFilters);
  document.addEventListener('input', polishFilters, true);
  document.addEventListener('change', polishFilters, true);
  new MutationObserver(polishFilters).observe(document.body, { childList: true, subtree: true });
  polishFilters();
})();
