import { useEffect, useRef, useState } from 'react'
import { MENOS, plata } from '../lib/formato.js'
import { PuntoArea } from './ui.jsx'

// Ticks del eje en millones o miles: "$ 1,5 M", "$ 800 K".
function compacto(n) {
  const abs = Math.abs(n)
  const signo = n < 0 ? `${MENOS} ` : ''
  if (abs >= 1e6) return `${signo}$ ${(abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1).replace('.', ',').replace(',0', '')} M`
  if (abs >= 1e3) return `${signo}$ ${Math.round(abs / 1e3)} K`
  return `${signo}$ ${Math.round(abs)}`
}

function pasoLindo(max) {
  const bruto = max / 4
  const potencia = 10 ** Math.floor(Math.log10(bruto || 1))
  for (const m of [1, 2, 2.5, 5, 10]) if (bruto <= m * potencia) return m * potencia
  return 10 * potencia
}

// Barra con la punta redondeada (4 px) y la base recta, como pide la guía.
function barra(x, yBase, ancho, alto, haciaArriba) {
  const r = Math.min(4, ancho / 2, Math.abs(alto))
  if (Math.abs(alto) < 0.5) return ''
  if (haciaArriba) {
    const top = yBase - alto
    return `M${x},${yBase} V${top + r} Q${x},${top} ${x + r},${top} H${x + ancho - r} Q${x + ancho},${top} ${x + ancho},${top + r} V${yBase} Z`
  }
  const bottom = yBase + alto
  return `M${x},${yBase} V${bottom - r} Q${x},${bottom} ${x + r},${bottom} H${x + ancho - r} Q${x + ancho},${bottom} ${x + ancho},${bottom - r} V${yBase} Z`
}

/**
 * Columnas de lo que quedó cada mes: hacia arriba si quedó plata, hacia
 * abajo si faltó. Verde y rojo marcan el signo, pero el signo también está
 * en el texto (tooltip y tabla), así que no depende solo del color.
 */
// Ancho real del contenedor, para dibujar en píxeles: con un viewBox fijo,
// en el celular las letras del eje quedaban diminutas.
function useAncho() {
  const ref = useRef(null)
  const [ancho, setAncho] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const obs = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)))
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return [ref, ancho]
}

export function ColumnasSaldo({ datos, etiquetas }) {
  const [activo, setActivo] = useState(null)
  const [ref, medido] = useAncho()
  const W = medido || 320
  const H = 240
  const izq = 58
  const der = 8
  const arriba = 16
  const abajo = 28
  const valores = datos.map((d) => d.valor)
  const maxAbs = Math.max(1, ...valores.map((v) => Math.abs(v)))
  const paso = pasoLindo(maxAbs)
  const tope = Math.max(paso, Math.ceil(Math.max(0, ...valores) / paso) * paso)
  const piso = Math.min(0, Math.floor(Math.min(0, ...valores) / paso) * paso)
  const alto = H - arriba - abajo
  const y = (v) => arriba + ((tope - v) / (tope - piso || 1)) * alto
  const ranura = (W - izq - der) / datos.length
  const ancho = Math.min(24, ranura * 0.55)
  const ticks = []
  for (let v = piso; v <= tope + 1e-6; v += paso) ticks.push(v)

  const d = activo !== null ? datos[activo] : null
  return (
    <div className="relative" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label="Cuánto les quedó cada mes">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={izq} x2={W - der} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#c9ced5' : '#eceef1'} strokeWidth="1" />
            <text x={izq - 8} y={y(t) + 4} textAnchor="end" className="num fill-suave text-[12px]">{compacto(t)}</text>
          </g>
        ))}
        {datos.map((dato, i) => {
          const x = izq + i * ranura + (ranura - ancho) / 2
          const positivo = dato.valor >= 0
          const h = Math.abs(y(dato.valor) - y(0))
          return (
            <g key={dato.clave}>
              <path
                d={barra(x, y(0), ancho, h, positivo)}
                className={positivo ? 'fill-positivo' : 'fill-negativo'}
                opacity={activo === null || activo === i ? 1 : 0.45}
              />
              <text x={izq + i * ranura + ranura / 2} y={H - 8} textAnchor="middle" className="fill-suave text-[12px]">{etiquetas[i]}</text>
              {/* Zona sensible más grande que la barra */}
              <rect
                x={izq + i * ranura} y={arriba} width={ranura} height={alto}
                fill="transparent"
                onMouseEnter={() => setActivo(i)}
                onMouseLeave={() => setActivo(null)}
                onClick={() => setActivo(activo === i ? null : i)}
              />
            </g>
          )
        })}
      </svg>
      {d && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-borde bg-white px-3 py-2 text-[13px]"
          style={{ left: `${((izq + activo * ranura + ranura / 2) / W) * 100}%` }}
        >
          <div className="font-semibold">{d.titulo}</div>
          <div className="num">Quedó {plata(d.valor)}</div>
          <div className="num text-suave">Entró {plata(d.entro)} · Salió {plata(d.salio)}</div>
        </div>
      )}
    </div>
  )
}

/**
 * Barras horizontales de "en qué se fue la plata". Un solo color (es una
 * sola serie); el área va como punto y nombre, no como color de la barra.
 */
export function BarrasCategorias({ filas }) {
  const max = Math.max(1, ...filas.map((f) => f.monto))
  return (
    <ul className="space-y-3">
      {filas.map((f) => (
        <li key={f.clave} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 md:grid-cols-[14rem_1fr]">
          <span className="flex min-w-0 items-center gap-2 text-[14px]">
            {f.area && <PuntoArea area={f.area} />}
            <span className="truncate">{f.nombre}</span>
          </span>
          <span className="flex items-center gap-2">
            <span
              className="h-3 rounded-r bg-acento"
              style={{ width: `${Math.max(1, (f.monto / max) * 100) * 0.72}%` }}
              title={`${f.nombre}: ${plata(f.monto)}`}
            />
            <span className="num whitespace-nowrap text-[13px] text-suave">{plata(f.monto)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
