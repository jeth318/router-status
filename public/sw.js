self.addEventListener('push', (event) => {
  const d = event.data?.json() ?? { title: 'Router Status', body: '' };
  event.waitUntil(self.registration.showNotification(d.title, { body: d.body, tag: d.tag, data: { url: d.url } }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  if (url) event.waitUntil(clients.openWindow(url));
});
