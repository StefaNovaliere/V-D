// Regalo 1: "Carpeta para el contador". Arma el mes elegido en un Excel con
// una hoja de resumen y una hoja por área. Si hay comprobantes, baja un ZIP
// con el Excel y las fotos en una carpeta por área, y la columna
// "Comprobante" del Excel dice qué archivo es cada uno.

import { AREA, AREAS, ORIGEN } from './areas.js'
import { resumenDelMes } from './calculos.js'
import { fechaCorta, tituloMes } from './fechas.js'

const FORMATO_PESOS = '"$" #,##0.00;[Red]-"$" #,##0.00'

/** Celda con número y formato de pesos (para que el contador pueda sumar). */
const pesos = (n) => ({ t: 'n', v: Math.round(Number(n) * 100) / 100, z: FORMATO_PESOS })

export function armarLibro(XLSX, { mes, movimientos, categorias, conceptos, personas, miembros, archivosPorMov = {} }) {
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
      ['Fecha', 'Tipo', 'Categoría', 'Detalle', 'Monto', 'Persona', 'Patente', 'Deducible (a confirmar)', 'Origen', 'Cargó', 'Comprobante'],
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
        miembros.find((x) => x.user_id === m.creado_por)?.nombre ?? (m.origen === 'fijo' ? 'Se cargó solo' : ''),
        (archivosPorMov[m.id] ?? []).join(', '),
      ]),
      [],
      ['', '', '', 'Entró', pesos(r.areas[area].entro)],
      ['', '', '', 'Salió', pesos(-r.areas[area].salio)],
      ['', '', '', 'Quedó', pesos(r.areas[area].quedo)],
    ]
    const hoja = XLSX.utils.aoa_to_sheet(datos)
    hoja['!cols'] = [{ wch: 11 }, { wch: 8 }, { wch: 26 }, { wch: 30 }, { wch: 15 }, { wch: 14 }, { wch: 11 }, { wch: 30 }, { wch: 16 }, { wch: 12 }, { wch: 40 }]
    XLSX.utils.book_append_sheet(libro, hoja, AREA[area].nombre)
  }
  return libro
}

// Nombre de archivo legible y sin caracteres que Windows no acepta.
const limpiar = (t) => t.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60)

/**
 * `comprobantes`: filas de la tabla comprobantes del mes.
 * `bajar(ruta)`: devuelve el Blob del archivo.
 */
export async function descargarCarpetaContador(datos, comprobantes = [], bajar = null) {
  // xlsx y jszip pesan: se bajan solo cuando alguien pide la carpeta.
  const XLSX = await import('xlsx')
  const nombre = `Cuentas ${datos.mes}`
  if (!comprobantes.length || !bajar) {
    XLSX.writeFile(armarLibro(XLSX, datos), `${nombre}.xlsx`)
    return { archivos: 0, faltaron: 0 }
  }

  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const archivosPorMov = {}
  const usados = new Set()
  let faltaron = 0
  for (const c of comprobantes) {
    const m = datos.movimientos.find((x) => x.id === c.movimiento_id)
    if (!m) continue
    const cat = datos.categorias.find((x) => x.id === m.categoria_id)?.nombre ?? 'Movimiento'
    const base = limpiar(`${m.fecha.slice(8, 10)}-${m.fecha.slice(5, 7)} ${cat}${m.nota ? ` ${m.nota}` : ''}`)
    const ext = c.ruta.split('.').pop()
    let archivo = `${AREA[m.area].nombre}/${base}.${ext}`
    for (let i = 2; usados.has(archivo); i++) archivo = `${AREA[m.area].nombre}/${base} (${i}).${ext}`
    try {
      zip.file(`comprobantes/${archivo}`, await bajar(c.ruta))
      usados.add(archivo)
      archivosPorMov[m.id] = [...(archivosPorMov[m.id] ?? []), archivo]
    } catch {
      faltaron++
    }
  }
  const libro = armarLibro(XLSX, { ...datos, archivosPorMov })
  zip.file(`${nombre}.xlsx`, XLSX.write(libro, { type: 'array', bookType: 'xlsx' }))
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombre}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  return { archivos: usados.size, faltaron }
}
