// Minimal service worker so browsers offer "Install app". It doesn't cache anything:
// the dashboard always loads fresh prices from the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
