import { useState } from 'react'
import { Info } from 'lucide-react'
import { useStore } from '../store/useStore.js'
import Encabezado from '../components/Encabezado.jsx'
import { CampoMonto } from '../components/Pagos.jsx'
import { Campo, Interruptor, Monto, Rotulo, Tarjeta } from '../components/ui.jsx'
import { AREA } from '../lib/areas.js'
import { fechaCorta, nombreMesCorto } from '../lib/fechas.js'
import { leerMonto, montoAEntrada, porcentaje } from '../lib/formato.js'

const ESTADO = {
  bien: { texto: 'Lejos del tope', clase: 'bg-green-50 text-positivo', barra: 'bg-positivo' },
  cerca: { texto: 'Cerca del tope', clase: 'bg-camiones-claro text-camiones', barra: 'bg-camiones' },
  superado: { texto: 'Pasó el tope', clase: 'bg-red-50 text-negativo', barra: 'bg-negativo' },
}

function Configuracion({ onCerrar }) {
  const configuracion = useStore((s) => s.configuracion)
  const categorias = useStore((s) => s.categorias)
  const guardarConfiguracion = useStore((s) => s.guardarConfiguracion)
  const guardarCategoria = useStore((s) => s.guardarCategoria)
  const avisar = useStore((s) => s.avisar)
  const [activo, setActivo] = useState(configuracion?.monotributo_activo ?? false)
  const [categoria, setCategoria] = useState(configuracion?.monotributo_categoria ?? '')
  const [tope, setTope] = useState(configuracion?.monotributo_tope ? montoAEntrada(configuracion.monotributo_tope) : '')
  const [aviso, setAviso] = useState(configuracion?.monotributo_aviso_pct ?? 80)
  const [error, setError] = useState(null)

  async function guardar(e) {
    e.preventDefault()
    const n = leerMonto(tope)
    if (activo && !n) return setError('Cargá el tope anual de la categoría.')
    const pct = Number(aviso)
    if (!(pct >= 1 && pct <= 100)) return setError('El aviso tiene que ser un porcentaje entre 1 y 100.')
    try {
      await guardarConfiguracion({
        monotributo_activo: activo,
        monotributo_categoria: categoria.trim() || null,
        monotributo_tope: n || null,
        monotributo_aviso_pct: pct,
      })
      avisar('Configuración guardada')
      onCerrar?.()
    } catch (err) {
      setError(err.message)
    }
  }

  const ingresos = categorias.filter((c) => c.tipo === 'ingreso' && c.activa && c.clave !== 'mis_cargas')

  return (
    <form onSubmit={guardar} className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-borde px-3.5 py-3">
        <span className="text-[15px]">Es monotributista y quiere el control</span>
        <Interruptor activo={activo} onCambio={setActivo} etiqueta="Activar control del monotributo" />
      </div>
      {activo && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Categoría">
              <input className="campo uppercase" value={categoria} onChange={(e) => setCategoria(e.target.value.toUpperCase())} placeholder="H" maxLength={3} />
            </Campo>
            <Campo etiqueta="Avisar al llegar al">
              <div className="relative">
                <input className="campo num pr-9" inputMode="numeric" value={aviso} onChange={(e) => setAviso(e.target.value.replace(/\D/g, ''))} />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-suave">%</span>
              </div>
            </Campo>
          </div>
          <CampoMonto valor={tope} onCambio={setTope} etiqueta="Tope anual de facturación de la categoría" />
          <p className="text-[13px] text-suave">El tope lo publica ARCA y cambia varias veces por año: actualizalo acá cuando cambie.</p>
          <div>
            <Rotulo className="mb-2">Qué ingresos cuentan como facturación</Rotulo>
            <ul className="divide-y divide-borde rounded-xl border border-borde px-3.5">
              {ingresos.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-[15px]">
                  <span>{c.nombre} <span className="text-suave">· {AREA[c.area].nombre}</span></span>
                  <Interruptor
                    activo={c.cuenta_monotributo}
                    onCambio={(v) => guardarCategoria(c.id, { cuenta_monotributo: v }).catch((err) => setError(err.message))}
                    etiqueta={`${c.nombre} cuenta para el monotributo`}
                  />
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      {error && <p role="alert" className="text-[15px] text-negativo">{error}</p>}
      <button type="submit" className="boton-primario w-full py-3.5">Guardar</button>
    </form>
  )
}

/** Regalo 3: lo facturado en 12 meses contra el tope de la categoría. */
export default function Monotributo() {
  const configuracion = useStore((s) => s.configuracion)
  const mono = useStore((s) => s.monotributo)
  const [editando, setEditando] = useState(false)
  const activo = configuracion?.monotributo_activo

  return (
    <>
      <Encabezado titulo="Control del monotributo" tituloCelular="Monotributo" conMes={false} />
      <div className="space-y-4 px-4 py-4 md:max-w-3xl md:px-10 md:py-0">
        {activo && mono && !editando ? (
          <>
            <Tarjeta className="px-5 py-5 md:px-7 md:py-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Rotulo>Facturado en los últimos 12 meses</Rotulo>
                  <div className="mt-1 text-[14px] text-suave">Del {fechaCorta(mono.desde)} al {fechaCorta(mono.hasta)}</div>
                </div>
                {ESTADO[mono.estado] && (
                  <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${ESTADO[mono.estado].clase}`}>{ESTADO[mono.estado].texto}</span>
                )}
              </div>
              <Monto valor={mono.facturado} className="mt-3 block text-[36px] font-semibold" />
              {mono.tope ? (
                <>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-fondo">
                    <div className={`h-full ${ESTADO[mono.estado].barra}`} style={{ width: `${Math.min(100, mono.pct)}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between text-[15px] text-suave">
                    <span>{porcentaje(mono.pct)} del tope{configuracion.monotributo_categoria ? ` de la categoría ${configuracion.monotributo_categoria}` : ''}</span>
                    <Monto valor={mono.tope} />
                  </div>
                  <p className="mt-3 border-t border-borde pt-3 text-[15px]">
                    {mono.margen >= 0
                      ? <>Les queda margen por <Monto valor={mono.margen} className="font-semibold" /> antes del tope.</>
                      : <>Se pasaron por <Monto valor={-mono.margen} className="font-semibold text-negativo" />. Consultá con el contador por la recategorización.</>}
                  </p>
                </>
              ) : null}
            </Tarjeta>

            <Tarjeta className="px-5 py-4 md:px-7">
              <Rotulo>Mes por mes</Rotulo>
              <ul className="mt-2 divide-y divide-borde">
                {[...mono.meses].reverse().map((m) => (
                  <li key={m.mes} className="flex justify-between py-2 text-[15px]">
                    <span>{nombreMesCorto(m.mes)} {m.mes.slice(0, 4)}</span>
                    <Monto valor={m.monto} className={m.monto ? '' : 'text-suave/60'} />
                  </li>
                ))}
              </ul>
            </Tarjeta>

            <div className="flex gap-3 rounded-2xl bg-white px-4 py-3.5 text-[14px] text-suave">
              <Info size={18} className="mt-0.5 shrink-0" />
              <p>Suma los ingresos cargados en las categorías marcadas como facturación (de entrada, Honorarios). Es un control para anticiparse; la recategorización la confirma el contador.</p>
            </div>
            <button type="button" className="boton-secundario w-full md:w-auto" onClick={() => setEditando(true)}>Cambiar categoría o tope</button>
          </>
        ) : (
          <Tarjeta className="px-5 py-5 md:px-7">
            {!activo && (
              <p className="mb-4 text-[15px] text-suave">
                Si ella factura como monotributista, la app suma lo facturado en los últimos 12 meses y avisa cuando se acerca
                al tope de su categoría. Cargá la categoría y el tope.
              </p>
            )}
            <Configuracion onCerrar={() => setEditando(false)} />
          </Tarjeta>
        )}
      </div>
    </>
  )
}
