import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Plus, TriangleAlert } from 'lucide-react'
import { useStore } from '../store/useStore.js'
import Encabezado from '../components/Encabezado.jsx'
import { ListaMovimientos, ListaVencimientos } from '../components/Listas.jsx'
import { Monto, PuntoArea, Rotulo, Tarjeta } from '../components/ui.jsx'
import { desglose, delMes, proporciones, proximosVencimientos, resumenDelMes } from '../lib/calculos.js'
import { AREA, AREAS } from '../lib/areas.js'
import { fechaLarga, hoy, mesActual, nombreMes, nombreMesCorto, sumarMeses, tituloMes } from '../lib/fechas.js'
import { plata, porcentaje } from '../lib/formato.js'

function useResumen() {
  const mes = useStore((s) => s.mes)
  const movimientos = useStore((s) => s.movimientos)
  const categorias = useStore((s) => s.categorias)
  return useMemo(() => {
    const actual = resumenDelMes(movimientos, mes, categorias)
    const anterior = resumenDelMes(movimientos, sumarMeses(mes, -1), categorias)
    return { mes, actual, anterior, movsMes: delMes(movimientos, mes) }
  }, [mes, movimientos, categorias])
}

function tituloQuedo(mes) {
  return mes === mesActual() ? 'Les quedó este mes' : `Les quedó en ${nombreMes(mes)}`
}

/** Barra fina con la parte de cada área en lo que entró o salió. */
function BarraAreas({ resumen, campo }) {
  const partes = proporciones(resumen, campo)
  return (
    <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-fondo" aria-hidden="true">
      {partes.map((p) => (
        <div key={p.area} className={AREA[p.area].punto} style={{ width: `${p.pct}%` }} />
      ))}
    </div>
  )
}

function Comparacion({ mes, actual, anterior, className = '' }) {
  const diferencia = actual.quedo - anterior.quedo
  if (!anterior.cantidad) return null
  return (
    <div className={`text-[14px] text-suave ${className}`}>
      Este mes,{' '}
      <span className={`num font-semibold ${diferencia < 0 ? 'text-negativo' : 'text-positivo'}`}>
        {plata(diferencia, { signo: true })}
      </span>{' '}
      que en {nombreMes(sumarMeses(mes, -1))}
    </div>
  )
}

