import { create } from 'zustand'
import { db } from '../lib/db/index.js'
import { completarIpc, controlMonotributo, rangoMonotributo, siguienteVencimiento } from '../lib/calculos.js'
import { prepararArchivo, TAMANO_MAXIMO } from '../lib/archivos.js'
import { traerIpc } from '../lib/inflacion.js'
import { hoy, mesActual, mesDe, primerDia, sumarMeses, ultimoDia } from '../lib/fechas.js'

// Cada cuánto, como mínimo, se vuelve a consultar Mis Cargas solo al abrir la app.
const SYNC_AUTOMATICA_MS = 3 * 60 * 60 * 1000

let avisoTimer = null

export const useStore = create((set, get) => ({
  // 'cargando' | 'sin_sesion' | 'sin_hogar' | 'listo' | 'error'
  estado: 'cargando',
  error: null,
  demo: db.demo,
  usuario: null,
  hogar: null,
  miembros: [],
  categorias: [],
  conceptos: [],
  personas: [],
  gastosFijos: [],
  configuracion: null,
  misCargas: null,
  sincronizando: false,
  monotributo: null,
  // Plata por cobrar que todavía no entró.
  porCobrar: [],
  // Cantidad de comprobantes por movimiento, para el clip en las listas.
  comprobantes: {},
  // IPC completado hasta el mes actual (null si no se pudo conseguir).
  inflacion: null,

  mes: mesActual(),
  // Movimientos del mes elegido y del anterior (para la comparación).
  movimientos: [],
  cargandoMovimientos: false,

  aviso: null,

  // -------------------------------------------------------------------------
  // Arranque y sesión
  // -------------------------------------------------------------------------
  async iniciar() {
    try {
      const sesion = await db.sesion()
      if (!sesion) {
        set({ estado: 'sin_sesion', usuario: null })
        return
      }
      set({ usuario: sesion.usuario })
      await get().cargarTodo()
    } catch (e) {
      set({ estado: 'error', error: e.message })
    }
  },

  async entrar(email, contrasena) {
    await db.entrar(email, contrasena)
    set({ estado: 'cargando' })
    await get().iniciar()
  },

  async salir() {
    await db.salir()
    set({
      estado: 'sin_sesion', usuario: null, hogar: null, miembros: [], movimientos: [], porCobrar: [], comprobantes: {},
      categorias: [], conceptos: [], personas: [], gastosFijos: [], configuracion: null,
      misCargas: null, monotributo: null,
    })
  },

  async cargarTodo() {
    const miembros = await db.listar('household_members')
    const yo = miembros.find((m) => m.user_id === get().usuario?.id)
    if (!yo) {
      set({ estado: 'sin_hogar' })
      return
    }
    // Antes de leer: cargar los gastos fijos automáticos que ya vencieron,
    // por si el cron diario todavía no corrió. Es idempotente.
    try {
      await db.rpc('cargar_fijos_vencidos')
    } catch {
      // Si falla, el cron lo hace a la mañana; la app abre igual.
    }
    const [hogares, categorias, conceptos, personas, gastosFijos, configuraciones, porCobrar] = await Promise.all([
      db.listar('households'),
      db.listar('categorias', { orden: 'orden' }),
      db.listar('conceptos_deducibles', { orden: 'orden' }),
      db.listar('personas', { orden: 'nombre' }),
      db.listar('gastos_fijos', { orden: 'proximo_vencimiento' }),
      db.listar('configuracion'),
      db.listar('por_cobrar', { eq: { cobrado_el: null }, orden: 'created_at' }),
    ])
    set({
      miembros,
      hogar: hogares[0] ?? null,
      categorias,
      conceptos,
      personas,
      gastosFijos,
      configuracion: configuraciones[0] ?? null,
      porCobrar,
    })
    await get().cargarMovimientos()
    set({ estado: 'listo' })
    get().cargarMonotributo()
    get().cargarIpc()
    get().cargarEstadoMisCargas().then(() => get().sincronizarSiHaceFalta())
  },

  // -------------------------------------------------------------------------
  // Movimientos
  // -------------------------------------------------------------------------
  async cargarMovimientos() {
    const { mes } = get()
    set({ cargandoMovimientos: true })
    try {
      const movimientos = await db.listar('movimientos', {
        gte: { fecha: primerDia(sumarMeses(mes, -1)) },
        lte: { fecha: ultimoDia(mes) },
        orden: 'fecha',
        asc: false,
      })
      // Si mientras tanto cambiaron de mes, esta respuesta ya no sirve.
      if (get().mes === mes) set({ movimientos })
      get().cargarConteoComprobantes(movimientos.map((m) => m.id))
    } finally {
      set({ cargandoMovimientos: false })
    }
  },

  setMes(mes) {
    if (mes === get().mes) return
    set({ mes })
    get().cargarMovimientos().catch((e) => get().avisar(e.message, 'error'))
  },

  /** Para pantallas que necesitan otro rango (año, 12 meses, persona). */
  async consultarMovimientos(filtros) {
    return db.listar('movimientos', { orden: 'fecha', asc: false, ...filtros })
  },

  async guardarMovimiento(datos, id = null) {
    const fila = {
      tipo: datos.tipo,
      area: datos.area,
      categoria_id: datos.categoria_id,
      monto: datos.monto,
      fecha: datos.fecha,
      nota: datos.nota?.trim() || null,
      persona_id: datos.persona_id ?? null,
      patente: datos.patente?.trim() || null,
      concepto_deducible_id: datos.tipo === 'gasto' ? datos.concepto_deducible_id ?? null : null,
    }
    let guardado
    if (id) {
      guardado = await db.actualizar('movimientos', id, fila)
    } else {
      if (datos.repetir) {
        // "Repetir todos los meses": queda como gasto fijo, con su vencimiento
        // el mes que viene, para pagarlo con un toque desde Vencimientos.
        const cat = get().categorias.find((c) => c.id === datos.categoria_id)
        const fijo = await db.insertar('gastos_fijos', {
          area: datos.area,
          categoria_id: datos.categoria_id,
          concepto: fila.nota || cat?.nombre || 'Gasto fijo',
          persona_id: fila.persona_id,
          patente: fila.patente,
          monto: datos.monto,
          frecuencia: 'mensual',
          proximo_vencimiento: siguienteVencimiento(datos.fecha, 'mensual'),
          automatico: Boolean(datos.automatico),
        })
        fila.gasto_fijo_id = fijo.id
        fila.origen = 'fijo'
        fila.periodo = datos.fecha
        set({ gastosFijos: ordenarFijos([...get().gastosFijos, fijo]) })
      }
      guardado = await db.insertar('movimientos', fila)
    }
    await get().despuesDeCambiarMovimientos(guardado.fecha)
    return guardado
  },

  async borrarMovimiento(id) {
    // Los archivos de Storage no se borran solos con la fila: primero ellos.
    if (!db.demo) {
      const comps = await db.listar('comprobantes', { eq: { movimiento_id: id } })
      await db.borrarArchivos(comps.map((c) => c.ruta)).catch(() => {})
    }
    await db.borrar('movimientos', id)
    await get().despuesDeCambiarMovimientos()
  },

  async despuesDeCambiarMovimientos(fecha) {
    // Si el movimiento cae en otro mes, se pasa a ese mes para que se vea.
    if (fecha && mesDe(fecha) !== get().mes && mesDe(fecha) !== sumarMeses(get().mes, -1)) {
      set({ mes: mesDe(fecha) })
    }
    await get().cargarMovimientos()
    get().cargarMonotributo()
  },

  // -------------------------------------------------------------------------
  // Gastos fijos y vencimientos
  // -------------------------------------------------------------------------
  async guardarGastoFijo(datos, id = null) {
    const fila = {
      area: datos.area,
      categoria_id: datos.categoria_id,
      concepto: datos.concepto.trim(),
      detalle: datos.detalle?.trim() || null,
      patente: datos.patente?.trim() || null,
      monto: datos.monto,
      frecuencia: datos.frecuencia,
      proximo_vencimiento: datos.proximo_vencimiento,
      es_impositivo: Boolean(datos.es_impositivo),
      automatico: Boolean(datos.automatico),
      activo: datos.activo ?? true,
    }
    const guardado = id
      ? await db.actualizar('gastos_fijos', id, fila)
      : await db.insertar('gastos_fijos', fila)
    set({ gastosFijos: ordenarFijos([...get().gastosFijos.filter((g) => g.id !== guardado.id), guardado]) })
    return guardado
  },

  async borrarGastoFijo(id) {
    await db.borrar('gastos_fijos', id)
    set({ gastosFijos: get().gastosFijos.filter((g) => g.id !== id) })
  },

  /**
   * Pagar un vencimiento: carga el gasto y corre la fecha al próximo
   * período. El próximo se cuenta desde el vencimiento, no desde el día en
   * que se pagó, para que pagar unos días tarde no corra el calendario.
   */
  async pagarGastoFijo(fijo, { fecha, monto, nota }) {
    const cat = get().categorias.find((c) => c.id === fijo.categoria_id)
    await db.insertar('movimientos', {
      tipo: 'gasto',
      area: fijo.area,
      categoria_id: fijo.categoria_id,
      monto,
      fecha,
      nota: nota?.trim() || fijo.concepto,
      origen: 'fijo',
      gasto_fijo_id: fijo.id,
      persona_id: fijo.persona_id,
      patente: fijo.patente,
      concepto_deducible_id: cat?.concepto_deducible_id ?? null,
      // El vencimiento que cubre: la base no deja pagarlo dos veces.
      periodo: fijo.proximo_vencimiento,
    })
    const actualizado = await db.actualizar('gastos_fijos', fijo.id, {
      proximo_vencimiento: siguienteVencimiento(fijo.proximo_vencimiento, fijo.frecuencia),
    })
    set({ gastosFijos: ordenarFijos(get().gastosFijos.map((g) => (g.id === fijo.id ? actualizado : g))) })
    await get().despuesDeCambiarMovimientos(fecha)
  },

  // -------------------------------------------------------------------------
  // Sueldos
  // -------------------------------------------------------------------------
  /**
   * Guarda la persona y mantiene su sueldo como gasto fijo mensual, que es
   * lo que la hace aparecer en "Próximos vencimientos".
   */
  async guardarPersona(datos, id = null) {
    const fila = {
      area: datos.area,
      nombre: datos.nombre.trim(),
      rol: datos.rol.trim(),
      sueldo_mensual: datos.sueldo_mensual,
      fecha_alta: datos.fecha_alta || null,
      activa: datos.activa ?? true,
    }
    const persona = id ? await db.actualizar('personas', id, fila) : await db.insertar('personas', fila)
    const cat = get().categorias.find((c) => c.area === persona.area && c.tipo === 'gasto' && c.clave === 'sueldo')
    const fijo = get().gastosFijos.find((g) => g.persona_id === persona.id && g.categoria_id === cat?.id)
    if (fijo) {
      await get().guardarGastoFijo({
        ...fijo,
        area: persona.area,
        concepto: `Sueldo ${persona.rol.toLowerCase()}`,
        detalle: persona.nombre,
        monto: persona.sueldo_mensual,
        proximo_vencimiento: datos.proximo_pago || fijo.proximo_vencimiento,
        automatico: datos.sueldo_automatico ?? fijo.automatico,
        activo: persona.activa,
      }, fijo.id)
    } else if (cat && datos.proximo_pago) {
      const nuevo = await db.insertar('gastos_fijos', {
        area: persona.area,
        categoria_id: cat.id,
        concepto: `Sueldo ${persona.rol.toLowerCase()}`,
        detalle: persona.nombre,
        persona_id: persona.id,
        monto: persona.sueldo_mensual,
        frecuencia: 'mensual',
        proximo_vencimiento: datos.proximo_pago,
        automatico: Boolean(datos.sueldo_automatico),
        activo: persona.activa,
      })
      set({ gastosFijos: ordenarFijos([...get().gastosFijos, nuevo]) })
    }
    set({ personas: [...get().personas.filter((p) => p.id !== persona.id), persona].sort((a, b) => a.nombre.localeCompare(b.nombre)) })
    return persona
  },

  async borrarPersona(id) {
    await db.borrar('personas', id)
    set({
      personas: get().personas.filter((p) => p.id !== id),
      gastosFijos: get().gastosFijos.filter((g) => g.persona_id !== id),
    })
    await get().cargarMovimientos()
  },

  // -------------------------------------------------------------------------
  // Configuración, conceptos deducibles y monotributo
  // -------------------------------------------------------------------------
  async guardarConfiguracion(cambios) {
    const { configuracion } = get()
    const guardada = await db.actualizar('configuracion', configuracion.household_id, cambios, 'household_id')
    set({ configuracion: guardada })
    get().cargarMonotributo()
  },

  async guardarConcepto(datos, id = null) {
    const fila = { nombre: datos.nombre.trim(), activo: datos.activo ?? true, orden: datos.orden ?? 99 }
    const guardado = id
      ? await db.actualizar('conceptos_deducibles', id, fila)
      : await db.insertar('conceptos_deducibles', fila)
    set({ conceptos: [...get().conceptos.filter((c) => c.id !== guardado.id), guardado].sort((a, b) => a.orden - b.orden) })
  },

  async guardarCategoria(id, cambios) {
    const guardada = await db.actualizar('categorias', id, cambios)
    set({ categorias: get().categorias.map((c) => (c.id === id ? guardada : c)) })
  },

  async cargarMonotributo() {
    const { configuracion, categorias } = get()
    if (!configuracion?.monotributo_activo) {
      set({ monotributo: null })
      return
    }
    try {
      const hoyIso = hoy()
      const { desde, hasta } = rangoMonotributo(hoyIso)
      const movs = await db.listar('movimientos', { eq: { tipo: 'ingreso' }, gte: { fecha: desde }, lte: { fecha: hasta } })
      set({ monotributo: controlMonotributo(movs, categorias, get().configuracion, hoyIso) })
    } catch {
      set({ monotributo: null })
    }
  },

  // -------------------------------------------------------------------------
  // Mis Cargas
  // -------------------------------------------------------------------------
  async cargarEstadoMisCargas() {
    try {
      const filas = await db.rpc('estado_mis_cargas')
      set({ misCargas: filas?.[0] ?? { conectado: false } })
    } catch {
      set({ misCargas: { conectado: false } })
    }
  },

  async conectarMisCargas(url, token) {
    await db.rpc('guardar_conexion_mis_cargas', { p_url: url, p_token: token })
    await get().cargarEstadoMisCargas()
  },

  /** Trae el ingreso limpio de los últimos `meses` meses (incluye el actual). */
  async sincronizarMisCargas({ meses = 3, silencioso = false } = {}) {
    if (get().sincronizando) return
    set({ sincronizando: true })
    try {
      const hasta = mesActual()
      const desde = sumarMeses(hasta, -(meses - 1))
      const r = await db.funcion('sincronizar-mis-cargas', { desde, hasta })
      await Promise.all([get().cargarMovimientos(), get().cargarPorCobrar()])
      if (!silencioso) get().avisar(`Listo: se actualizó lo de Mis Cargas (${r?.detalle ?? 'sin cambios'}).`)
    } catch (e) {
      if (!silencioso) get().avisar(e.message, 'error')
    } finally {
      set({ sincronizando: false })
      await get().cargarEstadoMisCargas()
    }
  },

  async sincronizarSiHaceFalta() {
    const mc = get().misCargas
    if (!mc?.conectado) return
    const ultima = mc.ultima_sync ? new Date(mc.ultima_sync).getTime() : 0
    if (Date.now() - ultima > SYNC_AUTOMATICA_MS) {
      await get().sincronizarMisCargas({ meses: 2, silencioso: true })
    }
  },

  // -------------------------------------------------------------------------
  // Plata por cobrar
  // -------------------------------------------------------------------------
  async cargarPorCobrar() {
    set({ porCobrar: await db.listar('por_cobrar', { eq: { cobrado_el: null }, orden: 'created_at' }) })
  },

  async guardarPorCobrar(datos, id = null) {
    const fila = {
      area: datos.area,
      quien: datos.quien.trim(),
      detalle: datos.detalle?.trim() || null,
      monto: datos.monto,
      fecha_estimada: datos.fecha_estimada || null,
    }
    const guardado = id ? await db.actualizar('por_cobrar', id, fila) : await db.insertar('por_cobrar', fila)
    set({ porCobrar: [...get().porCobrar.filter((p) => p.id !== guardado.id), guardado] })
  },

  async borrarPorCobrar(id) {
    await db.borrar('por_cobrar', id)
    set({ porCobrar: get().porCobrar.filter((p) => p.id !== id) })
  },

  /** Cobrar: carga el ingreso y saca la deuda de la lista. */
  async cobrar(item, { fecha, monto, categoria_id }) {
    const mov = await db.insertar('movimientos', {
      tipo: 'ingreso', area: item.area, categoria_id, monto, fecha,
      nota: item.detalle ? `${item.quien} · ${item.detalle}` : item.quien,
    })
    await db.actualizar('por_cobrar', item.id, { cobrado_el: fecha, movimiento_id: mov.id })
    set({ porCobrar: get().porCobrar.filter((p) => p.id !== item.id) })
    await get().despuesDeCambiarMovimientos(fecha)
  },

  // -------------------------------------------------------------------------
  // Comprobantes (fotos o PDF de un movimiento)
  // -------------------------------------------------------------------------
  async cargarConteoComprobantes(ids) {
    if (!ids.length) return set({ comprobantes: {} })
    try {
      const filas = []
      // De a 100 ids, para no armar una URL gigante.
      for (let i = 0; i < ids.length; i += 100) {
        filas.push(...await db.listar('comprobantes', { en: { movimiento_id: ids.slice(i, i + 100) } }))
      }
      const conteo = {}
      for (const c of filas) conteo[c.movimiento_id] = (conteo[c.movimiento_id] ?? 0) + 1
      set({ comprobantes: conteo })
    } catch {
      set({ comprobantes: {} })
    }
  },

  async comprobantesDe(ids) {
    const filas = []
    for (let i = 0; i < ids.length; i += 100) {
      filas.push(...await db.listar('comprobantes', { en: { movimiento_id: ids.slice(i, i + 100) } }))
    }
    return filas
  },

  async listarComprobantes(movimientoId) {
    return db.listar('comprobantes', { eq: { movimiento_id: movimientoId }, orden: 'created_at' })
  },

  async subirComprobantes(movimientoId, archivos) {
    const hogar = get().hogar?.id
    for (const archivo of archivos) {
      if (archivo.size > TAMANO_MAXIMO) throw new Error(`"${archivo.name}" pesa más de 10 MB.`)
      const { blob, tipo, extension } = await prepararArchivo(archivo)
      const ruta = `${hogar}/${movimientoId}/${crypto.randomUUID()}.${extension}`
      await db.subirArchivo(ruta, blob, tipo)
      try {
        await db.insertar('comprobantes', { movimiento_id: movimientoId, ruta, tipo, tamano: blob.size })
      } catch (e) {
        // Que no quede un archivo huérfano en Storage.
        await db.borrarArchivos([ruta]).catch(() => {})
        throw e
      }
    }
    const conteo = { ...get().comprobantes }
    conteo[movimientoId] = (conteo[movimientoId] ?? 0) + archivos.length
    set({ comprobantes: conteo })
  },

  async borrarComprobante(c) {
    await db.borrar('comprobantes', c.id)
    await db.borrarArchivos([c.ruta]).catch(() => {})
    const conteo = { ...get().comprobantes }
    conteo[c.movimiento_id] = Math.max(0, (conteo[c.movimiento_id] ?? 1) - 1)
    set({ comprobantes: conteo })
  },

  urlComprobante(ruta) {
    return db.urlArchivo(ruta)
  },

  // -------------------------------------------------------------------------
  // Inflación
  // -------------------------------------------------------------------------
  async cargarIpc() {
    const ipc = await traerIpc()
    if (ipc) set({ inflacion: completarIpc(ipc, mesActual()) })
  },

  // -------------------------------------------------------------------------
  // Avisos cortos al pie ("Gasto guardado")
  // -------------------------------------------------------------------------
  avisar(texto, tipo = 'ok') {
    clearTimeout(avisoTimer)
    set({ aviso: { texto, tipo } })
    avisoTimer = setTimeout(() => set({ aviso: null }), tipo === 'error' ? 6000 : 3000)
  },
}))

function ordenarFijos(lista) {
  return [...lista].sort((a, b) => (a.proximo_vencimiento < b.proximo_vencimiento ? -1 : 1))
}

// Selectores de uso común
export const nombreMiembro = (miembros, userId) =>
  miembros.find((m) => m.user_id === userId)?.nombre ?? null
