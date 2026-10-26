import { createClient } from '@supabase/supabase-js'

// PostgREST devuelve como máximo 1000 filas por consulta; un año de
// movimientos de la familia puede pasarse, así que se pide por páginas.
const PAGINA = 1000

// Columna única para ordenar y paginar sin que las páginas se pisen. Las
// tablas que no tienen `id` usan su clave primaria.
const CLAVE_ORDEN = { configuracion: 'household_id', household_members: 'user_id' }

function traducirError(error) {
  const msg = error?.message || String(error)
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return new Error('No hay conexión. Revisá internet y probá de nuevo.')
  }
  if (/Invalid login credentials/i.test(msg)) {
    return new Error('El email o la contraseña no son correctos.')
  }
  if (/Email not confirmed/i.test(msg)) {
    return new Error('Falta confirmar el email de esta cuenta.')
  }
  if (/JWT expired|invalid JWT/i.test(msg)) {
    return new Error('La sesión venció. Volvé a entrar.')
  }
  return new Error(msg)
}

function aplicarFiltros(q, { eq = {}, gte = {}, lte = {}, no = {} }) {
  for (const [k, v] of Object.entries(eq)) q = v === null ? q.is(k, null) : q.eq(k, v)
  for (const [k, v] of Object.entries(no)) q = v === null ? q.not(k, 'is', null) : q.neq(k, v)
  for (const [k, v] of Object.entries(gte)) q = q.gte(k, v)
  for (const [k, v] of Object.entries(lte)) q = q.lte(k, v)
  return q
}

export function crearSupabase(url, clave) {
  const cliente = createClient(url, clave, {
    auth: { persistSession: true, autoRefreshToken: true },
  })

  return {
    demo: false,

    async sesion() {
      const { data, error } = await cliente.auth.getSession()
      if (error) throw traducirError(error)
      return data.session ? { usuario: data.session.user } : null
    },

    alCambiarSesion(cb) {
      const { data } = cliente.auth.onAuthStateChange((_evento, sesion) => {
        cb(sesion ? { usuario: sesion.user } : null)
      })
      return () => data.subscription.unsubscribe()
    },

    async entrar(email, contrasena) {
      const { error } = await cliente.auth.signInWithPassword({ email, password: contrasena })
      if (error) throw traducirError(error)
    },

    async salir() {
      await cliente.auth.signOut()
    },

    async listar(tabla, opciones = {}) {
      const { orden, asc = true } = opciones
      const filas = []
      for (let desde = 0; ; desde += PAGINA) {
        let q = aplicarFiltros(cliente.from(tabla).select('*'), opciones)
        if (orden) q = q.order(orden, { ascending: asc })
        q = q.order(CLAVE_ORDEN[tabla] ?? 'id', { ascending: true })
        const { data, error } = await q.range(desde, desde + PAGINA - 1)
        if (error) throw traducirError(error)
        filas.push(...data)
        if (data.length < PAGINA) return filas
      }
    },

    async insertar(tabla, fila) {
      const { data, error } = await cliente.from(tabla).insert(fila).select().single()
      if (error) throw traducirError(error)
      return data
    },

    async actualizar(tabla, id, cambios, campoId = 'id') {
      const { data, error } = await cliente.from(tabla).update(cambios).eq(campoId, id).select().single()
      if (error) throw traducirError(error)
      return data
    },

    async borrar(tabla, id) {
      const { error } = await cliente.from(tabla).delete().eq('id', id)
      if (error) throw traducirError(error)
    },

    async rpc(nombre, args = {}) {
      const { data, error } = await cliente.rpc(nombre, args)
      if (error) throw traducirError(error)
      return data
    },

    async funcion(nombre, cuerpo = {}) {
      const { data, error } = await cliente.functions.invoke(nombre, { body: cuerpo })
      if (error) {
        // El detalle útil viene en el cuerpo de la respuesta de la función.
        let detalle = error.message
        try {
          const json = await error.context?.json?.()
          if (json?.error) detalle = json.error
        } catch {
          // sin cuerpo legible: queda el mensaje genérico
        }
        throw traducirError(new Error(detalle))
      }
      return data
    },
  }
}
