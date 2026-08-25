// Service worker mínimo — necesario para que el navegador ofrezca
// "Agregar a pantalla de inicio" como una app instalable.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
self.addEventListener('fetch', (event) => {
  // Simplemente deja pasar todas las peticiones a la red normal.
  event.respondWith(fetch(event.request));
});
