// Se suma al service worker que genera vite-plugin-pwa (workbox.importScripts).
// Muestra los avisos que manda la Edge Function recordatorios-diarios y, al
// tocarlos, abre la app en la pantalla que corresponde.

self.addEventListener('push', (evento) => {
  let datos = {}
  try {
    datos = evento.data ? evento.data.json() : {}
  } catch {
    datos = { title: 'Cuentas de la familia', body: evento.data ? evento.data.text() : '' }
  }
  evento.waitUntil(
    self.registration.showNotification(datos.title || 'Cuentas de la familia', {
      body: datos.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: datos.tag,
      data: { url: datos.url || '/' },
      lang: 'es-AR',
    }),
  )
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const url = new URL(evento.notification.data?.url || '/', self.location.origin).href
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if ('focus' in v) {
          v.navigate(url)
          return v.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
