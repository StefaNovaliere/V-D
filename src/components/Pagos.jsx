import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { siguienteVencimiento } from '../lib/calculos.js'
import { AREA, FRECUENCIAS } from '../lib/areas.js'
import { fechaLarga, hoy } from '../lib/fechas.js'
import { formatearEntrada, leerMonto, montoAEntrada } from '../lib/formato.js'
import { Campo, Hoja, Interruptor, Segmentado } from './ui.jsx'

function CampoMonto({ valor, onCambio, etiqueta = 'Monto' }) {
  return (
    <Campo etiqueta={etiqueta}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-suave">$</span>
        <input
          className="campo num pl-8"
          inputMode="decimal"
          value={valor}
          onChange={(e) => onCambio(formatearEntrada(e.target.value))}
          placeholder="0"
        />
      </div>
    </Campo>
  )
}

/**
 * Pagar un gasto fijo: carga el gasto y corre el vencimiento. Se puede
 * cambiar el monto (el seguro aumenta) y la fecha (se pagó otro día).
 */
export function HojaPagar({ fijo, onCerrar }) {
  const pagarGastoFijo = useStore((s) => s.pagarGastoFijo)
  const avisar = useStore((s) => s.avisar)
  const [monto, setMonto] = useState(fijo ? montoAEntrada(fijo.monto) : '')
  const [fecha, setFecha] = useState(hoy())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  async function pagar(e) {
    e.preventDefault()
    const n = leerMonto(monto)
    if (!n) return setError('Escribí el monto que pagaron.')
    setGuardando(true)
    try {
      await pagarGastoFijo(fijo, { fecha, monto: n })
      avisar(`${fijo.concepto}: pago cargado`)
      onCerrar()
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  return (
    <Hoja abierta={Boolean(fijo)} onCerrar={onCerrar} titulo={`Pagar ${fijo?.concepto ?? ''}`}>
      {fijo && (
        <form onSubmit={pagar} className="space-y-4">
          <p className="text-[15px] text-suave">
            Vence el {fechaLarga(fijo.proximo_vencimiento)}. Al pagarlo se carga el gasto en {AREA[fijo.area].nombre} y
            el próximo vencimiento pasa al {fechaLarga(siguienteVencimiento(fijo.proximo_vencimiento, fijo.frecuencia), true)}.
          </p>
          <CampoMonto valor={monto} onCambio={setMonto} etiqueta="Monto pagado" />
          <Campo etiqueta="Fecha de pago">
            <input type="date" className="campo" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </Campo>
          {error && <p role="alert" className="text-[15px] text-negativo">{error}</p>}
          <button type="submit" className="boton-primario w-full py-3.5" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Cargar el pago'}
          </button>
        </form>
      )}
    </Hoja>
  )
}

const OPCIONES_AREA = ['casa', 'estudio', 'camiones'].map((a) => ({ valor: a, nombre: AREA[a].nombre, area: a }))

/** Alta o edición de un gasto fijo con vencimiento. */
export function HojaGastoFijo({ abierta, fijo, inicial, onCerrar }) {
  return (
    <Hoja abierta={abierta} onCerrar={onCerrar} titulo={fijo ? 'Editar vencimiento' : 'Nuevo vencimiento'}>
      {abierta && <FormGastoFijo key={fijo?.id ?? 'nuevo'} fijo={fijo} inicial={inicial} onCerrar={onCerrar} />}
    </Hoja>
  )
}

function FormGastoFijo({ fijo, inicial, onCerrar }) {
  const categorias = useStore((s) => s.categorias)
  const guardarGastoFijo = useStore((s) => s.guardarGastoFijo)
  const borrarGastoFijo = useStore((s) => s.borrarGastoFijo)
  const avisar = useStore((s) => s.avisar)
  const base = fijo ?? inicial ?? {}
  const [area, setArea] = useState(base.area ?? 'camiones')
  const [categoriaId, setCategoriaId] = useState(
    base.categoria_id ?? categorias.find((c) => c.area === (base.area ?? 'camiones') && c.tipo === 'gasto' && c.clave === base.clave)?.id ?? '',
  )
  const [concepto, setConcepto] = useState(base.concepto ?? '')
  const [detalle, setDetalle] = useState(base.detalle ?? '')
  const [patente, setPatente] = useState(base.patente ?? '')
  const [monto, setMonto] = useState(base.monto ? montoAEntrada(base.monto) : '')
  const [frecuencia, setFrecuencia] = useState(base.frecuencia ?? 'mensual')
  const [vence, setVence] = useState(base.proximo_vencimiento ?? '')
  const [impositivo, setImpositivo] = useState(base.es_impositivo ?? false)
  const [activo, setActivo] = useState(base.activo ?? true)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const esSueldo = Boolean(fijo?.persona_id)

  const opciones = categorias.filter((c) => c.area === area && c.tipo === 'gasto' && c.activa && c.clave !== 'mis_cargas')

  async function guardar(e) {
    e.preventDefault()
    setError(null)
    if (!concepto.trim()) return setError('Poné un nombre, por ejemplo "Seguro".')
    if (!categoriaId) return setError('Elegí la categoría.')
    if (!vence) return setError('Elegí la fecha del próximo vencimiento.')
    setGuardando(true)
    try {
      await guardarGastoFijo({
        area, categoria_id: categoriaId, concepto, detalle, patente,
        monto: leerMonto(monto) ?? 0, frecuencia, proximo_vencimiento: vence,
        es_impositivo: impositivo, activo,
      }, fijo?.id)
      avisar('Vencimiento guardado')
      onCerrar()
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  async function borrar() {
    setGuardando(true)
    try {
      await borrarGastoFijo(fijo.id)
      avisar('Vencimiento borrado. Los pagos ya cargados quedan.')
      onCerrar()
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-4">
      {esSueldo ? (
        <p className="rounded-xl bg-fondo px-4 py-3 text-[15px] text-suave">
          Es el sueldo de {fijo.detalle}. El monto se cambia desde Sueldos; acá podés mover la fecha del próximo pago.
        </p>
      ) : (
        <>
          <Segmentado opciones={OPCIONES_AREA} valor={area} onCambio={(a) => { setArea(a); setCategoriaId('') }} etiqueta="Área" />
          <Campo etiqueta="Nombre">
            <input className="campo" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Seguro de los camiones" />
          </Campo>
          <Campo etiqueta="Categoría">
            <select className="campo" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Elegí…</option>
              {opciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
          <CampoMonto valor={monto} onCambio={setMonto} etiqueta="Monto de cada pago" />
        </>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Próximo vencimiento">
          <input type="date" className="campo" value={vence} onChange={(e) => setVence(e.target.value)} />
        </Campo>
        <Campo etiqueta="Se repite">
          <select className="campo" value={frecuencia} onChange={(e) => setFrecuencia(e.target.value)} disabled={esSueldo}>
            {FRECUENCIAS.map((f) => <option key={f.valor} value={f.valor}>{f.nombre}</option>)}
          </select>
        </Campo>
      </div>
      {!esSueldo && (
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Detalle">
            <input className="campo" value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="3 camiones" />
          </Campo>
          {area === 'camiones' && (
            <Campo etiqueta="Patente">
              <input className="campo uppercase" value={patente} onChange={(e) => setPatente(e.target.value.toUpperCase())} placeholder="AE 412 KT" />
            </Campo>
          )}
        </div>
      )}
      {!esSueldo && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-borde px-3.5 py-3">
          <span className="text-[15px]">Es un vencimiento impositivo</span>
          <Interruptor activo={impositivo} onCambio={setImpositivo} etiqueta="Es un vencimiento impositivo" />
        </div>
      )}
      {fijo && !esSueldo && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-borde px-3.5 py-3">
          <span className="text-[15px]">Activo</span>
          <Interruptor activo={activo} onCambio={setActivo} etiqueta="Activo" />
        </div>
      )}
      {error && <p role="alert" className="text-[15px] text-negativo">{error}</p>}
      <button type="submit" className="boton-primario w-full py-3.5" disabled={guardando}>Guardar</button>
      {fijo && !esSueldo && (
        confirmar ? (
          <div className="flex gap-3">
            <button type="button" className="boton-secundario flex-1" onClick={() => setConfirmar(false)}>No</button>
            <button type="button" className="boton-peligro flex-1" onClick={borrar} disabled={guardando}>Sí, borrar</button>
          </div>
        ) : (
          <button type="button" className="boton-peligro w-full" onClick={() => setConfirmar(true)}>Borrar vencimiento</button>
        )
      )}
    </form>
  )
}

export { CampoMonto }
