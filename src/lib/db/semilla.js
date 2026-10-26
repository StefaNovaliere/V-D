// Datos de ejemplo del modo demostración. Los números del mes en curso son
// los del boceto aprobado (les quedó $ 1.665.000) y el mes anterior da
// $ 1.410.000, para que se vea la comparación. Todo se arma respecto del mes
// actual, así la demo nunca queda vieja.
//
// Las categorías y conceptos repiten los de supabase/03_datos_iniciales.sql.

import { armarFecha, hoy, mesActual, partes, sumarMeses } from '../fechas.js'

export const HOGAR = 'demo-hogar'
export const LAURA = 'demo-laura'
export const MARTIN = 'demo-martin'

const CONCEPTOS = [
  'Cuota médico-asistencial (prepaga)',
  'Personal de casas particulares (sueldo y aportes)',
  'Alquiler de vivienda',
  'Seguro de vida',
  'Honorarios médicos',
  'Gastos de educación',
  'Donaciones',
]

// [area, tipo, nombre, clave, orden, cuenta_monotributo, concepto deducible sugerido]
const CATEGORIAS = [
  ['casa', 'ingreso', 'Otros ingresos', 'otros', 1],
  ['casa', 'gasto', 'Supermercado', 'supermercado', 1],
  ['casa', 'gasto', 'Sueldo niñera', 'sueldo', 2, false, 1],
  ['casa', 'gasto', 'Aguinaldo niñera', 'aguinaldo', 3, false, 1],
  ['casa', 'gasto', 'Aportes casas particulares', 'aportes_cp', 4, false, 1],
  ['casa', 'gasto', 'Colegio', 'colegio', 5, false, 5],
  ['casa', 'gasto', 'Servicios', 'servicios', 6],
  ['casa', 'gasto', 'Prepaga', 'prepaga', 7, false, 0],
  ['casa', 'gasto', 'Alquiler', 'alquiler', 8, false, 2],
  ['casa', 'gasto', 'Otros', 'otros', 99],
  ['estudio', 'ingreso', 'Honorarios', 'honorarios', 1, true],
  ['estudio', 'ingreso', 'Otros ingresos', 'otros', 2],
  ['estudio', 'gasto', 'Sueldo secretaria', 'sueldo', 1],
  ['estudio', 'gasto', 'Aguinaldo secretaria', 'aguinaldo', 2],
  ['estudio', 'gasto', 'Alquiler oficina', 'alquiler', 3],
  ['estudio', 'gasto', 'Servicios', 'servicios', 4],
  ['estudio', 'gasto', 'Matrícula', 'matricula', 5],
  ['estudio', 'gasto', 'Insumos', 'insumos', 6],
  ['estudio', 'gasto', 'Monotributo', 'monotributo', 7],
  ['estudio', 'gasto', 'Otros', 'otros', 99],
  ['camiones', 'ingreso', 'Ingreso limpio (Mis Cargas)', 'mis_cargas', 1],
  ['camiones', 'ingreso', 'Otros ingresos', 'otros', 2],
  ['camiones', 'gasto', 'Resultado negativo (Mis Cargas)', 'mis_cargas', 90],
  ['camiones', 'gasto', 'Seguro', 'seguro', 1],
  ['camiones', 'gasto', 'Ingresos Brutos', 'iibb', 2],
  ['camiones', 'gasto', 'Contador', 'contador', 3],
  ['camiones', 'gasto', 'Técnica (RTO)', 'rto', 4],
  ['camiones', 'gasto', 'Otros', 'otros', 99],
]

// Lo que "devuelve" Mis Cargas en la demo. El mes en curso es el del boceto.
export const PATENTES_DEMO = [
  { patente: 'AE 412 KT', base: 1120000, viajes: 9 },
  { patente: 'AF 087 RZ', base: 990000, viajes: 8 },
  { patente: 'AC 930 LM', base: 740000, viajes: 6 },
]

export function saldoDemoMisCargas(mes, i) {
  const actual = mesActual()
  const p = PATENTES_DEMO[i]
  if (mes === actual) return { saldo: p.base, viajes: p.viajes }
  if (mes === sumarMeses(actual, -1)) {
    // Septiembre del boceto: 2.600.000 entre los tres.
    return { saldo: [1010000, 930000, 660000][i], viajes: p.viajes - 1 }
  }
  // Variación estable por mes para que re-sincronizar no cambie los números.
  const [a, m] = mes.split('-').map(Number)
  const factor = 0.8 + (((a * 12 + m) * 7 + i * 13) % 10) / 25
  return { saldo: Math.round((p.base * factor) / 1000) * 1000, viajes: Math.max(3, p.viajes - 2 + (m % 3)) }
}

