import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore, nombreMiembro } from '../store/useStore.js'
import { AREA } from '../lib/areas.js'
import { fechaCorta, hoy } from '../lib/fechas.js'
import { formatearEntrada, leerMonto, montoAEntrada } from '../lib/formato.js'
import { Chips, Interruptor, Monto, Rotulo, Segmentado, Tarjeta } from '../components/ui.jsx'

const OPCIONES_AREA = ['casa', 'estudio', 'camiones'].map((a) => ({ valor: a, nombre: AREA[a].nombre, area: a }))
const OPCIONES_TIPO = [
  { valor: 'gasto', nombre: 'Gasto' },
  { valor: 'ingreso', nombre: 'Ingreso' },
]

/** Cargar o editar un gasto o un ingreso, en una sola pantalla. */
export default function NuevoMovimiento() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navegar = useNavigate()
  const ubicacion = useLocation()
  const movimientos = useStore((s) => s.movimientos)
  const consultar = useStore((s) => s.consultarMovimientos)
  const enMemoria = id ? movimientos.find((m) => m.id === id) : null
  // Si es de otro mes no está en memoria: se busca en la base.
  const [buscado, setBuscado] = useState({ id: null, mov: undefined })

  useEffect(() => {
    if (!id || enMemoria) return
    let vigente = true
    consultar({ eq: { id } })
      .then((filas) => vigente && setBuscado({ id, mov: filas[0] ?? null }))
      .catch(() => vigente && setBuscado({ id, mov: null }))
    return () => { vigente = false }
  }, [id, enMemoria, consultar])

  const existente = !id ? null : enMemoria ?? (buscado.id === id ? buscado.mov : undefined)

  if (id && existente === undefined) return <div className="p-8 text-suave">Cargando…</div>
  if (id && !existente) {
    return (
      <div className="p-8">
        <p>No encontramos ese movimiento. Puede que lo hayan borrado.</p>
        <Link to="/movimientos" className="boton-secundario mt-4">Volver a movimientos</Link>
      </div>
    )
  }
  return (
    <Formulario
      key={existente?.id ?? 'nuevo'}
      existente={existente}
      tipoInicial={params.get('tipo') === 'ingreso' ? 'ingreso' : 'gasto'}
      areaInicial={AREA[params.get('area')] ? params.get('area') : 'casa'}
      // Si se entró directo (sin historial dentro de la app), volver atrás
      // sacaría a la persona de la app: va al resumen.
      alTerminar={() => (ubicacion.key === 'default' ? navegar('/') : navegar(-1))}
    />
  )
}

