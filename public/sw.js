self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Empty fetch handler to satisfy PWA installation criteria
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Determine target URL based on clicked action
  const action = event.action || 'ok';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Find an open client page
      const client = clients.find(c => c.visibilityState === 'visible' || 'focus' in c);
      if (client) {
        // If app is already open, post message and focus it
        client.postMessage({ action });
        if ('focus' in client) client.focus();
      } else if (self.clients.openWindow) {
        // If app is closed, open a new window with the action parameter
        return self.clients.openWindow(`/?action=${action}`);
      }
    })
  );
});
