import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useStore } from '../store/useStore.js'
import Encabezado from '../components/Encabezado.jsx'
import { ListaVencimientos } from '../components/Listas.jsx'
import { HojaGastoFijo, HojaPagar } from '../components/Pagos.jsx'
import { ATAJOS_IMPOSITIVOS } from '../lib/areas.js'
import { Hoja, Monto, Rotulo, Segmentado, Tarjeta, Vacio } from '../components/ui.jsx'
import { proximosVencimientos } from '../lib/calculos.js'
import { hoy, mesDe, tituloMes } from '../lib/fechas.js'

const FILTROS = [
  { valor: 'todos', nombre: 'Todos' },
  { valor: 'impositivos', nombre: 'Impositivos' },
]

/**
 * Vencimientos agrupados por mes. Con el filtro "Impositivos" es el
 * calendario de vencimientos impositivos (regalo 4): monotributo, IIBB,
 * aportes, seguro… con las fechas que carga la familia, nada fijo.
 */
export default function Vencimientos() {
  const gastosFijos = useStore((s) => s.gastosFijos)
  const [filtro, setFiltro] = useState('todos')
  const [elegido, setElegido] = useState(null)
  const [pagando, setPagando] = useState(null)
  const [editando, setEditando] = useState(null) // {fijo?, inicial?}
  const [verInactivos, setVerInactivos] = useState(false)

  const lista = useMemo(() => {
    const todos = proximosVencimientos(gastosFijos, hoy())
    return filtro === 'impositivos' ? todos.filter((g) => g.es_impositivo) : todos
  }, [gastosFijos, filtro])

  const porMes = useMemo(() => {
    const grupos = new Map()
    for (const v of lista) {
      const mes = mesDe(v.proximo_vencimiento)
      grupos.set(mes, [...(grupos.get(mes) ?? []), v])
    }
    return [...grupos.entries()]
  }, [lista])

  const inactivos = gastosFijos.filter((g) => !g.activo)
  const totalProximos30 = lista.filter((v) => v.dias <= 30).reduce((t, v) => t + Number(v.monto), 0)

  return (
    <>
      <Encabezado
        titulo="Vencimientos"
        conMes={false}
        acciones={<button type="button" className="boton-secundario" onClick={() => setEditando({})}><Plus size={18} /> Nuevo vencimiento</button>}
      />
      <div className="space-y-4 px-4 py-4 md:max-w-3xl md:px-10 md:py-0">
        <Segmentado opciones={FILTROS} valor={filtro} onCambio={setFiltro} etiqueta="Qué vencimientos ver" />

        <div className="flex items-center justify-between gap-3 text-[15px] text-suave">
          <span>Próximos 30 días: <Monto valor={totalProximos30} className="font-semibold text-tinta" /></span>
          <button type="button" className="boton-fantasma px-2 py-1 md:hidden" onClick={() => setEditando({})}>
            <Plus size={16} /> Nuevo
          </button>
        </div>

        {filtro === 'impositivos' && (
          <Tarjeta className="px-5 py-4">
            <Rotulo>Agregar al calendario</Rotulo>
            <p className="mt-1 text-[14px] text-suave">Las fechas cambian todos los años: cargalas según lo que les diga el contador o ARCA.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ATAJOS_IMPOSITIVOS.map((a) => (
                <button key={a.concepto} type="button" className="chip border-borde bg-white" onClick={() => setEditando({ inicial: { ...a, es_impositivo: true } })}>
                  <Plus size={14} /> {a.concepto}
                </button>
              ))}
            </div>
          </Tarjeta>
        )}

        {porMes.length ? porMes.map(([mes, items]) => (
          <Tarjeta key={mes} className="px-5 pt-4 md:px-6">
            <Rotulo>{tituloMes(mes)}</Rotulo>
            <ListaVencimientos vencimientos={items} onElegir={setElegido} mostrarDias={10} />
          </Tarjeta>
        )) : (
          <Tarjeta className="px-5"><Vacio>{filtro === 'impositivos' ? 'Todavía no cargaron vencimientos impositivos.' : 'No hay vencimientos cargados.'}</Vacio></Tarjeta>
        )}

        {inactivos.length > 0 && (
          <div>
            <button type="button" className="text-[14px] text-suave underline" onClick={() => setVerInactivos(!verInactivos)}>
              {verInactivos ? 'Ocultar' : 'Ver'} los {inactivos.length} pausados
            </button>
            {verInactivos && (
              <Tarjeta className="mt-2 px-5">
                <ul className="divide-y divide-borde">
                  {inactivos.map((g) => (
                    <li key={g.id}>
                      <button type="button" className="flex w-full justify-between py-3 text-left" onClick={() => setEditando({ fijo: g })}>
                        <span>{g.concepto}</span><Monto valor={g.monto} className="text-suave" />
                      </button>
                    </li>
                  ))}
                </ul>
              </Tarjeta>
            )}
          </div>
        )}
      </div>

      <Hoja abierta={Boolean(elegido)} onCerrar={() => setElegido(null)} titulo={elegido?.concepto ?? ''}>
        {elegido && (
          <div className="space-y-3">
            <button type="button" className="boton-primario w-full py-3.5" onClick={() => { setPagando(elegido); setElegido(null) }}>
              Pagar ahora
            </button>
            <button type="button" className="boton-secundario w-full py-3.5" onClick={() => { setEditando({ fijo: elegido }); setElegido(null) }}>
              Editar
            </button>
          </div>
        )}
      </Hoja>
      <HojaPagar key={pagando?.id ?? 'nada'} fijo={pagando} onCerrar={() => setPagando(null)} />
      <HojaGastoFijo abierta={Boolean(editando)} fijo={editando?.fijo} inicial={editando?.inicial} onCerrar={() => setEditando(null)} />
    </>
  )
}
