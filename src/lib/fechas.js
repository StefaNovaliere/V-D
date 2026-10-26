// Fechas de calendario como texto 'aaaa-mm-dd' y meses como 'aaaa-mm'.
//
// Nunca pasan por new Date('aaaa-mm-dd'): eso las interpreta como medianoche
// UTC y en Argentina (UTC-3) se muestran como el día anterior. Fue el bug de
// fechas corridas de Mis Cargas. Acá las cuentas se hacen con números y,
// cuando hace falta un Date, se arma con la hora local.

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

const dos = (n) => String(n).padStart(2, '0')

export function partes(iso) {
  const [a, m, d] = iso.split('-').map(Number)
  return { a, m, d }
}

export function armarFecha(a, m, d) {
  return `${a}-${dos(m)}-${dos(d)}`
}

/** Hoy en el reloj del teléfono, no en UTC. */
export function hoy(ahora = new Date()) {
  return armarFecha(ahora.getFullYear(), ahora.getMonth() + 1, ahora.getDate())
}

export function mesDe(iso) {
  return iso.slice(0, 7)
}

export function mesActual(ahora = new Date()) {
  return mesDe(hoy(ahora))
}

export function diasDelMes(a, m) {
  // Día 0 del mes siguiente = último día de este. Hora local, sin UTC.
  return new Date(a, m, 0).getDate()
}

export function primerDia(mes) {
  return `${mes}-01`
}

export function ultimoDia(mes) {
  const [a, m] = mes.split('-').map(Number)
  return armarFecha(a, m, diasDelMes(a, m))
}

export function sumarMeses(mes, n) {
  const [a, m] = mes.split('-').map(Number)
  const total = a * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${dos((total % 12) + 1)}`
}

/**
 * Suma meses a una fecha conservando el día. Si el mes de destino es más
 * corto (31 de enero + 1 mes), queda en su último día.
 */
export function sumarMesesAFecha(iso, n) {
  const { d } = partes(iso)
  const mes = sumarMeses(mesDe(iso), n)
  const [a, m] = mes.split('-').map(Number)
  return armarFecha(a, m, Math.min(d, diasDelMes(a, m)))
}

export function diasEntre(desde, hasta) {
  const a = partes(desde)
  const b = partes(hasta)
  // Date.UTC solo para contar días enteros sin que el horario de verano meta
  // una hora de más o de menos. No se usa para mostrar nada.
  return Math.round((Date.UTC(b.a, b.m - 1, b.d) - Date.UTC(a.a, a.m - 1, a.d)) / 86400000)
}

export function nombreMes(mes) {
  const [, m] = mes.split('-').map(Number)
  return MESES[m - 1]
}

const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1)

/** 'Octubre 2026' */
export function tituloMes(mes) {
  const [a] = mes.split('-')
  return `${mayuscula(nombreMes(mes))} ${a}`
}

export function nombreMesCorto(mes) {
  return mayuscula(nombreMes(mes))
}

/** 'dd/mm/aaaa' */
export function fechaCorta(iso) {
  if (!iso) return ''
  const { a, m, d } = partes(iso)
  return `${dos(d)}/${dos(m)}/${a}`
}

/** 'dd/mm', para listas donde el año se sobreentiende. */
export function diaMes(iso) {
  const { m, d } = partes(iso)
  return `${dos(d)}/${dos(m)}`
}

/** '1 de noviembre' */
export function fechaLarga(iso, conAnio = false) {
  const { a, m, d } = partes(iso)
  return `${d} de ${MESES[m - 1]}${conAnio ? ` de ${a}` : ''}`
}

export function abrevMes(iso) {
  return MESES[partes(iso).m - 1].slice(0, 3).toUpperCase()
}

/** Semestre del aguinaldo: enero–junio o julio–diciembre. */
export function semestreDe(iso) {
  const { a, m } = partes(iso)
  return m <= 6
    ? { desde: armarFecha(a, 1, 1), hasta: armarFecha(a, 6, 30) }
    : { desde: armarFecha(a, 7, 1), hasta: armarFecha(a, 12, 31) }
}
