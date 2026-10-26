import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aguinaldoSugerido, controlMonotributo, deduciblesDelAnio, desglose, ingresoPorPatente,
  proximosVencimientos, resumenDelMes, siguienteVencimiento, sumar,
} from './calculos.js'
import {
  diasEntre, fechaCorta, hoy, mesActual, sumarMeses, sumarMesesAFecha, ultimoDia,
} from './fechas.js'
import { formatearEntrada, leerMonto, montoAEntrada, plata } from './formato.js'

const cats = [
  { id: 'hon', area: 'estudio', tipo: 'ingreso', nombre: 'Honorarios', clave: 'honorarios', cuenta_monotributo: true },
  { id: 'sec', area: 'estudio', tipo: 'gasto', nombre: 'Sueldo secretaria', clave: 'sueldo' },
  { id: 'agu', area: 'estudio', tipo: 'gasto', nombre: 'Aguinaldo secretaria', clave: 'aguinaldo' },
  { id: 'sup', area: 'casa', tipo: 'gasto', nombre: 'Supermercado', clave: 'supermercado' },
  { id: 'mc', area: 'camiones', tipo: 'ingreso', nombre: 'Ingreso limpio', clave: 'mis_cargas' },
  { id: 'mcn', area: 'camiones', tipo: 'gasto', nombre: 'Resultado negativo', clave: 'mis_cargas' },
]

const mov = (o) => ({ origen: 'manual', ...o })

test('fechas de calendario sin corrimiento de un día', () => {
  // 23:30 del 31/10 en el teléfono sigue siendo 31/10, aunque en UTC ya sea 1/11.
  const noche = new Date(2026, 9, 31, 23, 30)
  assert.equal(hoy(noche), '2026-10-31')
  assert.equal(mesActual(noche), '2026-10')
  assert.equal(fechaCorta('2026-11-01'), '01/11/2026')
  assert.equal(ultimoDia('2026-02'), '2026-02-28')
  assert.equal(ultimoDia('2028-02'), '2028-02-29')
  assert.equal(sumarMeses('2026-11', 3), '2027-02')
  assert.equal(sumarMeses('2026-01', -1), '2025-12')
  assert.equal(sumarMesesAFecha('2026-01-31', 1), '2026-02-28')
  assert.equal(sumarMesesAFecha('2026-11-05', 12), '2027-11-05')
  assert.equal(diasEntre('2026-10-26', '2026-11-01'), 6)
  assert.equal(diasEntre('2026-03-28', '2026-04-02'), 5)
})

test('plata con formato argentino', () => {
  assert.equal(plata(1665000), '$ 1.665.000')
  assert.equal(plata(-650000), '− $ 650.000')
  assert.equal(plata(255000, { signo: true }), '+ $ 255.000')
  assert.equal(plata(0), '$ 0')
  assert.equal(plata('95000.49'), '$ 95.000')
})

test('entrada de montos con puntos de miles y coma decimal', () => {
  assert.equal(formatearEntrada('650000'), '650.000')
  assert.equal(formatearEntrada('1234567,5'), '1.234.567,5')
  assert.equal(formatearEntrada('1.234,567'), '1.234,56')
  assert.equal(formatearEntrada('00012'), '12')
  assert.equal(leerMonto('1.234.567,50'), 1234567.5)
  assert.equal(leerMonto(''), null)
  assert.equal(leerMonto('$ 650.000'), 650000)
  assert.equal(montoAEntrada(900000.5), '900.000,50')
  assert.equal(montoAEntrada('650000.00'), '650.000')
})

test('sumas exactas en centavos', () => {
  assert.equal(sumar([{ monto: 0.1 }, { monto: 0.2 }]), 0.3)
  assert.equal(sumar([{ monto: '1000.10' }, { monto: '2000.20' }]), 3000.3)
})

test('resumen del mes por área y para la familia', () => {
  const movs = [
    mov({ tipo: 'ingreso', area: 'estudio', categoria_id: 'hon', monto: 3200000, fecha: '2026-10-05' }),
    mov({ tipo: 'gasto', area: 'estudio', categoria_id: 'sec', monto: 650000, fecha: '2026-10-23' }),
    mov({ tipo: 'gasto', area: 'casa', categoria_id: 'sup', monto: 620000, fecha: '2026-10-10' }),
    mov({ tipo: 'ingreso', area: 'camiones', categoria_id: 'mc', monto: 2850000, fecha: '2026-10-31', origen: 'mis_cargas' }),
    // Otro mes: no cuenta
    mov({ tipo: 'gasto', area: 'casa', categoria_id: 'sup', monto: 999, fecha: '2026-09-30' }),
  ]
  const r = resumenDelMes(movs, '2026-10', cats)
  assert.equal(r.entro, 6050000)
  assert.equal(r.salio, 1270000)
  assert.equal(r.quedo, 4780000)
  assert.equal(r.areas.estudio.quedo, 2550000)
  assert.equal(r.areas.casa.quedo, -620000)
  assert.equal(r.areas.casa.gastos[0].nombre, 'Supermercado')
  assert.equal(r.cantidad, 4)
})

test('el desglose junta lo que sobra en una última fila', () => {
  const area = {
    ingresos: [{ nombre: 'Honorarios', monto: 100, cantidad: 1 }],
    gastos: [10, 9, 8, 7, 6].map((m, i) => ({ nombre: `G${i}`, monto: m, cantidad: 1 })),
  }
  const filas = desglose(area, 5)
  assert.equal(filas.length, 5)
  assert.equal(filas[4].nombre, 'Otras categorías')
  assert.equal(filas[4].monto, 13)
  assert.equal(filas[4].tipo, 'gasto')
})

