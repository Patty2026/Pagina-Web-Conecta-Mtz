/* Cargador de módulos extra de ConectaMartínez */

function loadScriptOnce(src, options = {}) {
  if (document.querySelector(`script[src="${src}"]`)) return;

  const script = document.createElement('script');
  script.src = src;

  if (options.type) script.type = options.type;
  if (options.defer) script.defer = true;

  document.body.appendChild(script);
}

window.addEventListener('load', () => {
  loadScriptOnce('./navigation-history.js', { defer: true });
});
