import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useStore } from '../store/useStore.js'
import Encabezado from '../components/Encabezado.jsx'
import { CampoMonto } from '../components/Pagos.jsx'
import { Campo, Hoja, Monto, PuntoArea, Rotulo, Segmentado, Tarjeta, Vacio } from '../components/ui.jsx'
import { AREA } from '../lib/areas.js'
import { fechaCorta, hoy } from '../lib/fechas.js'
import { leerMonto, montoAEntrada } from '../lib/formato.js'
import { aCentavos, aPesos } from '../lib/calculos.js'

const OPCIONES_AREA = ['estudio', 'casa', 'camiones'].map((a) => ({ valor: a, nombre: AREA[a].nombre, area: a }))

function FormDeuda({ item, onCerrar }) {
  const guardar = useStore((s) => s.guardarPorCobrar)
  const borrar = useStore((s) => s.borrarPorCobrar)
  const avisar = useStore((s) => s.avisar)
  const [area, setArea] = useState(item?.area ?? 'estudio')
  const [quien, setQuien] = useState(item?.quien ?? '')
  const [detalle, setDetalle] = useState(item?.detalle ?? '')
  const [monto, setMonto] = useState(item ? montoAEntrada(item.monto) : '')
  const [fecha, setFecha] = useState(item?.fecha_estimada ?? '')
  const [error, setError] = useState(null)
  const [confirmar, setConfirmar] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    const n = leerMonto(monto)
    if (!quien.trim()) return setError('¿Quién lo debe? Por ejemplo, el cliente o la causa.')
    if (!n) return setError('Escribí el monto.')
    try {
      await guardar({ area, quien, detalle, monto: n, fecha_estimada: fecha }, item?.id)
      avisar('Guardado')
      onCerrar()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Segmentado opciones={OPCIONES_AREA} valor={area} onCambio={setArea} etiqueta="Área" />
      <Campo etiqueta={area === 'estudio' ? 'Cliente o causa' : 'Quién lo debe'}>
        <input className="campo" value={quien} onChange={(e) => setQuien(e.target.value)} placeholder="Sucesión Ramírez" />
      </Campo>
      <Campo etiqueta="Detalle">
        <input className="campo" value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Segunda cuota" />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <CampoMonto valor={monto} onCambio={setMonto} />
        <Campo etiqueta="Para cuándo">
          <input type="date" className="campo" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
      </div>
      <p className="text-[13px] text-suave">Con fecha, entra en la proyección del mes. Sin fecha, queda en la lista igual.</p>
      {error && <p role="alert" className="text-[15px] text-negativo">{error}</p>}
      <button type="submit" className="boton-primario w-full py-3.5">Guardar</button>
      {item && (confirmar ? (
        <div className="flex gap-3">
          <button type="button" className="boton-secundario flex-1" onClick={() => setConfirmar(false)}>No</button>
          <button
            type="button"
            className="boton-peligro flex-1"
            onClick={() => borrar(item.id).then(onCerrar).catch((err) => setError(err.message))}
          >
            Sí, borrar
          </button>
        </div>
      ) : (
        <button type="button" className="boton-peligro w-full" onClick={() => setConfirmar(true)}>Borrar (no lo van a cobrar)</button>
      ))}
    </form>
  )
}

