import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useStore } from '../store/useStore.js'
import Encabezado from '../components/Encabezado.jsx'
import { CampoMonto, HojaPagar } from '../components/Pagos.jsx'
import { Campo, Chips, Hoja, Interruptor, Monto, PuntoArea, Rotulo, Segmentado, Tarjeta, Vacio } from '../components/ui.jsx'
import { aguinaldoSugerido } from '../lib/calculos.js'
import { AREA } from '../lib/areas.js'
import { fechaCorta, fechaLarga, hoy, semestreDe, sumarMesesAFecha } from '../lib/fechas.js'
import { leerMonto, montoAEntrada } from '../lib/formato.js'

const OPCIONES_AREA = [
  { valor: 'casa', nombre: 'Casa', area: 'casa' },
  { valor: 'estudio', nombre: 'Estudio', area: 'estudio' },
]

function FormPersona({ persona, onCerrar }) {
  const guardarPersona = useStore((s) => s.guardarPersona)
  const borrarPersona = useStore((s) => s.borrarPersona)
  const gastosFijos = useStore((s) => s.gastosFijos)
  const avisar = useStore((s) => s.avisar)
  const fijo = persona && gastosFijos.find((g) => g.persona_id === persona.id)
  const [area, setArea] = useState(persona?.area ?? 'casa')
  const [nombre, setNombre] = useState(persona?.nombre ?? '')
  const [rol, setRol] = useState(persona?.rol ?? 'Niñera')
  const [sueldo, setSueldo] = useState(persona ? montoAEntrada(persona.sueldo_mensual) : '')
  const [alta, setAlta] = useState(persona?.fecha_alta ?? '')
  const [proximoPago, setProximoPago] = useState(fijo?.proximo_vencimiento ?? sumarMesesAFecha(hoy().slice(0, 8) + '01', 1))
  const [activa, setActiva] = useState(persona?.activa ?? true)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

  async function guardar(e) {
    e.preventDefault()
    if (!nombre.trim()) return setError('Escribí el nombre.')
    if (!rol.trim()) return setError('Escribí qué hace (secretaria, niñera…).')
    setGuardando(true)
    try {
      await guardarPersona({
        area, nombre, rol, sueldo_mensual: leerMonto(sueldo) ?? 0,
        fecha_alta: alta || null, proximo_pago: proximoPago || null, activa,
      }, persona?.id)
      avisar('Guardado')
      onCerrar()
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  async function borrar() {
    setGuardando(true)
    try {
      await borrarPersona(persona.id)
      avisar('Persona borrada. Los pagos cargados quedan en los movimientos.')
      onCerrar()
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-4">
      <Segmentado opciones={OPCIONES_AREA} valor={area} onCambio={(a) => { setArea(a); if (!persona) setRol(a === 'casa' ? 'Niñera' : 'Secretaria') }} etiqueta="Área" />
      <Campo etiqueta="Nombre">
        <input className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Rosa" />
      </Campo>
      <Campo etiqueta="Qué hace">
        <input className="campo" value={rol} onChange={(e) => setRol(e.target.value)} />
      </Campo>
      <CampoMonto valor={sueldo} onCambio={setSueldo} etiqueta="Sueldo mensual" />
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Próximo pago">
          <input type="date" className="campo" value={proximoPago} onChange={(e) => setProximoPago(e.target.value)} />
        </Campo>
        <Campo etiqueta="Fecha de ingreso">
          <input type="date" className="campo" value={alta} onChange={(e) => setAlta(e.target.value)} />
        </Campo>
      </div>
      {persona && (
        <div className="flex items-center justify-between rounded-xl border border-borde px-3.5 py-3">
          <span className="text-[15px]">Sigue trabajando</span>
          <Interruptor activo={activa} onCambio={setActiva} etiqueta="Sigue trabajando" />
        </div>
      )}
      {error && <p role="alert" className="text-[15px] text-negativo">{error}</p>}
      <button type="submit" className="boton-primario w-full py-3.5" disabled={guardando}>Guardar</button>
      {persona && (confirmar ? (
        <div className="flex gap-3">
          <button type="button" className="boton-secundario flex-1" onClick={() => setConfirmar(false)}>No</button>
          <button type="button" className="boton-peligro flex-1" onClick={borrar} disabled={guardando}>Sí, borrar</button>
        </div>
      ) : (
        <button type="button" className="boton-peligro w-full" onClick={() => setConfirmar(true)}>Borrar a {persona.nombre}</button>
      ))}
    </form>
  )
}

function HojaAguinaldo({ persona, pagos, onCerrar }) {
  const categorias = useStore((s) => s.categorias)
  const guardarMovimiento = useStore((s) => s.guardarMovimiento)
  const avisar = useStore((s) => s.avisar)
  const [fecha, setFecha] = useState(hoy())
  const sugerido = aguinaldoSugerido(persona, pagos, categorias, fecha)
  const [monto, setMonto] = useState(montoAEntrada(sugerido))
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const semestre = semestreDe(fecha)
  const cat = categorias.find((c) => c.area === persona.area && c.tipo === 'gasto' && c.clave === 'aguinaldo')

  async function guardar(e) {
    e.preventDefault()
    const n = leerMonto(monto)
    if (!n) return setError('Escribí el monto.')
    if (!cat) return setError('Falta la categoría de aguinaldo en esta área.')
    setGuardando(true)
    try {
      await guardarMovimiento({
        tipo: 'gasto', area: persona.area, categoria_id: cat.id, monto: n, fecha,
        nota: `Aguinaldo ${semestre.desde.slice(5, 7) === '01' ? '1.er' : '2.º'} semestre`,
        persona_id: persona.id, concepto_deducible_id: cat.concepto_deducible_id,
      })
      avisar('Aguinaldo cargado')
      onCerrar()
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-4">
      <p className="text-[15px] text-suave">
        Sugerido: la mitad del sueldo más alto pagado entre el {fechaCorta(semestre.desde)} y el {fechaCorta(semestre.hasta)}
        {' '}(<Monto valor={sugerido} className="font-semibold text-tinta" />). Si entró a mitad de semestre o hubo licencias,
        confirmá el monto con el contador.
      </p>
      <Campo etiqueta="Fecha de pago">
        <input type="date" className="campo" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Campo>
      <CampoMonto valor={monto} onCambio={setMonto} etiqueta="Monto" />
      {error && <p role="alert" className="text-[15px] text-negativo">{error}</p>}
      <button type="submit" className="boton-primario w-full py-3.5" disabled={guardando}>Cargar aguinaldo</button>
    </form>
  )
}

function DetallePersona({ persona }) {
  const categorias = useStore((s) => s.categorias)
  const gastosFijos = useStore((s) => s.gastosFijos)
  const movimientos = useStore((s) => s.movimientos)
  const consultar = useStore((s) => s.consultarMovimientos)
  const [pagos, setPagos] = useState(null)
  const [hoja, setHoja] = useState(null) // 'editar' | 'aguinaldo'
  const [pagando, setPagando] = useState(null)
  const fijo = gastosFijos.find((g) => g.persona_id === persona.id && g.activo)

  const cargar = useCallback(() => {
    consultar({ eq: { persona_id: persona.id } }).then(setPagos).catch(() => setPagos([]))
  }, [consultar, persona.id])

  // Se recarga cuando cambian los movimientos (por ejemplo, al pagar).
  useEffect(() => { cargar() }, [cargar, movimientos])

  const nombreCat = (id) => categorias.find((c) => c.id === id)?.nombre ?? ''
  const anioActual = hoy().slice(0, 4)
  const totalAnio = (pagos ?? []).filter((p) => p.fecha.startsWith(anioActual)).reduce((t, p) => t + Number(p.monto), 0)

  return (
    <Tarjeta className="px-5 py-5 md:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <PuntoArea area={persona.area} />
            <h2 className="text-[19px] font-semibold">{persona.nombre}</h2>
            {!persona.activa && <span className="rounded-full bg-fondo px-2 text-[13px] text-suave">ya no trabaja</span>}
          </div>
          <div className="text-[15px] text-suave">{persona.rol} · {AREA[persona.area].nombre}</div>
        </div>
        <button type="button" className="text-[15px] text-acento" onClick={() => setHoja('editar')}>Editar</button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-y border-borde py-3">
        <div>
          <Rotulo>Sueldo</Rotulo>
          <Monto valor={persona.sueldo_mensual} className="mt-1 block text-[20px] font-semibold" />
        </div>
        <div>
          <Rotulo>Pagado en {anioActual}</Rotulo>
          <Monto valor={totalAnio} className="mt-1 block text-[20px] font-semibold" />
        </div>
      </div>
      {fijo && <p className="mt-3 text-[15px] text-suave">Próximo pago: {fechaLarga(fijo.proximo_vencimiento, true)}</p>}

      {persona.activa && (
        <div className="mt-4 flex gap-2">
          {fijo && <button type="button" className="boton-primario flex-1" onClick={() => setPagando(fijo)}>Pagar sueldo</button>}
          <button type="button" className="boton-secundario flex-1" onClick={() => setHoja('aguinaldo')}>Aguinaldo</button>
        </div>
      )}

      <Rotulo className="mt-6">Historial</Rotulo>
      {pagos === null ? <Vacio>Cargando…</Vacio> : pagos.length ? (
        <ul className="mt-1 divide-y divide-borde">
          {pagos.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-[15px]">
              <span><span className="num">{fechaCorta(p.fecha)}</span> · {nombreCat(p.categoria_id)}</span>
              <Monto valor={p.monto} />
            </li>
          ))}
        </ul>
      ) : <Vacio>Todavía no hay pagos cargados.</Vacio>}

      <Hoja abierta={hoja === 'editar'} onCerrar={() => setHoja(null)} titulo={`Editar a ${persona.nombre}`}>
        {hoja === 'editar' && <FormPersona persona={persona} onCerrar={() => setHoja(null)} />}
      </Hoja>
      <Hoja abierta={hoja === 'aguinaldo'} onCerrar={() => setHoja(null)} titulo={`Aguinaldo de ${persona.nombre}`}>
        {hoja === 'aguinaldo' && <HojaAguinaldo persona={persona} pagos={pagos ?? []} onCerrar={() => setHoja(null)} />}
      </Hoja>
      <HojaPagar key={pagando?.id ?? 'nada'} fijo={pagando} onCerrar={() => setPagando(null)} />
    </Tarjeta>
  )
}

export default function Sueldos() {
  const personas = useStore((s) => s.personas)
  const [nueva, setNueva] = useState(false)
  const [filtro, setFiltro] = useState('activas')
  const visibles = personas.filter((p) => filtro === 'todas' || p.activa)
  return (
    <>
      <Encabezado
        titulo="Sueldos"
        conMes={false}
        acciones={<button type="button" className="boton-secundario" onClick={() => setNueva(true)}><Plus size={18} /> Agregar persona</button>}
      />
      <div className="space-y-4 px-4 py-4 md:px-10 md:py-0">
        <div className="flex items-center justify-between gap-3">
          <Chips
            opciones={[{ valor: 'activas', nombre: 'Trabajando' }, { valor: 'todas', nombre: 'Todas' }]}
            valor={filtro}
            onCambio={setFiltro}
          />
          <button type="button" className="boton-fantasma px-2 md:hidden" onClick={() => setNueva(true)}><Plus size={16} /> Agregar</button>
        </div>
        {visibles.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
            {visibles.map((p) => <DetallePersona key={p.id} persona={p} />)}
          </div>
        ) : (
          <Tarjeta className="px-5"><Vacio>Agregá a la secretaria y a la niñera para llevar sus sueldos.</Vacio></Tarjeta>
        )}
      </div>
      <Hoja abierta={nueva} onCerrar={() => setNueva(false)} titulo="Agregar persona">
        {nueva && <FormPersona onCerrar={() => setNueva(false)} />}
      </Hoja>
    </>
  )
}
