// Cuentas puras, sin React ni base de datos, para poder probarlas solas.
// Las sumas se hacen en centavos enteros: sumar decimales en coma flotante
// deja restos como 0,30000000000000004 que después aparecen en un total.

import { AREAS, mesesDeFrecuencia } from './areas.js'
import {
  diasEntre, mesDe, primerDia, semestreDe, sumarMeses, sumarMesesAFecha, ultimoDia,
} from './fechas.js'

export const aCentavos = (monto) => Math.round((Number(monto) || 0) * 100)
export const aPesos = (centavos) => centavos / 100

export function sumar(movimientos) {
  return aPesos(movimientos.reduce((t, m) => t + aCentavos(m.monto), 0))
}

export function delMes(movimientos, mes) {
  return movimientos.filter((m) => mesDe(m.fecha) === mes)
}

function totales(movs) {
  let entro = 0
  let salio = 0
  for (const m of movs) {
    if (m.tipo === 'ingreso') entro += aCentavos(m.monto)
    else salio += aCentavos(m.monto)
  }
  return { entro: aPesos(entro), salio: aPesos(salio), quedo: aPesos(entro - salio) }
}

function porCategoria(movs, categorias) {
  const grupos = new Map()
  for (const m of movs) {
    const g = grupos.get(m.categoria_id) ?? { categoria_id: m.categoria_id, centavos: 0, cantidad: 0 }
    g.centavos += aCentavos(m.monto)
    g.cantidad += 1
    grupos.set(m.categoria_id, g)
  }
  return [...grupos.values()]
    .map((g) => {
      const cat = categorias.find((c) => c.id === g.categoria_id)
      return {
        categoria_id: g.categoria_id,
        nombre: cat?.nombre ?? 'Sin categoría',
        clave: cat?.clave ?? null,
        monto: aPesos(g.centavos),
        cantidad: g.cantidad,
      }
    })
    .sort((a, b) => b.monto - a.monto)
}

/**
 * Todo lo que muestra la pantalla principal para un mes: el total de la
 * familia y, por área, entró / salió / quedó con su desglose por categoría.
 */
export function resumenDelMes(movimientos, mes, categorias = []) {
  const movs = delMes(movimientos, mes)
  const areas = {}
  for (const area of AREAS) {
    const deArea = movs.filter((m) => m.area === area)
    areas[area] = {
      ...totales(deArea),
      ingresos: porCategoria(deArea.filter((m) => m.tipo === 'ingreso'), categorias),
      gastos: porCategoria(deArea.filter((m) => m.tipo === 'gasto'), categorias),
      cantidad: deArea.length,
    }
  }
  return { mes, ...totales(movs), areas, cantidad: movs.length }
}

/**
 * Las filas de la tarjeta de un área: primero lo que entró, después los
 * gastos de mayor a menor. Si hay más de `maximo`, el resto se junta en una
 * última fila para que la tarjeta no crezca sin fin.
 */
export function desglose(resumenArea, maximo = 5) {
  const filas = [
    ...resumenArea.ingresos.map((c) => ({ ...c, tipo: 'ingreso' })),
    ...resumenArea.gastos.map((c) => ({ ...c, tipo: 'gasto' })),
  ]
  if (filas.length <= maximo) return filas
  const visibles = filas.slice(0, maximo - 1)
  const resto = filas.slice(maximo - 1)
  const neto = resto.reduce((t, f) => t + (f.tipo === 'ingreso' ? 1 : -1) * aCentavos(f.monto), 0)
  visibles.push({
    categoria_id: null,
    nombre: 'Otras categorías',
    tipo: neto >= 0 ? 'ingreso' : 'gasto',
    monto: aPesos(Math.abs(neto)),
    cantidad: resto.reduce((t, f) => t + f.cantidad, 0),
  })
  return visibles
}

/** Cuánto aportó cada área a lo que entró y a lo que salió (para las barras). */
export function proporciones(resumen, campo) {
  const total = resumen[campo]
  if (!total) return []
  return AREAS
    .map((area) => ({ area, valor: resumen.areas[area][campo] }))
    .filter((p) => p.valor > 0)
    .map((p) => ({ ...p, pct: (p.valor / total) * 100 }))
}

// ---------------------------------------------------------------------------
// Vencimientos
// ---------------------------------------------------------------------------

export function siguienteVencimiento(fecha, frecuencia) {
  return sumarMesesAFecha(fecha, mesesDeFrecuencia(frecuencia))
}

