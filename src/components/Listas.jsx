import { Link } from 'react-router-dom'
import { useStore, nombreMiembro } from '../store/useStore.js'
import { agruparParaLista, textoDias } from '../lib/calculos.js'
import { AREA } from '../lib/areas.js'
import { abrevMes, diaMes, fechaLarga, partes } from '../lib/fechas.js'
import { tituloMovimiento } from '../lib/textos.js'
import { EtiquetaArea, Monto, PuntoArea, Vacio } from './ui.jsx'

function subtituloMovimiento(mov, miembros, personas) {
  const partesTexto = [diaMes(mov.fecha)]
  const persona = personas.find((p) => p.id === mov.persona_id)
  if (persona) partesTexto.push(persona.nombre)
  if (mov.patente) partesTexto.push(mov.patente)
  if (mov.origen === 'fijo') partesTexto.push('Gasto fijo')
  const quien = nombreMiembro(miembros, mov.creado_por)
  if (quien) partesTexto.push(`Cargó ${quien}`)
  return partesTexto.join(' · ')
}

/**
 * Lista de movimientos. `compacta` es la del resumen (sin agrupar por día);
 * la otra agrupa por fecha, para la pantalla Movimientos.
 */
export function ListaMovimientos({ movimientos, limite, porDia = false, vacio = 'Todavía no hay movimientos en este mes.' }) {
  const categorias = useStore((s) => s.categorias)
  const miembros = useStore((s) => s.miembros)
  const personas = useStore((s) => s.personas)
  const filas = agruparParaLista(movimientos).slice(0, limite)
  if (!filas.length) return <Vacio>{vacio}</Vacio>

  return (
    <ul className="divide-y divide-borde">
      {filas.map((f, i) => {
        const separador = porDia && (i === 0 || filas[i - 1].fecha !== f.fecha)
        const contenido = f.clase === 'mis_cargas'
          ? (
            <Link to="/area/camiones" className="flex items-center gap-3 py-3 hover:bg-fondo/60 md:-mx-2 md:px-2 md:rounded-lg">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[16px]">Ingreso limpio de los camiones</div>
                <div className="text-[14px] text-suave">
                  Llegó solo desde Mis Cargas · {f.camiones} {f.camiones === 1 ? 'camión' : 'camiones'}
                </div>
              </div>
              <span className="hidden md:block"><EtiquetaArea area="camiones" /></span>
              <Monto valor={f.monto} saldo className="w-32 text-right text-[16px]" />
            </Link>
          )
          : (
            <Link
              to={`/movimiento/${f.mov.id}`}
              className="flex items-center gap-3 py-3 hover:bg-fondo/60 md:-mx-2 md:px-2 md:rounded-lg"
            >
              <PuntoArea area={f.mov.area} className="md:hidden" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[16px]">{tituloMovimiento(f.mov, categorias)}</div>
                <div className="truncate text-[14px] text-suave">{subtituloMovimiento(f.mov, miembros, personas)}</div>
              </div>
              <span className="hidden md:block"><EtiquetaArea area={f.mov.area} /></span>
              <Monto valor={f.mov.monto} tipo={f.mov.tipo} className="w-32 text-right text-[16px]" />
            </Link>
          )
        return (
          <li key={f.clase === 'mis_cargas' ? `mc-${f.mes}` : f.mov.id}>
            {separador && (
              <div className="rotulo pb-1 pt-4">{fechaLarga(f.fecha)}</div>
            )}
            {contenido}
          </li>
        )
      })}
    </ul>
  )
}

function etiquetaDias(dias) {
  const clase = dias < 0
    ? 'bg-red-50 text-negativo'
    : dias <= 7
      ? 'bg-camiones-claro text-camiones'
      : 'bg-fondo text-suave'
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${clase}`}>{textoDias(dias)}</span>
}

/** Vencimientos con el día grande a la izquierda, como en el boceto. */
export function ListaVencimientos({ vencimientos, onElegir, mostrarDias = 7 }) {
  if (!vencimientos.length) return <Vacio>No hay vencimientos cargados.</Vacio>
  return (
    <ul className="divide-y divide-borde">
      {vencimientos.map((v) => {
        const contenido = (
          <>
            <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-borde">
              <span className="num text-[19px] font-semibold leading-none">{String(partes(v.proximo_vencimiento).d).padStart(2, '0')}</span>
              <span className="mt-1 text-[11px] text-suave">{abrevMes(v.proximo_vencimiento)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px]">
                {v.concepto}{v.patente ? ` · ${v.patente}` : ''}
              </div>
              <div className="truncate text-[14px] text-suave">
                {AREA[v.area].nombre} · <span className="num">{v.monto ? <Monto valor={v.monto} /> : 'sin monto'}</span>
                {v.detalle && !v.patente ? ` · ${v.detalle}` : ''}
              </div>
            </div>
            {v.dias <= mostrarDias && etiquetaDias(v.dias)}
          </>
        )
        return (
          <li key={v.id}>
            {onElegir ? (
              <button type="button" onClick={() => onElegir(v)} className="flex w-full items-center gap-3.5 py-3 text-left hover:bg-fondo/60 md:-mx-2 md:px-2 md:rounded-lg">
                {contenido}
              </button>
            ) : (
              <div className="flex items-center gap-3.5 py-3">{contenido}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