test('vencimientos ordenados y siguiente período', () => {
  const gf = [
    { id: 'b', activo: true, proximo_vencimiento: '2026-11-15' },
    { id: 'a', activo: true, proximo_vencimiento: '2026-11-01' },
    { id: 'x', activo: false, proximo_vencimiento: '2026-10-01' },
  ]
  const p = proximosVencimientos(gf, '2026-10-26')
  assert.deepEqual(p.map((g) => g.id), ['a', 'b'])
  assert.equal(p[0].dias, 6)
  assert.equal(siguienteVencimiento('2026-11-05', 'anual'), '2027-11-05')
  assert.equal(siguienteVencimiento('2026-11-20', 'semestral'), '2027-05-20')
})

test('aguinaldo sugerido: mitad del mejor sueldo del semestre', () => {
  const persona = { sueldo_mensual: 700000 }
  const pagos = [
    { categoria_id: 'sec', monto: 600000, fecha: '2026-08-01' },
    { categoria_id: 'sec', monto: 650000, fecha: '2026-10-01' },
    { categoria_id: 'agu', monto: 999999, fecha: '2026-06-30' },
    { categoria_id: 'sec', monto: 900000, fecha: '2026-05-01' }, // otro semestre
  ]
  assert.equal(aguinaldoSugerido(persona, pagos, cats, '2026-12-18'), 325000)
  // Sin sueldos cargados en el semestre: la mitad del sueldo configurado
  assert.equal(aguinaldoSugerido(persona, [], cats, '2026-12-18'), 350000)
})

test('ingreso de Mis Cargas por patente, con meses negativos', () => {
  const movs = [
    mov({ tipo: 'ingreso', area: 'camiones', categoria_id: 'mc', monto: 1120000, fecha: '2026-10-31', origen: 'mis_cargas', patente: 'AE 412 KT', nota: '9 viajes' }),
    mov({ tipo: 'gasto', area: 'camiones', categoria_id: 'mcn', monto: 50000, fecha: '2026-10-31', origen: 'mis_cargas', patente: 'AC 930 LM', nota: '1 viaje' }),
    mov({ tipo: 'ingreso', area: 'camiones', categoria_id: 'mc', monto: 5, fecha: '2026-10-31', origen: 'manual' }),
  ]
  const p = ingresoPorPatente(movs, '2026-10')
  assert.deepEqual(p.map((x) => [x.patente, x.monto]), [['AE 412 KT', 1120000], ['AC 930 LM', -50000]])
})

test('control del tope del monotributo en 12 meses', () => {
  const movs = [
    mov({ tipo: 'ingreso', categoria_id: 'hon', monto: 1000000, fecha: '2025-11-01' }), // primer día del rango
    mov({ tipo: 'ingreso', categoria_id: 'hon', monto: 7000000, fecha: '2026-10-20' }),
    mov({ tipo: 'ingreso', categoria_id: 'hon', monto: 5000000, fecha: '2025-10-31' }), // afuera
    mov({ tipo: 'gasto', categoria_id: 'sec', monto: 5000000, fecha: '2026-10-20' }), // no es ingreso
  ]
  const c = controlMonotributo(movs, cats, { monotributo_tope: 10000000, monotributo_aviso_pct: 80 }, '2026-10-26')
  assert.equal(c.desde, '2025-11-01')
  assert.equal(c.facturado, 8000000)
  assert.equal(c.estado, 'cerca')
  assert.equal(c.margen, 2000000)
  assert.equal(c.meses.length, 12)
  assert.equal(c.meses[11].monto, 7000000)
  assert.equal(controlMonotributo(movs, cats, {}, '2026-10-26').estado, 'sin_tope')
})

test('deducibles agrupados por concepto en el año', () => {
  const conceptos = [{ id: 'pre', nombre: 'Prepaga' }, { id: 'cp', nombre: 'Casas particulares' }]
  const movs = [
    mov({ tipo: 'gasto', monto: 100, fecha: '2026-01-10', concepto_deducible_id: 'pre' }),
    mov({ tipo: 'gasto', monto: 150, fecha: '2026-02-10', concepto_deducible_id: 'pre' }),
    mov({ tipo: 'gasto', monto: 999, fecha: '2025-12-31', concepto_deducible_id: 'pre' }),
    mov({ tipo: 'gasto', monto: 50, fecha: '2026-03-10' }),
  ]
  const d = deduciblesDelAnio(movs, conceptos, 2026)
  assert.equal(d.total, 250)
  assert.equal(d.filas.length, 1)
  assert.equal(d.filas[0].porMes[1], 150)
})

test('las listas juntan lo de Mis Cargas en una fila por mes', async () => {
  const { agruparParaLista } = await import('./calculos.js')
  const movs = [
    mov({ id: 1, tipo: 'gasto', monto: 10, fecha: '2026-10-20' }),
    mov({ id: 2, tipo: 'ingreso', monto: 100, fecha: '2026-10-31', origen: 'mis_cargas', patente: 'A' }),
    mov({ id: 3, tipo: 'gasto', monto: 30, fecha: '2026-10-31', origen: 'mis_cargas', patente: 'B' }),
    mov({ id: 4, tipo: 'ingreso', monto: 50, fecha: '2026-09-30', origen: 'mis_cargas', patente: 'A' }),
  ]
  const filas = agruparParaLista(movs)
  assert.equal(filas.length, 3)
  assert.deepEqual([filas[0].clase, filas[0].monto, filas[0].camiones], ['mis_cargas', 70, 2])
  assert.equal(filas[1].mov.id, 1)
  assert.equal(filas[2].mes, '2026-09')
})