/** Gastos fijos activos ordenados por fecha, con cuántos días faltan. */
export function proximosVencimientos(gastosFijos, hoyIso, limite = Infinity) {
  return gastosFijos
    .filter((g) => g.activo)
    .map((g) => ({ ...g, dias: diasEntre(hoyIso, g.proximo_vencimiento) }))
    .sort((a, b) => (a.proximo_vencimiento < b.proximo_vencimiento ? -1 : a.proximo_vencimiento > b.proximo_vencimiento ? 1 : 0))
    .slice(0, limite)
}

export function textoDias(dias) {
  if (dias < -1) return `Venció hace ${-dias} días`
  if (dias === -1) return 'Venció ayer'
  if (dias === 0) return 'Vence hoy'
  if (dias === 1) return 'Mañana'
  return `En ${dias} días`
}

// ---------------------------------------------------------------------------
// Sueldos
// ---------------------------------------------------------------------------

/**
 * Aguinaldo sugerido: la mitad del sueldo más alto pagado en el semestre de
 * `fecha`. Si en el semestre no se cargó ningún sueldo, la mitad del sueldo
 * mensual configurado. Es una sugerencia: el monto se puede cambiar, y los
 * casos especiales (ingreso a mitad de semestre, licencias) los confirma el
 * contador.
 */
export function aguinaldoSugerido(persona, pagos, categorias, fecha) {
  const { desde, hasta } = semestreDe(fecha)
  const claveDe = (id) => categorias.find((c) => c.id === id)?.clave
  const sueldos = pagos
    .filter((p) => p.fecha >= desde && p.fecha <= hasta && claveDe(p.categoria_id) === 'sueldo')
    .map((p) => aCentavos(p.monto))
  const base = sueldos.length ? Math.max(...sueldos) : aCentavos(persona.sueldo_mensual)
  return aPesos(Math.round(base / 2))
}

// ---------------------------------------------------------------------------
// Camiones
// ---------------------------------------------------------------------------

/** Lo que dejó cada camión en el mes según Mis Cargas, por patente. */
export function ingresoPorPatente(movimientos, mes) {
  const porPatente = new Map()
  for (const m of delMes(movimientos, mes)) {
    if (m.area !== 'camiones' || m.origen !== 'mis_cargas') continue
    const clave = m.patente || 'Sin patente'
    const p = porPatente.get(clave) ?? { patente: clave, centavos: 0, nota: m.nota }
    p.centavos += (m.tipo === 'ingreso' ? 1 : -1) * aCentavos(m.monto)
    p.nota = m.nota
    porPatente.set(clave, p)
  }
  return [...porPatente.values()]
    .map((p) => ({ patente: p.patente, monto: aPesos(p.centavos), nota: p.nota }))
    .sort((a, b) => b.monto - a.monto)
}

// ---------------------------------------------------------------------------
// Monotributo (regalo 3)
// ---------------------------------------------------------------------------

/**
 * Lo facturado en los últimos 12 meses contando el mes en curso: desde el
 * día 1 de hace 11 meses hasta hoy. Suman los ingresos de las categorías
 * marcadas con `cuenta_monotributo` (de entrada, Honorarios).
 */
export function rangoMonotributo(hoyIso) {
  const mes = mesDe(hoyIso)
  return { desde: primerDia(sumarMeses(mes, -11)), hasta: hoyIso }
}

export function controlMonotributo(movimientos, categorias, configuracion, hoyIso) {
  const { desde, hasta } = rangoMonotributo(hoyIso)
  const cuentan = new Set(categorias.filter((c) => c.cuenta_monotributo).map((c) => c.id))
  const movs = movimientos.filter(
    (m) => m.tipo === 'ingreso' && cuentan.has(m.categoria_id) && m.fecha >= desde && m.fecha <= hasta,
  )
  const meses = []
  for (let i = 11; i >= 0; i--) {
    const mes = sumarMeses(mesDe(hoyIso), -i)
    meses.push({ mes, monto: sumar(movs.filter((m) => mesDe(m.fecha) === mes)) })
  }
  const facturado = sumar(movs)
  const tope = Number(configuracion?.monotributo_tope) || 0
  const pct = tope ? (facturado / tope) * 100 : 0
  const aviso = Number(configuracion?.monotributo_aviso_pct) || 80
  let estado = 'sin_tope'
  if (tope) estado = pct >= 100 ? 'superado' : pct >= aviso ? 'cerca' : 'bien'
  return {
    desde, hasta, facturado, tope, pct, meses, estado,
    margen: tope ? aPesos(aCentavos(tope) - aCentavos(facturado)) : null,
  }
}

