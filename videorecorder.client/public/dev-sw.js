// public/dev-sw.js
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => self.clients.claim());
// Presence of a fetch handler is still used by Chrome as an installability signal
self.addEventListener('fetch', () => { });
