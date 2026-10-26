import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Info } from 'lucide-react'
import { useStore } from '../store/useStore.js'
import Encabezado from '../components/Encabezado.jsx'
import { Chips, Monto, Rotulo, Tarjeta, Vacio } from '../components/ui.jsx'
import { deduciblesDelAnio } from '../lib/calculos.js'
import { fechaCorta, hoy } from '../lib/fechas.js'
import { tituloMovimiento } from '../lib/textos.js'

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/**
 * Regalo 2: gastos marcados como deducibles de Ganancias, sumados por
 * concepto en el año, para tener a mano al cargar el SiRADIG. La app no
 * decide qué se deduce: los conceptos se configuran en Ajustes.
 */
export default function Deducibles() {
  const conceptos = useStore((s) => s.conceptos)
  const categorias = useStore((s) => s.categorias)
  const consultar = useStore((s) => s.consultarMovimientos)
  const anioActual = Number(hoy().slice(0, 4))
  const [anio, setAnio] = useState(anioActual)
  const [movs, setMovs] = useState(null)
  const [abierto, setAbierto] = useState(null)

  useEffect(() => {
    let vigente = true
    consultar({ eq: { tipo: 'gasto' }, no: { concepto_deducible_id: null }, gte: { fecha: `${anio}-01-01` }, lte: { fecha: `${anio}-12-31` } })
      .then((filas) => vigente && setMovs(filas))
      .catch(() => vigente && setMovs([]))
    return () => { vigente = false }
  }, [anio, consultar])

  const datos = useMemo(() => deduciblesDelAnio(movs ?? [], conceptos, anio), [movs, conceptos, anio])

  return (
    <>
      <Encabezado titulo="Gastos deducibles de Ganancias" tituloCelular="Deducibles" conMes={false} />
      <div className="space-y-4 px-4 py-4 md:max-w-4xl md:px-10 md:py-0">
        <div className="flex gap-3 rounded-2xl border border-acento/20 bg-acento-claro px-4 py-3.5 text-[15px]">
          <Info size={20} className="mt-0.5 shrink-0 text-acento" />
          <p>
            Es una ayuda para juntar los números, no un consejo impositivo. <strong>Qué se puede deducir y cuánto lo confirma
            el contador</strong>: los topes y las reglas cambian. Los conceptos se editan en{' '}
            <Link to="/ajustes#deducibles" className="font-semibold text-acento">Ajustes</Link>, y cada gasto se marca al cargarlo.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Chips
            opciones={[anioActual - 2, anioActual - 1, anioActual].map((a) => ({ valor: a, nombre: String(a) }))}
            valor={anio}
            onCambio={setAnio}
          />
          <div className="text-right">
            <Rotulo>Total {anio}</Rotulo>
            <Monto valor={datos.total} className="text-[22px] font-semibold" />
          </div>
        </div>

        <Tarjeta className="px-5 md:px-6">
          {movs === null ? <Vacio>Cargando…</Vacio> : datos.filas.length ? (
            <ul className="divide-y divide-borde">
              {datos.filas.map((f) => {
                const estaAbierto = abierto === f.concepto.id
                return (
                  <li key={f.concepto.id} className="py-1">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 py-3 text-left"
                      onClick={() => setAbierto(estaAbierto ? null : f.concepto.id)}
                      aria-expanded={estaAbierto}
                    >
                      <span className="min-w-0">
                        <span className="block text-[16px] font-medium">{f.concepto.nombre}</span>
                        <span className="text-[14px] text-suave">{f.movimientos.length} pagos</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <Monto valor={f.total} className="text-[17px] font-semibold" />
                        <ChevronDown size={18} className={`text-suave transition-transform ${estaAbierto ? 'rotate-180' : ''}`} />
                      </span>
                    </button>
                    {estaAbierto && (
                      <div className="pb-4">
                        <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 rounded-xl bg-fondo px-4 py-3 text-[14px] sm:grid-cols-4 md:grid-cols-6">
                          {f.porMes.map((m, i) => (
                            <div key={MESES_CORTOS[i]} className="flex justify-between gap-2">
                              <span className="text-suave">{MESES_CORTOS[i]}</span>
                              <Monto valor={m} className={m ? '' : 'text-suave/60'} />
                            </div>
                          ))}
                        </div>
                        <ul className="mt-2">
                          {f.movimientos.map((m) => (
                            <li key={m.id}>
                              <Link to={`/movimiento/${m.id}`} className="flex justify-between gap-3 py-1.5 text-[14px]">
                                <span className="truncate text-suave"><span className="num">{fechaCorta(m.fecha)}</span> · {tituloMovimiento(m, categorias)}</span>
                                <Monto valor={m.monto} />
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <Vacio>No hay gastos marcados como deducibles en {anio}. Al cargar un gasto, elegí el concepto en "Deducible de Ganancias".</Vacio>
          )}
        </Tarjeta>
      </div>
    </>
  )
}
