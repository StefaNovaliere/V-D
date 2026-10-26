// Avisos al celular (Web Push). El navegador da una "suscripción" que se
// guarda en push_suscripciones; la Edge Function recordatorios-diarios la usa
// para mandar los avisos.

import { db } from './db/index.js'

const CLAVE_PUBLICA = import.meta.env.VITE_VAPID_PUBLIC_KEY

export function estadoSoporte() {
  if (db.demo) return { ok: false, motivo: 'En la demostración no hay avisos.' }
  if (!CLAVE_PUBLICA) return { ok: false, motivo: 'Falta configurar VITE_VAPID_PUBLIC_KEY (ver README).' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    const esIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    return {
      ok: false,
      motivo: esIos
        ? 'En iPhone los avisos funcionan solo con la app instalada: Safari → Compartir → "Agregar a inicio", y abrila desde el ícono.'
        : 'Este navegador no permite avisos.',
    }
  }
  if (Notification.permission === 'denied') {
    return { ok: false, motivo: 'Los avisos están bloqueados para esta app en la configuración del navegador.' }
  }
  return { ok: true }
}

function claveABytes(base64) {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + relleno).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function registro() {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) throw new Error('La app todavía no terminó de instalarse. Recargá la página y probá de nuevo.')
  return reg
}

export async function suscripcionActual() {
  if (!estadoSoporte().ok) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

export async function activarAvisos() {
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('Sin permiso no se pueden mandar avisos.')
  const reg = await registro()
  const sub = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(CLAVE_PUBLICA) })
  const { endpoint, keys } = sub.toJSON()
  const previas = await db.listar('push_suscripciones', { eq: { endpoint } })
  if (!previas.length) {
    await db.insertar('push_suscripciones', {
      endpoint, p256dh: keys.p256dh, auth: keys.auth,
      dispositivo: navigator.userAgent.slice(0, 120),
    })
  }
}

export async function desactivarAvisos() {
  const sub = await suscripcionActual()
  if (!sub) return
  const previas = await db.listar('push_suscripciones', { eq: { endpoint: sub.endpoint } })
  for (const p of previas) await db.borrar('push_suscripciones', p.id)
  await sub.unsubscribe()
}

/** Muestra un aviso de prueba desde el propio teléfono. */
export async function avisoDePrueba() {
  const reg = await registro()
  await reg.showNotification('Así se ven los avisos', {
    body: 'Vence mañana: Seguro de los camiones. $ 540.000.',
    icon: '/icons/icon-192.png',
    lang: 'es-AR',
  })
}
