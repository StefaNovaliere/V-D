import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { mesActual, nombreMesCorto, sumarMeses, tituloMes } from '../lib/fechas.js'
import { Hoja, PuntoArea } from './ui.jsx'

/**
 * Encabezado de cada pantalla. En el celular: título a la izquierda y una
 * pastilla a la derecha (el mes). En la computadora: título grande, flechas
 * para cambiar de mes y el botón "Cargar movimiento".
 */
export default function Encabezado({ titulo, tituloCelular, area, volver, conMes = true, acciones, nuevoHref = '/nuevo' }) {
  return (
    <>
      {/* Celular */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-borde bg-white px-5 pb-3.5 pt-[max(0.875rem,env(safe-area-inset-top))] md:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          {volver && (
            <Link to={volver} className="-ml-1 rounded-lg p-1 text-suave" aria-label="Volver">
              <ArrowLeft size={22} />
            </Link>
          )}
          {area && <PuntoArea area={area} className="h-2.5 w-2.5" />}
          <h1 className="truncate text-[22px] font-semibold">{tituloCelular ?? titulo}</h1>
        </div>
        {conMes && <PastillaMes corta={Boolean(area || volver)} />}
      </header>

      {/* Computadora */}
      <header className="hidden items-center justify-between gap-6 px-10 pb-6 pt-8 md:flex">
        <div className="flex items-center gap-3">
          {area && <PuntoArea area={area} className="h-3 w-3" />}
          <h1 className="text-[28px] font-semibold">{titulo}</h1>
        </div>
        <div className="flex items-center gap-4">
          {conMes && <FlechasMes />}
          {acciones}
          <Link to={nuevoHref} className="boton-primario">
            <Plus size={18} /> Cargar movimiento
          </Link>
        </div>
      </header>
    </>
  )
}

function FlechasMes() {
  const mes = useStore((s) => s.mes)
  const setMes = useStore((s) => s.setMes)
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => setMes(sumarMeses(mes, -1))} className="rounded-lg p-1.5 text-suave hover:bg-white" aria-label="Mes anterior">
        <ChevronLeft size={18} />
      </button>
      <span className="min-w-[9.5rem] rounded-xl border border-borde bg-white px-4 py-2 text-center font-semibold">
        {tituloMes(mes)}
      </span>
      <button type="button" onClick={() => setMes(sumarMeses(mes, 1))} className="rounded-lg p-1.5 text-suave hover:bg-white" aria-label="Mes siguiente">
        <ChevronRight size={18} />
      </button>
    </div>
  )
}

function PastillaMes({ corta }) {
  const mes = useStore((s) => s.mes)
  const setMes = useStore((s) => s.setMes)
  const [abierta, setAbierta] = useState(false)
  const actual = mesActual()
  // El mes que viene también, por si quieren cargar algo adelantado.
  const meses = Array.from({ length: 25 }, (_, i) => sumarMeses(actual, 1 - i))
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="shrink-0 rounded-full bg-[#eceef1] px-3 py-1 text-[14px] text-suave"
      >
        {corta ? nombreMesCorto(mes) : 'Cambiar mes'}
      </button>
      <Hoja abierta={abierta} onCerrar={() => setAbierta(false)} titulo="Elegí el mes">
        <div className="grid grid-cols-2 gap-2">
          {meses.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMes(m); setAbierta(false) }}
              className={`rounded-xl border px-3 py-3 text-left text-[15px] ${
                m === mes ? 'border-acento bg-acento-claro font-semibold text-acento' : 'border-borde'
              }`}
            >
              {tituloMes(m)}
            </button>
          ))}
        </div>
      </Hoja>
    </>
  )
}
