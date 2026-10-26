// Regalo 1: "Carpeta para el contador". Arma el mes elegido en un Excel con
// una hoja de resumen y una hoja por área, listo para mandar.
//
// Las fotos de comprobantes no van porque guardarlas es un opcional que
// todavía no está contratado; cuando se sume, se agregan acá.

import { AREA, AREAS, ORIGEN } from './areas.js'
import { resumenDelMes } from './calculos.js'
import { fechaCorta, tituloMes } from './fechas.js'

const FORMATO_PESOS = '"$" #,##0.00;[Red]-"$" #,##0.00'

/** Celda con número y formato de pesos (para que el contador pueda sumar). */
const pesos = (n) => ({ t: 'n', v: Math.round(Number(n) * 100) / 100, z: FORMATO_PESOS })

export function armarLibro(XLSX, { mes, movimientos, categorias, conceptos, personas, miembros }) {
  const libro = XLSX.utils.book_new()
  const r = resumenDelMes(movimientos, mes, categorias)

  const hojaResumen = XLSX.utils.aoa_to_sheet([
    [`Cuentas de la familia · ${tituloMes(mes)}`],
    [],
    ['Área', 'Entró', 'Salió', 'Quedó', 'Movimientos'],
    ...AREAS.map((a) => [AREA[a].nombre, pesos(r.areas[a].entro), pesos(r.areas[a].salio), pesos(r.areas[a].quedo), r.areas[a].cantidad]),
    ['Total familia', pesos(r.entro), pesos(r.salio), pesos(r.quedo), r.cantidad],
  ])
  hojaResumen['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 13 }]
  XLSX.utils.book_append_sheet(libro, hojaResumen, 'Resumen')

  const nombreDe = (lista, id, campo = 'nombre') => lista.find((x) => x.id === id)?.[campo] ?? ''
  for (const area of AREAS) {
    const filas = movimientos
      .filter((m) => m.area === area)
      .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
    const datos = [
      ['Fecha', 'Tipo', 'Categoría', 'Detalle', 'Monto', 'Persona', 'Patente', 'Deducible (a confirmar)', 'Origen', 'Cargó'],
      ...filas.map((m) => [
        fechaCorta(m.fecha),
        m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto',
        nombreDe(categorias, m.categoria_id),
        m.nota ?? '',
        pesos(m.tipo === 'ingreso' ? m.monto : -m.monto),
        nombreDe(personas, m.persona_id),
        m.patente ?? '',
        nombreDe(conceptos, m.concepto_deducible_id),
        ORIGEN[m.origen] ?? m.origen,
        miembros.find((x) => x.user_id === m.creado_por)?.nombre ?? '',
      ]),
      [],
      ['', '', '', 'Entró', pesos(r.areas[area].entro)],
      ['', '', '', 'Salió', pesos(-r.areas[area].salio)],
      ['', '', '', 'Quedó', pesos(r.areas[area].quedo)],
    ]
    const hoja = XLSX.utils.aoa_to_sheet(datos)
    hoja['!cols'] = [{ wch: 11 }, { wch: 8 }, { wch: 26 }, { wch: 30 }, { wch: 15 }, { wch: 14 }, { wch: 11 }, { wch: 30 }, { wch: 16 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(libro, hoja, AREA[area].nombre)
  }
  return libro
}

export async function descargarCarpetaContador(datos) {
  // xlsx pesa bastante: se baja solo cuando alguien pide el Excel.
  const XLSX = await import('xlsx')
  const libro = armarLibro(XLSX, datos)
  XLSX.writeFile(libro, `Cuentas ${datos.mes}.xlsx`)
}
