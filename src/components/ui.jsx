import { useEffect } from 'react'
import { X } from 'lucide-react'
import { AREA } from '../lib/areas.js'
import { MENOS, plata } from '../lib/formato.js'

export function PuntoArea({ area, className = '' }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${AREA[area].punto} ${className}`} />
}

export function EtiquetaArea({ area }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-fondo px-2.5 py-0.5 text-[13px] text-suave">
      <PuntoArea area={area} />
      {AREA[area].nombre}
    </span>
  )
}

/**
 * Un monto. Con `tipo="gasto"` se muestra con signo menos; con `saldo` se
 * pinta de verde o rojo según dé positivo o negativo.
 */
export function Monto({ valor, tipo, saldo = false, signo = false, className = '' }) {
  const n = Number(valor) || 0
  let texto = plata(n, { signo })
  if (tipo === 'gasto' && n > 0) texto = `${MENOS} ${plata(n)}`
  let color = ''
  if (saldo) color = n < 0 ? 'text-negativo' : 'text-positivo'
  else if (tipo === 'ingreso') color = 'text-positivo'
  return <span className={`num whitespace-nowrap ${color} ${className}`}>{texto}</span>
}

export function Tarjeta({ children, className = '', ...resto }) {
  return (
    <div className={`tarjeta ${className}`} {...resto}>
      {children}
    </div>
  )
}

export function Rotulo({ children, className = '' }) {
  return <div className={`rotulo ${className}`}>{children}</div>
}

/** Control segmentado del boceto (Casa · Estudio · Camiones). */
export function Segmentado({ opciones, valor, onCambio, etiqueta }) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex rounded-xl bg-[#eceef1] p-1">
      {opciones.map((o) => {
        const activo = o.valor === valor
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onCambio(o.valor)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2 text-[15px] transition-colors ${
              activo ? 'bg-white font-semibold text-tinta' : 'text-suave hover:text-tinta'
            }`}
          >
            {o.area && <PuntoArea area={o.area} />}
            {o.nombre}
          </button>
        )
      })}
    </div>
  )
}

export function Chips({ opciones, valor, onCambio, color = 'acento' }) {
  const activoClase = {
    acento: 'border-acento bg-acento-claro text-acento font-semibold',
    casa: 'border-casa bg-casa-claro text-casa font-semibold',
    estudio: 'border-estudio bg-estudio-claro text-estudio font-semibold',
    camiones: 'border-camiones bg-camiones-claro text-camiones font-semibold',
  }[color]
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={o.valor === valor}
          onClick={() => onCambio(o.valor === valor && o.deseleccionable ? null : o.valor)}
          className={`chip ${o.valor === valor ? activoClase : 'border-borde bg-white text-tinta hover:bg-fondo'}`}
        >
          {o.nombre}
        </button>
      ))}
    </div>
  )
}

export function Interruptor({ activo, onCambio, etiqueta }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={() => onCambio(!activo)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${activo ? 'bg-positivo' : 'bg-[#cfd4da]'}`}
    >
      <span
        className={`absolute left-0 top-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
          activo ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export function Campo({ etiqueta, ayuda, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="rotulo mb-2 block">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1.5 block text-[13px] text-suave">{ayuda}</span>}
    </label>
  )
}

/**
 * Hoja que sube desde abajo en el celular y es un diálogo centrado en la
 * computadora.
 */
export function Hoja({ abierta, onCerrar, titulo, children }) {
  useEffect(() => {
    if (!abierta) return
    const alApretar = (e) => e.key === 'Escape' && onCerrar()
    document.addEventListener('keydown', alApretar)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', alApretar)
      document.body.style.overflow = overflow
    }
  }, [abierta, onCerrar])

  if (!abierta) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={titulo}>
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-tinta/40" onClick={onCerrar} />
      <div className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 safe-bottom md:max-w-md md:rounded-2xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button type="button" onClick={onCerrar} className="rounded-lg p-1.5 text-suave hover:bg-fondo" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Vacio({ children }) {
  return <p className="py-6 text-center text-[15px] text-suave">{children}</p>
}

export function Cargando() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-suave" role="status">
      Cargando…
    </div>
  )
}