let contador = 0
const nuevoId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${contador++}`

export function crearSemilla() {
  const ahora = new Date().toISOString()
  const tablas = {
    households: [{ id: HOGAR, nombre: 'Familia (demostración)', created_at: ahora }],
    household_members: [
      { household_id: HOGAR, user_id: LAURA, nombre: 'Laura' },
      { household_id: HOGAR, user_id: MARTIN, nombre: 'Martín' },
    ],
    conceptos_deducibles: [],
    categorias: [],
    personas: [],
    gastos_fijos: [],
    movimientos: [],
    configuracion: [{
      household_id: HOGAR,
      monotributo_activo: true,
      monotributo_categoria: 'H',
      monotributo_tope: 45000000,
      monotributo_aviso_pct: 90,
    }],
  }

  const conceptos = CONCEPTOS.map((nombre, i) => ({
    id: nuevoId(), household_id: HOGAR, nombre, orden: i + 1, activo: true,
  }))
  tablas.conceptos_deducibles = conceptos

  tablas.categorias = CATEGORIAS.map(([area, tipo, nombre, clave, orden, cuentaMono = false, concepto]) => ({
    id: nuevoId(),
    household_id: HOGAR,
    area, tipo, nombre, clave, orden,
    activa: true,
    cuenta_monotributo: cuentaMono,
    concepto_deducible_id: concepto === undefined ? null : conceptos[concepto].id,
  }))

  const cat = (area, tipo, clave) =>
    tablas.categorias.find((c) => c.area === area && c.tipo === tipo && c.clave === clave)
  const catNombre = (area, nombre) => tablas.categorias.find((c) => c.area === area && c.nombre === nombre)

  const mes = mesActual()
  const anterior = sumarMeses(mes, -1)
  const siguiente = sumarMeses(mes, 1)
  const diaHoy = partes(hoy()).d
  // En el mes en curso nada queda con fecha futura, salvo lo de Mis Cargas,
  // que es el cierre del mes.
  const f = (m, d) => armarFecha(...m.split('-').map(Number), m === mes ? Math.min(d, diaHoy) : d)

  // Personas
  const graciela = {
    id: nuevoId(), household_id: HOGAR, area: 'estudio', nombre: 'Graciela', rol: 'Secretaria',
    sueldo_mensual: 650000, fecha_alta: '2024-03-01', activa: true,
  }
  const rosa = {
    id: nuevoId(), household_id: HOGAR, area: 'casa', nombre: 'Rosa', rol: 'Niñera',
    sueldo_mensual: 520000, fecha_alta: '2023-08-01', activa: true,
  }
  tablas.personas = [graciela, rosa]

  // Gastos fijos con vencimiento
  const gf = (o) => ({
    id: nuevoId(), household_id: HOGAR, tipo: 'gasto', detalle: null, patente: null, persona_id: null,
    frecuencia: 'mensual', es_impositivo: false, activo: true, ...o,
  })
  const fijoSecretaria = gf({
    area: 'estudio', categoria_id: cat('estudio', 'gasto', 'sueldo').id, concepto: 'Sueldo secretaria',
    detalle: 'Graciela', persona_id: graciela.id, monto: 650000, proximo_vencimiento: `${siguiente}-23`,
  })
  const fijoNinera = gf({
    area: 'casa', categoria_id: cat('casa', 'gasto', 'sueldo').id, concepto: 'Sueldo niñera',
    detalle: 'Rosa', persona_id: rosa.id, monto: 520000, proximo_vencimiento: `${siguiente}-01`,
  })
  const fijoSeguro = gf({
    area: 'camiones', categoria_id: cat('camiones', 'gasto', 'seguro').id, concepto: 'Seguro de los camiones',
    detalle: '3 camiones', monto: 540000, proximo_vencimiento: `${siguiente}-05`,
  })
  const fijoIibb = gf({
    area: 'camiones', categoria_id: cat('camiones', 'gasto', 'iibb').id, concepto: 'Ingresos Brutos',
    monto: 210000, proximo_vencimiento: `${siguiente}-15`, es_impositivo: true,
  })
  const fijoContador = gf({
    area: 'camiones', categoria_id: cat('camiones', 'gasto', 'contador').id, concepto: 'Contador',
    monto: 180000, proximo_vencimiento: `${siguiente}-28`,
  })
  const fijoRto = gf({
    area: 'camiones', categoria_id: cat('camiones', 'gasto', 'rto').id, concepto: 'Técnica (RTO)',
    detalle: 'turno RTO', patente: 'AE 412 KT', monto: 95000, frecuencia: 'anual',
    proximo_vencimiento: `${siguiente}-20`,
  })
  const fijoMonotributo = gf({
    area: 'estudio', categoria_id: cat('estudio', 'gasto', 'monotributo').id, concepto: 'Monotributo',
    detalle: 'Categoría H', monto: 160000, proximo_vencimiento: `${siguiente}-20`, es_impositivo: true,
  })
  const fijoAportes = gf({
    area: 'casa', categoria_id: cat('casa', 'gasto', 'aportes_cp').id, concepto: 'Aportes casas particulares',
    detalle: 'Rosa', monto: 38000, proximo_vencimiento: `${siguiente}-10`, es_impositivo: true,
  })
  tablas.gastos_fijos = [fijoNinera, fijoSeguro, fijoIibb, fijoRto, fijoMonotributo, fijoAportes, fijoContador, fijoSecretaria]

  // Movimientos
  const movs = []
  const m = (o) => movs.push({
    id: nuevoId(), household_id: HOGAR, nota: null, origen: 'manual', creado_por: LAURA,
    persona_id: null, gasto_fijo_id: null, patente: null, concepto_deducible_id: null, ref_externa: null,
    created_at: ahora, updated_at: ahora, ...o,
    tipo: o.categoria.tipo, area: o.categoria.area, categoria_id: o.categoria.id, categoria: undefined,
  })

  // Mes en curso (el del boceto)
  const hon = cat('estudio', 'ingreso', 'honorarios')
  m({ categoria: hon, monto: 1200000, fecha: f(mes, 6), nota: 'Divorcio Pérez' })
  m({ categoria: hon, monto: 1100000, fecha: f(mes, 15), nota: 'Laboral Gómez' })
  m({ categoria: hon, monto: 900000, fecha: f(mes, 24), nota: 'Sucesión Ramírez' })
  m({ categoria: cat('estudio', 'gasto', 'sueldo'), monto: 650000, fecha: f(mes, 23), nota: 'Sueldo secretaria',
    origen: 'fijo', persona_id: graciela.id, gasto_fijo_id: fijoSecretaria.id })
  m({ categoria: cat('estudio', 'gasto', 'alquiler'), monto: 450000, fecha: f(mes, 5) })
  m({ categoria: cat('estudio', 'gasto', 'servicios'), monto: 90000, fecha: f(mes, 12), nota: 'Luz e internet' })
  m({ categoria: cat('estudio', 'gasto', 'matricula'), monto: 50000, fecha: f(mes, 10), nota: 'Colegio de Abogados' })

  m({ categoria: cat('camiones', 'gasto', 'seguro'), monto: 540000, fecha: f(mes, 5), nota: 'Seguro de los camiones',
    origen: 'fijo', gasto_fijo_id: fijoSeguro.id, creado_por: MARTIN })
  m({ categoria: cat('camiones', 'gasto', 'iibb'), monto: 210000, fecha: f(mes, 20), nota: 'Ingresos Brutos',
    origen: 'fijo', gasto_fijo_id: fijoIibb.id })
  m({ categoria: cat('camiones', 'gasto', 'contador'), monto: 180000, fecha: f(mes, 8), nota: 'Contador',
    origen: 'fijo', gasto_fijo_id: fijoContador.id, creado_por: MARTIN })
  m({ categoria: cat('camiones', 'gasto', 'rto'), monto: 95000, fecha: f(mes, 14), nota: 'Técnica AF 087 RZ',
    patente: 'AF 087 RZ', creado_por: MARTIN })

  m({ categoria: cat('casa', 'gasto', 'supermercado'), monto: 380000, fecha: f(mes, 4), creado_por: MARTIN })
  m({ categoria: cat('casa', 'gasto', 'supermercado'), monto: 240000, fecha: f(mes, 18) })
  m({ categoria: cat('casa', 'gasto', 'sueldo'), monto: 520000, fecha: f(mes, 1), nota: 'Sueldo niñera',
    origen: 'fijo', persona_id: rosa.id, gasto_fijo_id: fijoNinera.id,
    concepto_deducible_id: conceptos[1].id })
  m({ categoria: cat('casa', 'gasto', 'colegio'), monto: 380000, fecha: f(mes, 10), concepto_deducible_id: conceptos[5].id })
  m({ categoria: cat('casa', 'gasto', 'servicios'), monto: 210000, fecha: f(mes, 12), nota: 'Luz, gas y agua' })
  m({ categoria: cat('casa', 'gasto', 'otros'), monto: 390000, fecha: f(mes, 16), nota: 'Arreglo del auto', creado_por: MARTIN })

  // Mes anterior: les quedó $ 1.410.000
  m({ categoria: hon, monto: 1600000, fecha: f(anterior, 9), nota: 'Sucesión Ramírez (anticipo)' })
  m({ categoria: hon, monto: 1300000, fecha: f(anterior, 21), nota: 'Laboral Gómez' })
  m({ categoria: cat('estudio', 'gasto', 'sueldo'), monto: 650000, fecha: f(anterior, 23), nota: 'Sueldo secretaria',
    origen: 'fijo', persona_id: graciela.id, gasto_fijo_id: fijoSecretaria.id })
  m({ categoria: cat('estudio', 'gasto', 'alquiler'), monto: 450000, fecha: f(anterior, 5) })
  m({ categoria: cat('estudio', 'gasto', 'servicios'), monto: 130000, fecha: f(anterior, 12) })
  m({ categoria: cat('camiones', 'gasto', 'seguro'), monto: 440000, fecha: f(anterior, 5), origen: 'fijo',
    gasto_fijo_id: fijoSeguro.id, nota: 'Seguro de los camiones', creado_por: MARTIN })
  m({ categoria: cat('camiones', 'gasto', 'iibb'), monto: 200000, fecha: f(anterior, 15), origen: 'fijo',
    gasto_fijo_id: fijoIibb.id, nota: 'Ingresos Brutos' })
  m({ categoria: cat('camiones', 'gasto', 'contador'), monto: 180000, fecha: f(anterior, 8), origen: 'fijo',
    gasto_fijo_id: fijoContador.id, nota: 'Contador', creado_por: MARTIN })
  m({ categoria: cat('casa', 'gasto', 'supermercado'), monto: 600000, fecha: f(anterior, 11) })
  m({ categoria: cat('casa', 'gasto', 'sueldo'), monto: 520000, fecha: f(anterior, 1), nota: 'Sueldo niñera',
    origen: 'fijo', persona_id: rosa.id, gasto_fijo_id: fijoNinera.id, concepto_deducible_id: conceptos[1].id })
  m({ categoria: cat('casa', 'gasto', 'colegio'), monto: 380000, fecha: f(anterior, 10), concepto_deducible_id: conceptos[5].id })
  m({ categoria: cat('casa', 'gasto', 'servicios'), monto: 200000, fecha: f(anterior, 13) })
  m({ categoria: cat('casa', 'gasto', 'otros'), monto: 340000, fecha: f(anterior, 19), creado_por: MARTIN })

  // Meses anteriores: honorarios para el control del monotributo y sueldos
  // para el historial y el aguinaldo.
  for (let i = 2; i <= 11; i++) {
    const mm = sumarMeses(mes, -i)
    m({ categoria: hon, monto: 2600000 + ((i * 370000) % 900000), fecha: f(mm, 12), nota: 'Honorarios del mes' })
    if (i <= 6) {
      m({ categoria: cat('estudio', 'gasto', 'sueldo'), monto: i <= 3 ? 650000 : 600000, fecha: f(mm, 23),
        nota: 'Sueldo secretaria', origen: 'fijo', persona_id: graciela.id, gasto_fijo_id: fijoSecretaria.id })
      m({ categoria: cat('casa', 'gasto', 'sueldo'), monto: i <= 3 ? 520000 : 480000, fecha: f(mm, 1),
        nota: 'Sueldo niñera', origen: 'fijo', persona_id: rosa.id, gasto_fijo_id: fijoNinera.id,
        concepto_deducible_id: conceptos[1].id })
      m({ categoria: catNombre('casa', 'Prepaga'), monto: 310000, fecha: f(mm, 3), concepto_deducible_id: conceptos[0].id })
    }
  }

  // Ingreso limpio de Mis Cargas del mes en curso y el anterior
  for (const mm of [anterior, mes]) {
    PATENTES_DEMO.forEach((p, i) => {
      const { saldo, viajes } = saldoDemoMisCargas(mm, i)
      const [a, me] = mm.split('-').map(Number)
      const ultimo = new Date(a, me, 0).getDate()
      m({
        categoria: cat('camiones', 'ingreso', 'mis_cargas'), monto: saldo, fecha: armarFecha(a, me, ultimo),
        nota: `${viajes} viajes`, origen: 'mis_cargas', patente: p.patente, creado_por: null,
        ref_externa: `mis_cargas:${mm}:${p.patente.replace(/\s/g, '')}`,
      })
    })
  }

  tablas.movimientos = movs
  return tablas
}

export { nuevoId }