function Formulario({ existente, tipoInicial, areaInicial, alTerminar }) {
  const categorias = useStore((s) => s.categorias)
  const conceptos = useStore((s) => s.conceptos)
  const personas = useStore((s) => s.personas)
  const miembros = useStore((s) => s.miembros)
  const movimientos = useStore((s) => s.movimientos)
  const guardarMovimiento = useStore((s) => s.guardarMovimiento)
  const borrarMovimiento = useStore((s) => s.borrarMovimiento)
  const avisar = useStore((s) => s.avisar)

  const [tipo, setTipo] = useState(existente?.tipo ?? tipoInicial)
  const [area, setArea] = useState(existente?.area ?? areaInicial)
  const [montoTexto, setMontoTexto] = useState(existente ? montoAEntrada(existente.monto) : '')
  const [categoriaId, setCategoriaId] = useState(existente?.categoria_id ?? null)
  const [personaId, setPersonaId] = useState(existente?.persona_id ?? null)
  const [patente, setPatente] = useState(existente?.patente ?? '')
  const [fecha, setFecha] = useState(existente?.fecha ?? hoy())
  const [nota, setNota] = useState(existente?.nota ?? '')
  const [conceptoId, setConceptoId] = useState(existente?.concepto_deducible_id ?? null)
  const [repetir, setRepetir] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const montoRef = useRef(null)

  const soloLectura = existente?.origen === 'mis_cargas'
  const editando = Boolean(existente)

  useEffect(() => {
    if (!editando) montoRef.current?.focus({ preventScroll: true })
  }, [editando])

  const opcionesCategoria = useMemo(() => categorias
    .filter((c) => c.area === area && c.tipo === tipo && c.activa)
    // La pérdida de un camión la carga solo la sincronización con Mis Cargas.
    .filter((c) => !(c.clave === 'mis_cargas' && c.tipo === 'gasto') || c.id === categoriaId)
    .map((c) => ({ valor: c.id, nombre: c.nombre })), [categorias, area, tipo, categoriaId])

  const categoria = categorias.find((c) => c.id === categoriaId)
  const esSueldo = categoria && ['sueldo', 'aguinaldo'].includes(categoria.clave)
  const personasDelArea = personas.filter((p) => p.area === area && (p.activa || p.id === personaId))
  const patentesConocidas = [...new Set(movimientos.map((m) => m.patente).filter(Boolean))].sort()

  function cambiarArea(nueva) {
    setArea(nueva)
    setCategoriaId(null)
    setPersonaId(null)
  }

  function cambiarTipo(nuevo) {
    setTipo(nuevo)
    setCategoriaId(null)
    setPersonaId(null)
    if (nuevo === 'ingreso') setRepetir(false)
  }

  function elegirCategoria(idCat) {
    setCategoriaId(idCat)
    const cat = categorias.find((c) => c.id === idCat)
    // El concepto deducible se sugiere según la categoría; se puede cambiar.
    if (!editando || !conceptoId) setConceptoId(cat?.concepto_deducible_id ?? null)
    if (cat && ['sueldo', 'aguinaldo'].includes(cat.clave)) {
      const delArea = personas.filter((p) => p.area === area && p.activa)
      if (delArea.length === 1) {
        setPersonaId(delArea[0].id)
        if (!leerMonto(montoTexto) && cat.clave === 'sueldo') setMontoTexto(montoAEntrada(delArea[0].sueldo_mensual))
      }
    } else {
      setPersonaId(null)
    }
  }

  async function guardar(e) {
    e.preventDefault()
    setError(null)
    const monto = leerMonto(montoTexto)
    if (!monto || monto <= 0) return setError('Escribí el monto.')
    if (!categoriaId) return setError('Elegí una categoría.')
    if (!fecha) return setError('Elegí la fecha.')
    setGuardando(true)
    try {
      await guardarMovimiento({
        tipo, area, categoria_id: categoriaId, monto, fecha, nota,
        persona_id: esSueldo ? personaId : null,
        patente: area === 'camiones' ? patente : null,
        concepto_deducible_id: conceptoId,
        repetir: !editando && tipo === 'gasto' && repetir,
      }, existente?.id)
      avisar(editando ? 'Cambios guardados' : tipo === 'gasto' ? 'Gasto guardado' : 'Ingreso guardado')
      alTerminar()
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  async function borrar() {
    setGuardando(true)
    try {
      await borrarMovimiento(existente.id)
      avisar('Movimiento borrado')
      alTerminar()
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  const titulo = editando
    ? (tipo === 'gasto' ? 'Editar gasto' : 'Editar ingreso')
    : (tipo === 'gasto' ? 'Nuevo gasto' : 'Nuevo ingreso')

  if (soloLectura) return <DetalleMisCargas mov={existente} categoria={categoria} alVolver={alTerminar} />

  return (
    <div className="min-h-screen bg-fondo md:min-h-0 md:bg-transparent md:px-10 md:py-8">
      <form onSubmit={guardar} className="mx-auto md:max-w-xl">
        <header className="sticky top-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center border-b border-borde bg-white px-5 pb-3.5 pt-[max(0.875rem,env(safe-area-inset-top))] md:static md:mb-6 md:border-0 md:bg-transparent md:p-0">
          <button type="button" onClick={alTerminar} className="justify-self-start text-[16px] text-suave">Cancelar</button>
          <h1 className="text-[20px] font-semibold md:text-[26px]">{titulo}</h1>
          <span />
        </header>

        <div className="space-y-6 px-5 py-5 md:tarjeta md:p-7">
          <div className="space-y-3">
            <Segmentado opciones={OPCIONES_AREA} valor={area} onCambio={cambiarArea} etiqueta="Área" />
            <div className="flex justify-center">
              <div className="inline-flex rounded-full bg-[#eceef1] p-0.5 text-[14px]">
                {OPCIONES_TIPO.map((o) => (
                  <button
                    key={o.valor}
                    type="button"
                    aria-pressed={tipo === o.valor}
                    onClick={() => cambiarTipo(o.valor)}
                    className={`rounded-full px-4 py-1 ${tipo === o.valor ? 'bg-white font-semibold text-tinta' : 'text-suave'}`}
                  >
                    {o.nombre}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="flex items-center justify-center gap-2 py-2">
            <span className="sr-only">Monto</span>
            <span className="text-[40px] font-semibold text-tinta">$</span>
            <input
              ref={montoRef}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={montoTexto}
              onChange={(e) => setMontoTexto(formatearEntrada(e.target.value))}
              className="num w-full max-w-[16rem] bg-transparent text-center text-[44px] font-semibold text-tinta placeholder:text-[#c5cad1] focus:outline-none"
              style={{ width: `${Math.max(1, montoTexto.length) + 1}ch` }}
            />
          </label>

          <div>
            <Rotulo className="mb-2.5">Categoría</Rotulo>
            <Chips opciones={opcionesCategoria} valor={categoriaId} onCambio={elegirCategoria} color={area} />
          </div>

          {esSueldo && personasDelArea.length > 0 && (
            <div>
              <Rotulo className="mb-2.5">Persona</Rotulo>
              <Chips
                opciones={personasDelArea.map((p) => ({ valor: p.id, nombre: p.nombre, deseleccionable: true }))}
                valor={personaId}
                onCambio={setPersonaId}
                color={area}
              />
            </div>
          )}

          {area === 'camiones' && (
            <label className="block">
              <Rotulo className="mb-2">Patente (opcional)</Rotulo>
              <input className="campo uppercase" list="patentes" value={patente} onChange={(e) => setPatente(e.target.value.toUpperCase())} placeholder="AE 412 KT" />
              <datalist id="patentes">
                {patentesConocidas.map((p) => <option key={p} value={p} />)}
              </datalist>
            </label>
          )}

          <label className="block">
            <Rotulo className="mb-2">Fecha</Rotulo>
            <input type="date" className="campo" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </label>

          <label className="block">
            <Rotulo className="mb-2">Nota</Rotulo>
            <input className="campo" value={nota} onChange={(e) => setNota(e.target.value)} placeholder={tipo === 'ingreso' ? 'Ej.: Sucesión Ramírez' : 'Ej.: compra del mes'} maxLength={140} />
          </label>

          {tipo === 'gasto' && (
            <label className="block">
              <Rotulo className="mb-2">Deducible de Ganancias</Rotulo>
              <select className="campo" value={conceptoId ?? ''} onChange={(e) => setConceptoId(e.target.value || null)}>
                <option value="">No</option>
                {conceptos.filter((c) => c.activo || c.id === conceptoId).map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              {conceptoId && (
                <span className="mt-1.5 block text-[13px] text-suave">Si se puede deducir o no, lo confirma el contador.</span>
              )}
            </label>
          )}

          {tipo === 'gasto' && !editando && (
            <div>
              <Rotulo className="mb-2">Repetir</Rotulo>
              <div className="campo flex items-center justify-between">
                <span>Todos los meses</span>
                <Interruptor activo={repetir} onCambio={setRepetir} etiqueta="Repetir todos los meses" />
              </div>
              {repetir && (
                <p className="mt-1.5 text-[13px] text-suave">
                  Queda en Vencimientos para el mes que viene; lo pagan con un toque.
                </p>
              )}
            </div>
          )}

          {editando && (
            <p className="text-[14px] text-suave">
              Lo cargó {nombreMiembro(miembros, existente.creado_por) ?? 'alguien del hogar'} el {fechaCorta(hoy(new Date(existente.created_at)))}.
            </p>
          )}

          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[15px] text-negativo">{error}</p>}

          <button type="submit" disabled={guardando} className="boton-primario w-full py-4 text-[17px]">
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : tipo === 'gasto' ? 'Guardar gasto' : 'Guardar ingreso'}
          </button>

          {editando && (
            confirmarBorrado ? (
              <div className="flex gap-3">
                <button type="button" className="boton-secundario flex-1" onClick={() => setConfirmarBorrado(false)}>No, dejarlo</button>
                <button type="button" className="boton-peligro flex-1" onClick={borrar} disabled={guardando}>Sí, borrar</button>
              </div>
            ) : (
              <button type="button" className="boton-peligro w-full" onClick={() => setConfirmarBorrado(true)}>Borrar movimiento</button>
            )
          )}
        </div>
      </form>
    </div>
  )
}

function DetalleMisCargas({ mov, categoria, alVolver }) {
  return (
    <div className="mx-auto px-5 py-6 md:max-w-xl md:px-10 md:py-8">
      <button type="button" onClick={alVolver} className="text-suave">Volver</button>
      <Tarjeta className="mt-4 p-6">
        <Rotulo>Desde Mis Cargas</Rotulo>
        <h1 className="mt-2 text-[22px] font-semibold">{mov.patente ?? 'Camión'}</h1>
        <Monto valor={mov.monto} tipo={mov.tipo} className="mt-2 block text-[32px] font-semibold" />
        <p className="mt-3 text-suave">{categoria?.nombre} · {mov.nota} · cierre del {fechaCorta(mov.fecha)}</p>
        <p className="mt-4 text-[15px] text-suave">
          Este número viene de Mis Cargas y se actualiza solo. Para cambiarlo, corregí los viajes allá.
        </p>
      </Tarjeta>
    </div>
  )
}
