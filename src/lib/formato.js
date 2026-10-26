// Plata en pesos: '$ 1.234.567'. Los montos se guardan con centavos pero se
// muestran redondeados al peso, que es como los piensa la familia.

const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

export const MENOS = '−'

/**
 * plata(1665000)            → '$ 1.665.000'
 * plata(-650000)            → '− $ 650.000'
 * plata(255000, {signo})    → '+ $ 255.000'
 */
export function plata(valor, { signo = false } = {}) {
  const n = Math.round(Number(valor) || 0)
  const texto = `$ ${miles(Math.abs(n))}`
  if (n < 0) return `${MENOS} ${texto}`
  if (signo && n > 0) return `+ ${texto}`
  return texto
}

/** Con centavos, para cuando importan (el detalle de un movimiento). */
export function plataExacta(valor) {
  const n = Number(valor) || 0
  const centavos = Math.round(Math.abs(n) * 100)
  const enteros = Math.floor(centavos / 100)
  const resto = centavos % 100
  const texto = `$ ${miles(enteros)}${resto ? `,${String(resto).padStart(2, '0')}` : ''}`
  return n < 0 ? `${MENOS} ${texto}` : texto
}

/**
 * Lo que se escribe en el campo de monto: '1.234.567,5' → 1234567.5.
 * El punto es separador de miles y la coma de decimales, como en Argentina.
 * Devuelve null si no hay un número válido.
 */
export function leerMonto(texto) {
  if (texto === null || texto === undefined) return null
  const limpio = String(texto).replace(/[^\d,]/g, '')
  if (!limpio) return null
  const [enteros, decimales = ''] = limpio.split(',')
  const n = Number(`${enteros || '0'}.${decimales.slice(0, 2) || '0'}`)
  return Number.isFinite(n) ? n : null
}

/** Reescribe lo tipeado con puntos de miles mientras se escribe. */
export function formatearEntrada(texto) {
  const limpio = String(texto ?? '').replace(/[^\d,]/g, '')
  if (!limpio) return ''
  const coma = limpio.indexOf(',')
  const enteros = (coma === -1 ? limpio : limpio.slice(0, coma)).replace(/^0+(?=\d)/, '')
  if (coma === -1) return miles(enteros)
  const decimales = limpio.slice(coma + 1).replace(/,/g, '').slice(0, 2)
  return `${miles(enteros || '0')},${decimales}`
}

/** Para poner un monto guardado en el campo de edición. */
export function montoAEntrada(valor) {
  const n = Number(valor) || 0
  const centavos = Math.round(n * 100)
  const enteros = Math.floor(centavos / 100)
  const resto = centavos % 100
  return resto ? `${miles(enteros)},${String(resto).padStart(2, '0')}` : miles(enteros)
}

export function porcentaje(valor) {
  return `${Math.round(valor)} %`
}
