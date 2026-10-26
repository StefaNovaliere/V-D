import { useMemo } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useStore } from '../store/useStore.js'
import Encabezado from '../components/Encabezado.jsx'
import { ListaMovimientos } from '../components/Listas.jsx'
import { Monto, Rotulo, Tarjeta, Vacio } from '../components/ui.jsx'
import { delMes, desglose, ingresoPorPatente, resumenDelMes } from '../lib/calculos.js'
import { AREA } from '../lib/areas.js'
import { diaMes, hoy, nombreMes } from '../lib/fechas.js'

function haceCuanto(iso) {
  if (!iso) return null
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  return `el ${diaMes(hoy(new Date(iso)))}`
}

function IngresoMisCargas({ mes, movimientos }) {
  const misCargas = useStore((s) => s.misCargas)
  const sincronizando = useStore((s) => s.sincronizando)
  const sincronizar = useStore((s) => s.sincronizarMisCargas)
  const porPatente = useMemo(() => ingresoPorPatente(movimientos, mes), [movimientos, mes])
  const total = porPatente.reduce((t, p) => t + Math.round(p.monto * 100), 0) / 100

  return (
    <Tarjeta className="px-5 py-5 md:px-6">
      <div className="flex items-center justify-between gap-3">
        <Rotulo>Ingreso limpio</Rotulo>
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-positivo">
          <span className="h-1.5 w-1.5 rounded-full bg-positivo" /> Desde Mis Cargas
        </span>
      </div>
      <Monto valor={total} saldo={total < 0} className="mt-2 block text-[32px] font-semibold" />
      {porPatente.length ? (
        <ul className="mt-2">
          {porPatente.map((p) => (
            <li key={p.patente} className="flex items-baseline justify-between gap-3 py-1.5 text-[16px]">
              <span className="text-suave">{p.patente}{p.nota ? ` · ${p.nota}` : ''}</span>
              <Monto valor={p.monto} className={p.monto < 0 ? 'text-negativo' : 'text-tinta'} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[15px] text-suave">Todavía no llegó nada de Mis Cargas para {nombreMes(mes)}.</p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-borde pt-3 text-[14px] text-suave">
        {misCargas?.conectado ? (
          <>
            <span>
              {misCargas.ultima_ok === false
                ? <span className="text-negativo">La última actualización falló: {misCargas.ultimo_detalle}</span>
                : misCargas.ultima_sync ? `Actualizado ${haceCuanto(misCargas.ultima_sync)}` : 'Sin actualizar todavía'}
            </span>
            <button
              type="button"
              onClick={() => sincronizar({ meses: 3 })}
              disabled={sincronizando}
              className="boton-fantasma -mr-2 px-2 py-1 text-[14px]"
            >
              <RefreshCw size={15} className={sincronizando ? 'animate-spin' : ''} />
              {sincronizando ? 'Actualizando…' : 'Actualizar'}
            </button>
          </>
        ) : (
          <span>
            Mis Cargas no está conectada.{' '}
            <Link to="/ajustes#mis-cargas" className="font-semibold text-acento">Conectala en Ajustes</Link>
          </span>
        )}
      </div>
    </Tarjeta>
  )
}

/** Gastos fijos del área: si ya se pagó en el mes, lo pagado; si no, lo que viene. */
function GastosFijos({ area, mes, movimientos }) {
  const gastosFijos = useStore((s) => s.gastosFijos)
  const fijos = gastosFijos.filter((g) => g.area === area && g.activo)
  const delMesActual = delMes(movimientos, mes)
  return (
    <Tarjeta className="px-5 pt-5 md:px-6">
      <div className="flex items-center justify-between border-b border-borde pb-3">
        <Rotulo>Gastos fijos</Rotulo>
        <Link to="/vencimientos" className="text-[14px] text-acento">Vencimientos</Link>
      </div>
      {fijos.length ? (
        <ul className="divide-y divide-borde">
          {fijos.map((g) => {
            const pagos = delMesActual.filter((m) => m.gasto_fijo_id === g.id)
            const pagado = pagos.reduce((t, m) => t + Number(m.monto), 0)
            const detalle = [
              g.patente ?? g.detalle,
              pagos.length ? `pagado el ${diaMes(pagos[0].fecha)}` : null,
              `vence el ${diaMes(g.proximo_vencimiento)}`,
            ].filter(Boolean).join(' · ')
            return (
              <li key={g.id} className="flex items-center justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <div className="text-[16px] font-medium">{g.concepto}</div>
                  <div className="text-[14px] text-suave">{detalle}</div>
                </div>
                <Monto valor={pagos.length ? pagado : g.monto} tipo="gasto" className={`text-[16px] ${pagos.length ? '' : 'text-suave'}`} />
              </li>
            )
          })}
        </ul>
      ) : (
        <Vacio>No hay gastos fijos en {AREA[area].nombre}.</Vacio>
      )}
    </Tarjeta>
  )
}

function Desglose({ r }) {
  const filas = desglose(r, 50)
  return (
    <Tarjeta className="px-5 py-5 md:px-6">
      <Rotulo>Por categoría</Rotulo>
      {filas.length ? (
        <ul className="mt-2">
          {filas.map((f) => (
            <li key={f.categoria_id ?? f.nombre} className="flex items-baseline justify-between gap-3 py-1.5 text-[16px]">
              <span className={f.tipo === 'ingreso' ? 'font-medium' : 'text-suave'}>
                {f.nombre} <span className="text-[13px] text-suave">({f.cantidad})</span>
              </span>
              <Monto valor={f.monto} tipo={f.tipo === 'gasto' ? 'gasto' : undefined} className="text-tinta" />
            </li>
          ))}
        </ul>
      ) : (
        <Vacio>Sin movimientos en el mes.</Vacio>
      )}
    </Tarjeta>
  )
}

export default function Area() {
  const { area } = useParams()
  const mes = useStore((s) => s.mes)
  const movimientos = useStore((s) => s.movimientos)
  const categorias = useStore((s) => s.categorias)
  const personas = useStore((s) => s.personas)
  const porCobrar = useStore((s) => s.porCobrar)
  const r = useMemo(() => resumenDelMes(movimientos, mes, categorias).areas[area], [movimientos, mes, categorias, area])
  if (!AREA[area]) return <Navigate to="/" replace />

  const movsArea = delMes(movimientos, mes).filter((m) => m.area === area)
  const esCamiones = area === 'camiones'
  const tienePersonas = personas.some((p) => p.area === area && p.activa)
  const deudas = porCobrar.filter((p) => p.area === area)
  const deben = deudas.reduce((t, p) => t + Number(p.monto), 0)

  const quedo = (
    <Tarjeta className="flex items-center justify-between gap-3 px-5 py-4 md:px-6">
      <span className="text-[16px] font-semibold">
        {esCamiones ? 'Le quedó a los camiones' : r.entro ? `Le quedó al ${AREA[area].nombre.toLowerCase()}` : `Gastos de la ${AREA[area].nombre.toLowerCase()}`}
      </span>
      <Monto valor={r.quedo} saldo className="text-[24px] font-semibold" />
    </Tarjeta>
  )

  return (
    <>
      <Encabezado titulo={AREA[area].nombre} area={area} nuevoHref={`/nuevo?area=${area}`} />
      <div className="grid grid-cols-1 gap-4 px-4 py-4 md:grid-cols-2 md:gap-6 md:px-10 md:py-0">
        <div className="space-y-4 md:space-y-6">
          {esCamiones ? <IngresoMisCargas mes={mes} movimientos={movimientos} /> : (
            <Tarjeta className="px-5 py-5 md:px-6">
              <Rotulo>{r.entro ? 'Saldo' : 'Gastos'} de {nombreMes(mes)}</Rotulo>
              <Monto valor={r.quedo} saldo className="mt-2 block text-[32px] font-semibold" />
              <div className="mt-2 flex justify-between text-[15px] text-suave">
                <span>Entró <Monto valor={r.entro} className="font-semibold text-tinta" /></span>
                <span>Salió <Monto valor={r.salio} className="font-semibold text-tinta" /></span>
              </div>
            </Tarjeta>
          )}
          <GastosFijos area={area} mes={mes} movimientos={movimientos} />
          {esCamiones ? quedo : <Desglose r={r} />}
          {deudas.length > 0 && (
            <Link to="/por-cobrar" className="tarjeta flex items-center justify-between gap-3 px-5 py-4 md:px-6">
              <span>
                <span className="block text-[16px]">{esCamiones ? 'Los dadores deben' : 'Les deben'}</span>
                <span className="text-[14px] text-suave">
                  {deudas.length} {deudas.length === 1 ? 'cobro pendiente' : 'cobros pendientes'}{esCamiones ? ' · desde Mis Cargas' : ''}
                </span>
              </span>
              <span className="flex items-center gap-2"><Monto valor={deben} className="text-[18px] font-semibold" /><span className="text-acento">›</span></span>
            </Link>
          )}
          {tienePersonas && (
            <Link to="/sueldos" className="tarjeta block px-5 py-4 text-[16px] md:px-6">
              Sueldos de {AREA[area].nombre.toLowerCase() === 'casa' ? 'la casa' : 'el estudio'}: historial y aguinaldo
              <span className="float-right text-acento">Ver</span>
            </Link>
          )}
        </div>
        <Tarjeta className="self-start px-5 pt-4 md:px-6">
          <div className="flex items-center justify-between">
            <Rotulo>Movimientos de {nombreMes(mes)}</Rotulo>
            <Link to={`/nuevo?area=${area}`} className="text-[14px] text-acento md:hidden">Cargar</Link>
          </div>
          <ListaMovimientos movimientos={movsArea} porDia vacio={`No hay movimientos de ${AREA[area].nombre} en ${nombreMes(mes)}.`} />
        </Tarjeta>
      </div>
    </>
  )
}
