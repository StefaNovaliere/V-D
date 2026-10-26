// Backend de demostración: la misma interfaz que supabase.js pero con los
// datos guardados en el navegador. Se usa cuando no hay variables de entorno
// de Supabase, para ver y probar la app sin cuenta.

import { hoy, sumarMeses, ultimoDia } from '../fechas.js'
import { siguienteVencimiento } from '../calculos.js'
import { crearSemilla, DADORES_DEMO, HOGAR, LAURA, nuevoId, PATENTES_DEMO, saldoDemoMisCargas } from './semilla.js'

// v2: suma por cobrar, comprobantes y gastos fijos automáticos.
const CLAVE = 'cuentas-familia-demo-v2'
const CLAVE_ARCHIVOS = 'cuentas-familia-demo-archivos'

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

function cumple(fila, { eq = {}, gte = {}, lte = {}, no = {}, en = {} }) {
  for (const [k, v] of Object.entries(en)) if (!v.includes(fila[k])) return false
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
  for (const tabla of ['por_cobrar', 'comprobantes', 'push_suscripciones']) t[tabla] ??= []
  const persistir = () => guardar(datos)

  // Los archivos de la demo van al navegador como data URL; si no entran
  // (el almacenamiento es chico), quedan solo en memoria hasta recargar.
  const archivos = new Map()
  const archivosGuardados = () => {
    try { return JSON.parse(localStorage.getItem(CLAVE_ARCHIVOS) || '{}') } catch { return {} }
  }
  const blobADataUrl = (blob) => new Promise((ok, mal) => {
    const lector = new FileReader()
    lector.onload = () => ok(lector.result)
    lector.onerror = mal
    lector.readAsDataURL(blob)
  })

  // Reglas que en Supabase pone la base: completar hogar, firma y fechas.
  function completar(tabla, fila) {
    const ahora = new Date().toISOString()
    const base = { id: nuevoId(), household_id: HOGAR, created_at: ahora, ...fila }
    if (tabla === 'movimientos') {
      return {
        nota: null, persona_id: null, gasto_fijo_id: null, patente: null,
        concepto_deducible_id: null, ref_externa: null, origen: 'manual', periodo: null,
        creado_por: LAURA, updated_at: ahora, ...base,
      }
    }
    if (tabla === 'gastos_fijos') {
      return {
        tipo: 'gasto', detalle: null, patente: null, persona_id: null,
        frecuencia: 'mensual', es_impositivo: false, activo: true, automatico: false, ...base,
      }
    }
    if (tabla === 'por_cobrar') {
      return {
        detalle: null, fecha_estimada: null, origen: 'manual', ref_externa: null,
        movimiento_id: null, cobrado_el: null, ...base,
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
      if (fila.gasto_fijo_id && fila.periodo && t.movimientos.some(
        (m) => m.id !== fila.id && m.gasto_fijo_id === fila.gasto_fijo_id && m.periodo === fila.periodo,
      )) {
        throw new Error('Ese vencimiento ya figura pagado. Fijate en los movimientos del mes.')
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
      t[tabla] ??= []
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
      if (tabla === 'movimientos') {
        const rutas = t.comprobantes.filter((c) => c.movimiento_id === id).map((c) => c.ruta)
        t.comprobantes = t.comprobantes.filter((c) => c.movimiento_id !== id)
        t.por_cobrar.forEach((p) => { if (p.movimiento_id === id) p.movimiento_id = null })
        this.borrarArchivos(rutas)
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
      if (nombre === 'cargar_fijos_vencidos') {
        // Lo mismo que cargar_fijos_vencidos_de() en 06_mejoras.sql
        const hoyIso = hoy()
        let cargados = 0
        for (const g of t.gastos_fijos) {
          if (!g.activo || !g.automatico || !(Number(g.monto) > 0)) continue
          let vueltas = 0
          while (g.proximo_vencimiento <= hoyIso && vueltas < 24) {
            const ya = t.movimientos.some((m) => m.gasto_fijo_id === g.id && m.periodo === g.proximo_vencimiento)
            if (!ya) {
              const cat = t.categorias.find((c) => c.id === g.categoria_id)
              t.movimientos.push(completar('movimientos', {
                tipo: 'gasto', area: g.area, categoria_id: g.categoria_id, monto: g.monto,
                fecha: g.proximo_vencimiento, nota: g.concepto, creado_por: null, origen: 'fijo',
                persona_id: g.persona_id, gasto_fijo_id: g.id, patente: g.patente,
                concepto_deducible_id: cat?.concepto_deducible_id ?? null, periodo: g.proximo_vencimiento,
              }))
              cargados++
            }
            g.proximo_vencimiento = siguienteVencimiento(g.proximo_vencimiento, g.frecuencia)
            vueltas++
          }
        }
        if (cargados) persistir()
        return cargados
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
      // Lo que deben los dadores (en Mis Cargas, viajes sin liquidar)
      t.por_cobrar = t.por_cobrar.filter((p) => p.origen !== 'mis_cargas')
      for (const d of DADORES_DEMO) {
        t.por_cobrar.push(completar('por_cobrar', {
          area: 'camiones', quien: d.dador, detalle: `${d.viajes} viajes sin liquidar`, monto: d.monto,
          origen: 'mis_cargas', ref_externa: `mis_cargas:dador:${d.dador}`,
        }))
      }
      const detalle = `${actualizados} registros de ${meses.length} meses`
      datos.misCargas.syncs.push({ created_at: new Date().toISOString(), ok: true, detalle })
      persistir()
      return { ok: true, actualizados, detalle }
    },

    async subirArchivo(ruta, blob) {
      archivos.set(ruta, blob)
      try {
        const guardados = archivosGuardados()
        guardados[ruta] = await blobADataUrl(blob)
        localStorage.setItem(CLAVE_ARCHIVOS, JSON.stringify(guardados))
      } catch {
        // no entra en el navegador: queda en memoria
      }
    },

    async urlArchivo(ruta) {
      if (archivos.has(ruta)) return URL.createObjectURL(archivos.get(ruta))
      const dataUrl = archivosGuardados()[ruta]
      if (dataUrl) return dataUrl
      throw new Error('En la demostración este archivo ya no está (se pierde al recargar si es grande).')
    },

    async bajarArchivo(ruta) {
      if (archivos.has(ruta)) return archivos.get(ruta)
      const dataUrl = archivosGuardados()[ruta]
      if (!dataUrl) throw new Error('Archivo no disponible en la demostración.')
      return (await fetch(dataUrl)).blob()
    },

    async borrarArchivos(rutas) {
      const guardados = archivosGuardados()
      for (const r of rutas) {
        archivos.delete(r)
        delete guardados[r]
      }
      try { localStorage.setItem(CLAVE_ARCHIVOS, JSON.stringify(guardados)) } catch { /* nada */ }
    },

    reiniciar() {
      localStorage.removeItem(CLAVE)
      localStorage.removeItem(CLAVE_ARCHIVOS)
    },
  }
}