function AvisoMonotributo() {
  const mono = useStore((s) => s.monotributo)
  if (!mono || (mono.estado !== 'cerca' && mono.estado !== 'superado')) return null
  return (
    <Link to="/monotributo" className="flex items-start gap-3 rounded-2xl border border-camiones/30 bg-camiones-claro px-4 py-3.5 text-[15px]">
      <TriangleAlert size={20} className="mt-0.5 shrink-0 text-camiones" />
      <span>
        {mono.estado === 'superado'
          ? 'La facturación de los últimos 12 meses pasó el tope de la categoría del monotributo.'
          : `La facturación de los últimos 12 meses ya llegó al ${porcentaje(mono.pct)} del tope del monotributo.`}{' '}
        <span className="font-semibold text-acento">Ver detalle</span>
      </span>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Celular
// ---------------------------------------------------------------------------

function subtituloArea(r) {
  const nombres = [...r.ingresos, ...r.gastos].slice(0, 4).map((c) =>
    c.clave === 'mis_cargas' ? 'Mis Cargas' : c.nombre.replace(/\s*\(.*\)/, ''))
  if (!nombres.length) return 'Sin movimientos'
  return nombres.map((n, i) => (i === 0 ? n : n.toLowerCase())).join(', ')
}

function ResumenCelular({ mes, actual, anterior, movsMes, vencimientos }) {
  const navegar = useNavigate()
  return (
    <div className="space-y-4 px-4 py-4 md:hidden">
      <AvisoMonotributo />
      <Tarjeta className="px-5 py-5">
        <Rotulo>{tituloQuedo(mes)}</Rotulo>
        <Monto valor={actual.quedo} saldo className="mt-2 block text-[40px] font-semibold leading-tight" />
        <div className="mt-3 flex justify-between gap-3 text-[15px]">
          <span className="text-suave">Entró <Monto valor={actual.entro} className="font-semibold text-tinta" /></span>
          <span className="text-suave">Salió <Monto valor={actual.salio} className="font-semibold text-tinta" /></span>
        </div>
        <Comparacion mes={mes} actual={actual} anterior={anterior} className="mt-3 border-t border-borde pt-3" />
      </Tarjeta>

      <Tarjeta className="px-5">
        <ul className="divide-y divide-borde">
          {AREAS.map((area) => {
            const r = actual.areas[area]
            return (
              <li key={area}>
                <Link to={`/area/${area}`} className="flex items-center gap-3 py-4">
                  <PuntoArea area={area} className="h-2.5 w-2.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[17px] font-medium">{AREA[area].nombre}</div>
                    <div className="text-[14px] leading-snug text-suave">{subtituloArea(r)}</div>
                  </div>
                  <Monto valor={r.quedo} saldo className="text-[17px] font-semibold" />
                </Link>
              </li>
            )
          })}
        </ul>
      </Tarjeta>

      {vencimientos[0] && (
        <Tarjeta className="px-5 py-4">
          <Link to="/vencimientos" className="block">
            <Rotulo>Próximo vencimiento</Rotulo>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-[17px] font-medium">{vencimientos[0].concepto}</div>
                <div className="text-[14px] text-suave">{fechaLarga(vencimientos[0].proximo_vencimiento)}</div>
              </div>
              <Monto valor={vencimientos[0].monto} className="text-[17px]" />
            </div>
          </Link>
        </Tarjeta>
      )}

      <Tarjeta className="px-5 pt-4">
        <div className="flex items-center justify-between">
          <Rotulo>Últimos movimientos</Rotulo>
          <Link to="/movimientos" className="text-[14px] text-acento">Ver todos</Link>
        </div>
        <ListaMovimientos movimientos={movsMes} limite={4} />
      </Tarjeta>

      <button
        type="button"
        onClick={() => navegar('/nuevo')}
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-acento text-white"
        aria-label="Cargar un gasto o ingreso"
      >
        <Plus size={26} />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Computadora
// ---------------------------------------------------------------------------

function FilaDesglose({ fila }) {
  const esMisCargas = fila.clave === 'mis_cargas' && fila.tipo === 'ingreso'
  return (
    <li className="flex items-baseline justify-between gap-4 py-1.5 text-[16px]">
      <span className={`truncate ${fila.tipo === 'ingreso' ? 'font-medium text-tinta' : 'text-suave'}`}>
        {esMisCargas ? (
          <>
            Ingreso limpio{' '}
            <span className="ml-1 inline-flex items-center gap-1 text-[13px] text-suave">
              <span className="h-1.5 w-1.5 rounded-full bg-positivo" /> Mis Cargas
            </span>
          </>
        ) : fila.nombre}
      </span>
      <Monto valor={fila.monto} tipo={fila.tipo === 'gasto' ? 'gasto' : undefined} className="text-tinta" />
    </li>
  )
}

function TarjetaArea({ area, r }) {
  const soloGastos = r.entro === 0
  const filas = desglose(r, 5)
  return (
    <Link to={`/area/${area}`} className="tarjeta block p-6 transition-colors hover:border-[#cfd4da]">
      <div className="flex items-center gap-2.5">
        <PuntoArea area={area} />
        <span className="text-[18px] font-semibold">{AREA[area].nombre}</span>
      </div>
      <div className="mt-5 flex items-baseline justify-between gap-3 border-b border-borde pb-4">
        <Rotulo>{soloGastos ? 'Gastos' : 'Saldo'}</Rotulo>
        <Monto valor={r.quedo} saldo className="text-[28px] font-semibold" />
      </div>
      {filas.length ? (
        <ul className="mt-3">
          {filas.map((f) => <FilaDesglose key={f.categoria_id ?? f.nombre} fila={f} />)}
        </ul>
      ) : (
        <p className="mt-4 text-[15px] text-suave">Sin movimientos en el mes.</p>
      )}
    </Link>
  )
}

function ResumenComputadora({ mes, actual, anterior, movsMes, vencimientos }) {
  const mesAnterior = sumarMeses(mes, -1)
  return (
    <div className="hidden space-y-6 px-10 md:block">
      <AvisoMonotributo />
      <Tarjeta className="grid grid-cols-[1.35fr_1fr_1fr_1fr] gap-0 px-8 py-7">
        <div className="pr-8">
          <Rotulo>{tituloQuedo(mes)}</Rotulo>
          <Monto valor={actual.quedo} saldo className="mt-2 block text-[46px] font-semibold leading-tight" />
          <div className="mt-1 text-[15px] text-suave">Casa, estudio y camiones juntos</div>
        </div>
        <div className="border-l border-borde px-6 pt-3">
          <Rotulo>Entró</Rotulo>
          <Monto valor={actual.entro} className="mt-2 block text-[24px] font-semibold" />
          <BarraAreas resumen={actual} campo="entro" />
        </div>
        <div className="border-l border-borde px-6 pt-3">
          <Rotulo>Salió</Rotulo>
          <Monto valor={actual.salio} className="mt-2 block text-[24px] font-semibold" />
          <BarraAreas resumen={actual} campo="salio" />
        </div>
        <div className="border-l border-borde pl-6 pt-2">
          <Rotulo>{nombreMesCorto(mesAnterior)}</Rotulo>
          {anterior.cantidad ? (
            <>
              <Monto valor={anterior.quedo} className="mt-2 block text-[24px] font-semibold text-suave" />
              <Comparacion mes={mes} actual={actual} anterior={anterior} className="mt-1" />
            </>
          ) : (
            <div className="mt-2 text-[15px] text-suave">Sin datos de {nombreMes(mesAnterior)}</div>
          )}
        </div>
      </Tarjeta>

      <div className="grid grid-cols-3 gap-6">
        {AREAS.map((area) => <TarjetaArea key={area} area={area} r={actual.areas[area]} />)}
      </div>

      <div className="grid grid-cols-[1.75fr_1fr] gap-6">
        <Tarjeta className="px-6 pb-3 pt-5">
          <div className="mb-1 flex items-center justify-between border-b border-borde pb-3">
            <h2 className="text-[17px] font-semibold">Últimos movimientos</h2>
            <Link to="/movimientos" className="text-[15px] text-suave hover:text-acento">Ver todos</Link>
          </div>
          <ListaMovimientos movimientos={movsMes} limite={6} />
        </Tarjeta>
        <Tarjeta className="px-6 pb-3 pt-5">
          <div className="mb-1 flex items-center justify-between border-b border-borde pb-3">
            <h2 className="text-[17px] font-semibold">Próximos vencimientos</h2>
            <Link to="/vencimientos" className="flex items-center text-[15px] text-suave hover:text-acento">
              Ver todos <ChevronRight size={16} />
            </Link>
          </div>
          <ListaVencimientos vencimientos={vencimientos.slice(0, 5)} />
        </Tarjeta>
      </div>
    </div>
  )
}

export default function Resumen() {
  const datos = useResumen()
  const gastosFijos = useStore((s) => s.gastosFijos)
  const vencimientos = useMemo(() => proximosVencimientos(gastosFijos, hoy()), [gastosFijos])
  return (
    <>
      <Encabezado titulo="Resumen de la familia" tituloCelular={tituloMes(datos.mes)} />
      <ResumenCelular {...datos} vencimientos={vencimientos} />
      <ResumenComputadora {...datos} vencimientos={vencimientos} />
    </>
  )
}
