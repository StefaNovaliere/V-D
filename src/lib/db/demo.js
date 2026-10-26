// Backend de demostración: la misma interfaz que supabase.js pero con los
// datos guardados en el navegador. Se usa cuando no hay variables de entorno
// de Supabase, para ver y probar la app sin cuenta.

import { sumarMeses, ultimoDia } from '../fechas.js'
import { crearSemilla, HOGAR, LAURA, nuevoId, PATENTES_DEMO, saldoDemoMisCargas } from './semilla.js'

const CLAVE = 'cuentas-familia-demo-v1'

function leer() {
  try {
    const guardado = localStorage.getItem(CLAVE)
    if (guardado) return JSON.parse(guardado)
  } catch {
    // localStorage bloqueado o datos rotos: se arranca de cero
  }
  return null
}

function guardar(datos) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos))
  } catch {
    // sin almacenamiento la demo funciona igual, solo no recuerda los cambios
  }
}

const esperar = (ms = 120) => new Promise((r) => setTimeout(r, ms))
const copia = (x) => JSON.parse(JSON.stringify(x))

function cumple(fila, { eq = {}, gte = {}, lte = {}, no = {} }) {
  for (const [k, v] of Object.entries(eq)) if ((fila[k] ?? null) !== v) return false
  for (const [k, v] of Object.entries(no)) if ((fila[k] ?? null) === v) return false
  for (const [k, v] of Object.entries(gte)) if (!(fila[k] >= v)) return false
  for (const [k, v] of Object.entries(lte)) if (!(fila[k] <= v)) return false
  return true
}