function FormCobrar({ item, onCerrar }) {
  const categorias = useStore((s) => s.categorias)
  const cobrar = useStore((s) => s.cobrar)
  const avisar = useStore((s) => s.avisar)
  const opciones = categorias.filter((c) => c.area === item.area && c.tipo === 'ingreso' && c.activa && c.clave !== 'mis_cargas')
  const [categoriaId, setCategoriaId] = useState(opciones.find((c) => c.clave === 'honorarios')?.id ?? opciones[0]?.id ?? '')
  const [monto, setMonto] = useState(montoAEntrada(item.monto))
  const [fecha, setFecha] = useState(hoy())
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    const n = leerMonto(monto)
    if (!n) return setError('Escribí cuánto cobraron.')
    if (!categoriaId) return setError('Elegí la categoría del ingreso.')
    setGuardando(true)
    try {
      await cobrar(item, { fecha, monto: n, categoria_id: categoriaId })
      avisar('Cobro cargado como ingreso')
      onCerrar()
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <p className="text-[15px] text-suave">Se carga como ingreso de {AREA[item.area].nombre} y sale de la lista.</p>
      <div className="grid grid-cols-2 gap-3">
        <CampoMonto valor={monto} onCambio={setMonto} etiqueta="Cobraron" />
        <Campo etiqueta="Fecha">
          <input type="date" className="campo" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
      </div>
      <Campo etiqueta="Categoría">
        <select className="campo" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
          {opciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </Campo>
      {error && <p role="alert" className="text-[15px] text-negativo">{error}</p>}
      <button type="submit" className="boton-primario w-full py-3.5" disabled={guardando}>Ya lo cobramos</button>
    </form>
  )
}

function Fila({ item, onElegir, conArea = false }) {
  const contenido = (
    <>
      {conArea && <PuntoArea area={item.area} />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px]">{item.quien}</div>
        <div className="truncate text-[14px] text-suave">
          {[item.fecha_estimada ? `Para el ${fechaCorta(item.fecha_estimada)}` : null, item.detalle].filter(Boolean).join(' · ') || 'Sin fecha'}
        </div>
      </div>
      <Monto valor={item.monto} className="text-[16px]" />
    </>
  )
  return (
    <li>
      {onElegir ? (
        <button type="button" onClick={() => onElegir(item)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-fondo/60 md:-mx-2 md:rounded-lg md:px-2">
          {contenido}
        </button>
      ) : (
        <div className="flex items-center gap-3 py-3">{contenido}</div>
      )}
    </li>
  )
}

const total = (lista) => aPesos(lista.reduce((t, p) => t + aCentavos(p.monto), 0))

/** Plata ya trabajada que todavía no entró. No suma al resumen hasta cobrarla. */
export default function PorCobrar() {
  const porCobrar = useStore((s) => s.porCobrar)
  const misCargas = useStore((s) => s.misCargas)
  const [elegido, setElegido] = useState(null)
  const [hoja, setHoja] = useState(null) // 'nuevo' | 'editar' | 'cobrar'

  const manuales = porCobrar.filter((p) => p.origen === 'manual')
    .sort((a, b) => (a.fecha_estimada ?? '9999') < (b.fecha_estimada ?? '9999') ? -1 : 1)
  const dadores = porCobrar.filter((p) => p.origen === 'mis_cargas').sort((a, b) => b.monto - a.monto)

  const cerrar = () => { setHoja(null); setElegido(null) }

  return (
    <>
      <Encabezado
        titulo="Plata por cobrar"
        tituloCelular="Por cobrar"
        conMes={false}
        acciones={<button type="button" className="boton-secundario" onClick={() => setHoja('nuevo')}><Plus size={18} /> Agregar</button>}
      />
      <div className="space-y-4 px-4 py-4 md:max-w-3xl md:px-10 md:py-0">
        <Tarjeta className="px-5 py-5 md:px-6">
          <Rotulo>Les deben</Rotulo>
          <Monto valor={total(porCobrar)} className="mt-2 block text-[32px] font-semibold" />
          <p className="mt-1 text-[14px] text-suave">Es plata trabajada que todavía no entró: no suma en el resumen hasta que la cobren.</p>
        </Tarjeta>

        <Tarjeta className="px-5 pt-4 md:px-6">
          <div className="flex items-center justify-between">
            <Rotulo>Honorarios y otros cobros</Rotulo>
            <button type="button" className="boton-fantasma px-2 py-1 text-[14px]" onClick={() => setHoja('nuevo')}><Plus size={15} /> Agregar</button>
          </div>
          {manuales.length ? (
            <ul className="divide-y divide-borde">
              {manuales.map((p) => (
                <Fila key={p.id} item={p} conArea onElegir={(x) => { setElegido(x); setHoja('acciones') }} />
              ))}
            </ul>
          ) : <Vacio>Anotá acá los honorarios que todavía no les pagaron.</Vacio>}
        </Tarjeta>

        <Tarjeta className="px-5 pt-4 md:px-6">
          <div className="flex items-center justify-between">
            <Rotulo>Dadores de carga · desde Mis Cargas</Rotulo>
            <Monto valor={total(dadores)} className="text-[15px] font-semibold" />
          </div>
          {dadores.length ? (
            <ul className="divide-y divide-borde">{dadores.map((p) => <Fila key={p.id} item={p} />)}</ul>
          ) : (
            <Vacio>{misCargas?.conectado ? 'Los dadores no deben nada.' : 'Conectá Mis Cargas en Ajustes para ver lo que deben los dadores.'}</Vacio>
          )}
          <p className="pb-4 text-[13px] text-suave">
            Son los viajes sin liquidar. Cuando los liquidan en Mis Cargas, desaparecen de acá. Esa plata ya está contada en el
            ingreso limpio de los camiones, por eso no se "cobra" desde esta app.
          </p>
        </Tarjeta>
      </div>

      <Hoja abierta={hoja === 'nuevo'} onCerrar={cerrar} titulo="Agregar plata por cobrar">
        {hoja === 'nuevo' && <FormDeuda onCerrar={cerrar} />}
      </Hoja>
      <Hoja abierta={hoja === 'acciones'} onCerrar={cerrar} titulo={elegido?.quien ?? ''}>
        {hoja === 'acciones' && elegido && (
          <div className="space-y-3">
            <button type="button" className="boton-primario w-full py-3.5" onClick={() => setHoja('cobrar')}>Ya lo cobramos</button>
            <button type="button" className="boton-secundario w-full py-3.5" onClick={() => setHoja('editar')}>Editar</button>
          </div>
        )}
      </Hoja>
      <Hoja abierta={hoja === 'cobrar'} onCerrar={cerrar} titulo={`Cobro de ${elegido?.quien ?? ''}`}>
        {hoja === 'cobrar' && elegido && <FormCobrar item={elegido} onCerrar={cerrar} />}
      </Hoja>
      <Hoja abierta={hoja === 'editar'} onCerrar={cerrar} titulo="Editar">
        {hoja === 'editar' && elegido && <FormDeuda item={elegido} onCerrar={cerrar} />}
      </Hoja>
    </>
  )
}
