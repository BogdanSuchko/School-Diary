self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
    const options = {
        body: event.data.text(),
        icon: '/static/images/icon.png',
        badge: '/static/images/badge.png',
        vibrate: [200, 100, 200],
        tag: 'homework-reminder',
        renotify: true,
        actions: [
            { action: 'open', title: 'Открыть дневник' },
            { action: 'close', title: 'Закрыть' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification('Электронный дневник', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.matchAll({ type: 'window' }).then(windowClients => {
                for (let client of windowClients) {
                    if (client.url === '/' && 'focus' in client) {
                        return client.focus();
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
        );
    }
}); 