export function crearDemo() {
  let datos = leer()
  if (!datos) {
    datos = { tablas: crearSemilla(), misCargas: { conectado: true, url: 'https://demo.mis-cargas.app', syncs: [] } }
    guardar(datos)
  }
  const t = datos.tablas
  const persistir = () => guardar(datos)

  // Reglas que en Supabase pone la base: completar hogar, firma y fechas.
  function completar(tabla, fila) {
    const ahora = new Date().toISOString()
    const base = { id: nuevoId(), household_id: HOGAR, created_at: ahora, ...fila }
    if (tabla === 'movimientos') {
      return {
        nota: null, persona_id: null, gasto_fijo_id: null, patente: null,
        concepto_deducible_id: null, ref_externa: null, origen: 'manual',
        creado_por: LAURA, updated_at: ahora, ...base,
      }
    }
    if (tabla === 'gastos_fijos') {
      return {
        tipo: 'gasto', detalle: null, patente: null, persona_id: null,
        frecuencia: 'mensual', es_impositivo: false, activo: true, ...base,
      }
    }
    if (tabla === 'personas') return { activa: true, fecha_alta: null, ...base }
    if (tabla === 'conceptos_deducibles') return { activo: true, orden: 0, ...base }
    return base
  }

  function validar(tabla, fila) {
    if (tabla === 'movimientos') {
      if (!(Number(fila.monto) > 0)) throw new Error('El monto tiene que ser mayor a cero.')
      const cat = t.categorias.find((c) => c.id === fila.categoria_id)
      if (!cat || cat.area !== fila.area || cat.tipo !== fila.tipo) {
        throw new Error('La categoría no corresponde a esa área.')
      }
    }
  }

  return {
    demo: true,

    async sesion() {
      return { usuario: { id: LAURA, email: 'laura@demo' } }
    },
    alCambiarSesion() {
      return () => {}
    },
    async entrar() {},
    async salir() {},

    async listar(tabla, opciones = {}) {
      await esperar(60)
      const { orden, asc = true } = opciones
      let filas = (t[tabla] ?? []).filter((f) => cumple(f, opciones))
      if (orden) {
        filas = [...filas].sort((a, b) => {
          const r = a[orden] < b[orden] ? -1 : a[orden] > b[orden] ? 1 : 0
          return asc ? r : -r
        })
      }
      return copia(filas)
    },

    async insertar(tabla, fila) {
      await esperar()
      const nueva = completar(tabla, fila)
      validar(tabla, nueva)
      t[tabla].push(nueva)
      persistir()
      return copia(nueva)
    },

    async actualizar(tabla, id, cambios, campoId = 'id') {
      await esperar()
      const fila = t[tabla].find((f) => f[campoId] === id)
      if (!fila) throw new Error('No se encontró el registro.')
      const nueva = { ...fila, ...cambios }
      if (tabla === 'movimientos') {
        nueva.creado_por = fila.creado_por
        nueva.updated_at = new Date().toISOString()
      }
      validar(tabla, nueva)
      Object.assign(fila, nueva)
      persistir()
      return copia(fila)
    },

    async borrar(tabla, id) {
      await esperar()
      t[tabla] = t[tabla].filter((f) => f.id !== id)
      // Lo que hace ON DELETE en la base
      if (tabla === 'personas') {
        t.gastos_fijos = t.gastos_fijos.filter((g) => g.persona_id !== id)
        t.movimientos.forEach((m) => { if (m.persona_id === id) m.persona_id = null })
      }
      if (tabla === 'gastos_fijos') {
        t.movimientos.forEach((m) => { if (m.gasto_fijo_id === id) m.gasto_fijo_id = null })
      }
      if (tabla === 'conceptos_deducibles') {
        t.movimientos.forEach((m) => { if (m.concepto_deducible_id === id) m.concepto_deducible_id = null })
        t.categorias.forEach((c) => { if (c.concepto_deducible_id === id) c.concepto_deducible_id = null })
      }
      persistir()
    },

    async rpc(nombre, args) {
      await esperar()
      if (nombre === 'estado_mis_cargas') {
        const ultima = datos.misCargas.syncs.at(-1)
        return [{
          conectado: datos.misCargas.conectado,
          url: datos.misCargas.url,
          ultima_sync: ultima?.created_at ?? null,
          ultima_ok: ultima?.ok ?? null,
          ultimo_detalle: ultima?.detalle ?? null,
        }]
      }
      if (nombre === 'guardar_conexion_mis_cargas') {
        datos.misCargas.conectado = Boolean(args.p_token?.trim())
        datos.misCargas.url = datos.misCargas.conectado ? args.p_url : null
        persistir()
        return null
      }
      throw new Error(`Función desconocida: ${nombre}`)
    },

    // Imita la Edge Function sincronizar-mis-cargas con números inventados.
    async funcion(nombre, cuerpo) {
      if (nombre !== 'sincronizar-mis-cargas') throw new Error(`Función desconocida: ${nombre}`)
      await esperar(600)
      if (!datos.misCargas.conectado) throw new Error('Falta conectar Mis Cargas en Ajustes.')
      const catIngreso = t.categorias.find((c) => c.area === 'camiones' && c.tipo === 'ingreso' && c.clave === 'mis_cargas')
      const catGasto = t.categorias.find((c) => c.area === 'camiones' && c.tipo === 'gasto' && c.clave === 'mis_cargas')
      const meses = []
      for (let m = cuerpo.desde; m <= cuerpo.hasta; m = sumarMeses(m, 1)) meses.push(m)
      let actualizados = 0
      for (const mes of meses) {
        PATENTES_DEMO.forEach((p, i) => {
          const { saldo, viajes } = saldoDemoMisCargas(mes, i)
          const ref = `mis_cargas:${mes}:${p.patente.replace(/\s/g, '')}`
          const cat = saldo >= 0 ? catIngreso : catGasto
          const fila = {
            tipo: cat.tipo, area: 'camiones', categoria_id: cat.id, monto: Math.abs(saldo),
            fecha: ultimoDia(mes), nota: `${viajes} viajes`, origen: 'mis_cargas',
            patente: p.patente, ref_externa: ref, creado_por: null,
          }
          const existente = t.movimientos.find((m) => m.ref_externa === ref)
          if (existente) Object.assign(existente, fila, { updated_at: new Date().toISOString() })
          else t.movimientos.push(completar('movimientos', fila))
          actualizados++
        })
      }
      const detalle = `${actualizados} registros de ${meses.length} meses`
      datos.misCargas.syncs.push({ created_at: new Date().toISOString(), ok: true, detalle })
      persistir()
      return { ok: true, actualizados, detalle }
    },

    reiniciar() {
      localStorage.removeItem(CLAVE)
    },
  }
}
