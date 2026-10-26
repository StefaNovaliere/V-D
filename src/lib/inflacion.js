// IPC nacional nivel general del INDEC (base dic-2016), desde la API pública
// de series de tiempo de datos.gob.ar. Se pide por /api/ipc, que Vercel (y
// Vite en desarrollo) reenvían a la API: así no depende de que la API permita
// pedidos desde el navegador.
//
// Se guarda medio día en el navegador: el dato cambia una vez por mes.

const CLAVE = 'cuentas-ipc-v1'
const VIGENCIA_MS = 12 * 60 * 60 * 1000

function leerCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE) || 'null')
    if (c && Date.now() - c.guardado < VIGENCIA_MS) return c.ipc
  } catch {
    // sin cache
  }
  return null
}

/** Devuelve { 'aaaa-mm': índice } o null si no se pudo conseguir. */
export async function traerIpc() {
  const cache = leerCache()
  if (cache) return cache
  try {
    const r = await fetch('/api/ipc', { signal: AbortSignal.timeout(10000) })
    if (!r.ok) return null
    const json = await r.json()
    const ipc = {}
    for (const [fecha, valor] of json?.data ?? []) {
      if (typeof fecha === 'string' && Number(valor) > 0) ipc[fecha.slice(0, 7)] = Number(valor)
    }
    if (Object.keys(ipc).length < 2) return null
    try {
      localStorage.setItem(CLAVE, JSON.stringify({ guardado: Date.now(), ipc }))
    } catch {
      // sin almacenamiento: se vuelve a pedir la próxima vez
    }
    return ipc
  } catch {
    return null
  }
}