// ---------------------------------------------------------------------------
// Deducibles de Ganancias (regalo 2)
// ---------------------------------------------------------------------------

export function deduciblesDelAnio(movimientos, conceptos, anio) {
  const desde = `${anio}-01-01`
  const hasta = `${anio}-12-31`
  const movs = movimientos.filter(
    (m) => m.tipo === 'gasto' && m.concepto_deducible_id && m.fecha >= desde && m.fecha <= hasta,
  )
  const filas = conceptos
    .map((c) => {
      const deConcepto = movs.filter((m) => m.concepto_deducible_id === c.id)
      return {
        concepto: c,
        total: sumar(deConcepto),
        movimientos: deConcepto.sort((a, b) => (a.fecha < b.fecha ? -1 : 1)),
        porMes: Array.from({ length: 12 }, (_, i) => {
          const mes = `${anio}-${String(i + 1).padStart(2, '0')}`
          return sumar(deConcepto.filter((m) => mesDe(m.fecha) === mes))
        }),
      }
    })
    .filter((f) => f.movimientos.length > 0)
  return { filas, total: sumar(movs) }
}

export { ultimoDia }

/**
 * Para las listas: lo que trajo Mis Cargas en un mes se muestra en una sola
 * fila ("Ingreso limpio de los camiones · 3 camiones") en vez de una por
 * patente. El resto queda igual, ordenado del más nuevo al más viejo.
 */
export function agruparParaLista(movimientos) {
  const grupos = new Map()
  const filas = []
  for (const m of movimientos) {
    if (m.origen !== 'mis_cargas') {
      filas.push({ clase: 'movimiento', fecha: m.fecha, mov: m })
      continue
    }
    const mes = mesDe(m.fecha)
    let g = grupos.get(mes)
    if (!g) {
      g = { clase: 'mis_cargas', mes, fecha: m.fecha, centavos: 0, patentes: new Set() }
      grupos.set(mes, g)
      filas.push(g)
    }
    g.centavos += (m.tipo === 'ingreso' ? 1 : -1) * aCentavos(m.monto)
    g.patentes.add(m.patente)
    if (m.fecha > g.fecha) g.fecha = m.fecha
  }
  return filas
    .map((f) => (f.clase === 'mis_cargas'
      ? { clase: f.clase, mes: f.mes, fecha: f.fecha, monto: aPesos(f.centavos), camiones: f.patentes.size }
      : f))
    .sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1
      const ca = a.mov?.created_at ?? ''
      const cb = b.mov?.created_at ?? ''
      return ca < cb ? 1 : ca > cb ? -1 : 0
    })
}

// ---------------------------------------------------------------------------
// Proyección de fin de mes
// ---------------------------------------------------------------------------

/**
 * Lo que falta pagar este mes: los gastos fijos activos que vencen hasta el
 * último día del mes, incluidos los vencidos sin pagar y los automáticos
 * (que igual van a salir). Los automáticos ya cargados no aparecen porque su
 * vencimiento pasó al mes siguiente.
 */
export function proyeccionFinDeMes(resumenMes, gastosFijos, porCobrar, mes) {
  const fin = ultimoDia(mes)
  const pendientes = gastosFijos.filter((g) => g.activo && g.proximo_vencimiento <= fin && Number(g.monto) > 0)
  const aPagar = aPesos(pendientes.reduce((t, g) => t + aCentavos(g.monto), 0))
  const cobros = porCobrar.filter((p) => !p.cobrado_el && p.fecha_estimada && p.fecha_estimada <= fin)
  const aCobrar = aPesos(cobros.reduce((t, p) => t + aCentavos(p.monto), 0))
  return {
    pendientes,
    aPagar,
    cobros,
    aCobrar,
    quedaria: aPesos(aCentavos(resumenMes.quedo) - aCentavos(aPagar)),
    quedariaConCobros: aPesos(aCentavos(resumenMes.quedo) - aCentavos(aPagar) + aCentavos(aCobrar)),
  }
}

// ---------------------------------------------------------------------------
// Resumen anual (gráficos)
// ---------------------------------------------------------------------------

export function resumenAnual(movimientos, anio, categorias) {
  const meses = Array.from({ length: 12 }, (_, i) => {
    const mes = `${anio}-${String(i + 1).padStart(2, '0')}`
    const r = resumenDelMes(movimientos, mes, categorias)
    return { mes, entro: r.entro, salio: r.salio, quedo: r.quedo, cantidad: r.cantidad, areas: r.areas }
  })
  const delAnio = movimientos.filter((m) => m.fecha.startsWith(`${anio}-`))
  const gastos = new Map()
  for (const m of delAnio) {
    if (m.tipo !== 'gasto') continue
    const g = gastos.get(m.categoria_id) ?? { categoria_id: m.categoria_id, area: m.area, centavos: 0, cantidad: 0 }
    g.centavos += aCentavos(m.monto)
    g.cantidad += 1
    gastos.set(m.categoria_id, g)
  }
  const enQueSeFue = [...gastos.values()]
    .map((g) => ({
      ...g,
      nombre: categorias.find((c) => c.id === g.categoria_id)?.nombre ?? 'Sin categoría',
      monto: aPesos(g.centavos),
    }))
    .sort((a, b) => b.monto - a.monto)
  const total = (campo) => aPesos(meses.reduce((t, m) => t + aCentavos(m[campo]), 0))
  return { anio, meses, enQueSeFue, entro: total('entro'), salio: total('salio'), quedo: total('quedo') }
}

// ---------------------------------------------------------------------------
// Inflación
// ---------------------------------------------------------------------------

/**
 * Lleva un monto de un mes a "pesos de" otro mes con el IPC.
 * `ipc` es { 'aaaa-mm': índice }. Si falta algún índice devuelve null.
 */
export function aPesosDe(monto, mesOrigen, mesDestino, ipc) {
  const origen = ipc?.[mesOrigen]
  const destino = ipc?.[mesDestino]
  if (!origen || !destino) return null
  return (Number(monto) * destino) / origen
}

/**
 * Completa el IPC hasta `hasta` repitiendo la última inflación mensual
 * conocida. El INDEC publica a mediados del mes siguiente, así que el mes en
 * curso (y a veces el anterior) siempre es una estimación.
 */
export function completarIpc(ipc, hasta) {
  const meses = Object.keys(ipc ?? {}).sort()
  if (meses.length < 2) return { ipc: ipc ?? {}, estimados: [] }
  const ultimo = meses[meses.length - 1]
  const tasa = ipc[ultimo] / ipc[meses[meses.length - 2]]
  const completo = { ...ipc }
  const estimados = []
  for (let m = sumarMeses(ultimo, 1); m <= hasta; m = sumarMeses(m, 1)) {
    completo[m] = completo[sumarMeses(m, -1)] * tasa
    estimados.push(m)
  }
  return { ipc: completo, estimados, ultimoPublicado: ultimo, tasaMensual: tasa - 1 }
}

/**
 * Compara lo que quedó este mes con el anterior, en pesos de este mes.
 * Devuelve la variación real en % (o null si no se puede calcular).
 */
export function variacionReal(quedoActual, quedoAnterior, mes, ipc) {
  const anteriorHoy = aPesosDe(quedoAnterior, sumarMeses(mes, -1), mes, ipc)
  if (anteriorHoy === null || anteriorHoy <= 0 || quedoActual < 0) return null
  return { anteriorHoy, pct: ((quedoActual - anteriorHoy) / anteriorHoy) * 100 }
}

// ---------------------------------------------------------------------------
// Carga rápida
// ---------------------------------------------------------------------------

/**
 * Los últimos gastos o ingresos distintos cargados a mano, para repetirlos
 * con un toque. Distintos = otra categoría o otra nota.
 */
export function recientesParaRepetir(movimientos, limite = 4) {
  const vistos = new Set()
  const salida = []
  const ordenados = [...movimientos]
    .filter((m) => m.origen === 'manual')
    .sort((a, b) => ((a.created_at ?? a.fecha) < (b.created_at ?? b.fecha) ? 1 : -1))
  for (const m of ordenados) {
    const clave = `${m.categoria_id}|${(m.nota ?? '').trim().toLowerCase()}`
    if (vistos.has(clave)) continue
    vistos.add(clave)
    salida.push(m)
    if (salida.length === limite) break
  }
  return salida
}

/** Cuántas veces se usó cada categoría y con qué monto la última vez. */
export function usoDeCategorias(movimientos) {
  const uso = new Map()
  const ordenados = [...movimientos].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  for (const m of ordenados) {
    const u = uso.get(m.categoria_id) ?? { veces: 0, ultimoMonto: Number(m.monto) }
    u.veces += 1
    uso.set(m.categoria_id, u)
  }
  return uso
}
