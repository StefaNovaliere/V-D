import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, LogOut, Plus } from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { db } from '../lib/db/index.js'
import Encabezado from '../components/Encabezado.jsx'
import { Interruptor, Rotulo, Tarjeta } from '../components/ui.jsx'
import { BotonCarpetaContador } from './Movimientos.jsx'

function Seccion({ id, titulo, children }) {
  return (
    <Tarjeta id={id} className="scroll-mt-20 px-5 py-5 md:px-6">
      <h2 className="mb-3 text-[18px] font-semibold">{titulo}</h2>
      {children}
    </Tarjeta>
  )
}

function MisCargas() {
  const misCargas = useStore((s) => s.misCargas)
  const conectar = useStore((s) => s.conectarMisCargas)
  const sincronizar = useStore((s) => s.sincronizarMisCargas)
  const sincronizando = useStore((s) => s.sincronizando)
  const avisar = useStore((s) => s.avisar)
  const [editando, setEditando] = useState(false)
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState(null)

  async function guardar(e) {
    e.preventDefault()
    setError(null)
    if (!/^https:\/\//.test(url.trim())) return setError('La dirección tiene que empezar con https://')
    if (!token.trim()) return setError('Pegá el token que te dio Mis Cargas.')
    try {
      await conectar(url.trim(), token.trim())
      setEditando(false)
      setToken('')
      avisar('Mis Cargas conectada')
      sincronizar({ meses: 6 })
    } catch (err) {
      setError(err.message)
    }
  }

  async function desconectar() {
    try {
      await conectar('', '')
      avisar('Mis Cargas desconectada')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Seccion id="mis-cargas" titulo="Mis Cargas">
      <p className="text-[15px] text-suave">
        Trae solo el ingreso limpio de cada camión por mes. En Mis Cargas, entrá a Configuración → "Token para la app
        familiar", generá uno y pegalo acá.
      </p>
      {misCargas?.conectado && !editando ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl bg-fondo px-4 py-3 text-[15px]">
            <div className="font-medium text-positivo">Conectada</div>
            <div className="truncate text-suave">{misCargas.url}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="boton-primario" onClick={() => sincronizar({ meses: 6 })} disabled={sincronizando}>
              {sincronizando ? 'Actualizando…' : 'Actualizar últimos 6 meses'}
            </button>
            <button type="button" className="boton-secundario" onClick={() => { setUrl(misCargas.url ?? ''); setEditando(true) }}>Cambiar token</button>
            <button type="button" className="boton-peligro" onClick={desconectar}>Desconectar</button>
          </div>
        </div>
      ) : (
        <form onSubmit={guardar} className="mt-4 space-y-3">
          <input className="campo" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co/functions/v1/ingreso-mensual" />
          <input className="campo" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Token" autoComplete="off" />
          {error && <p role="alert" className="text-[15px] text-negativo">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="boton-primario">Conectar</button>
            {editando && <button type="button" className="boton-secundario" onClick={() => setEditando(false)}>Cancelar</button>}
          </div>
          <p className="text-[13px] text-suave">El token se guarda en el servidor y no se vuelve a mostrar.</p>
        </form>
      )}
    </Seccion>
  )
}

function Conceptos() {
  const conceptos = useStore((s) => s.conceptos)
  const guardarConcepto = useStore((s) => s.guardarConcepto)
  const avisar = useStore((s) => s.avisar)
  const [nuevo, setNuevo] = useState('')
  const [editandoId, setEditandoId] = useState(null)
  const [texto, setTexto] = useState('')

  const fallo = (err) => avisar(err.message, 'error')

  async function agregar(e) {
    e.preventDefault()
    if (!nuevo.trim()) return
    await guardarConcepto({ nombre: nuevo, orden: conceptos.length + 1 }).catch(fallo)
    setNuevo('')
  }

  async function renombrar(c) {
    if (texto.trim() && texto.trim() !== c.nombre) await guardarConcepto({ ...c, nombre: texto }, c.id).catch(fallo)
    setEditandoId(null)
  }

  return (
    <Seccion id="deducibles" titulo="Conceptos deducibles de Ganancias">
      <p className="text-[15px] text-suave">
        Son los que aparecen al marcar un gasto como deducible. Vienen algunos de ejemplo: ajustalos con lo que diga el contador.
      </p>
      <ul className="mt-3 divide-y divide-borde">
        {conceptos.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2.5">
            {editandoId === c.id ? (
              <input
                className="campo flex-1 py-2"
                value={texto}
                autoFocus
                onChange={(e) => setTexto(e.target.value)}
                onBlur={() => renombrar(c)}
                onKeyDown={(e) => e.key === 'Enter' && renombrar(c)}
              />
            ) : (
              <button type="button" className={`flex-1 text-left text-[15px] ${c.activo ? '' : 'text-suave line-through'}`} onClick={() => { setEditandoId(c.id); setTexto(c.nombre) }}>
                {c.nombre}
              </button>
            )}
            <Interruptor activo={c.activo} onCambio={(v) => guardarConcepto({ ...c, activo: v }, c.id).catch(fallo)} etiqueta={`Usar ${c.nombre}`} />
          </li>
        ))}
      </ul>
      <form onSubmit={agregar} className="mt-3 flex gap-2">
        <input className="campo flex-1" value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nuevo concepto" />
        <button type="submit" className="boton-secundario" aria-label="Agregar concepto"><Plus size={18} /></button>
      </form>
    </Seccion>
  )
}

export default function Ajustes() {
  const miembros = useStore((s) => s.miembros)
  const usuario = useStore((s) => s.usuario)
  const hogar = useStore((s) => s.hogar)
  const demo = useStore((s) => s.demo)
  const salir = useStore((s) => s.salir)
  const { hash } = useLocation()

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
  }, [hash])

  return (
    <>
      <Encabezado titulo="Ajustes" conMes={false} />
      <div className="grid grid-cols-1 gap-4 px-4 py-4 md:grid-cols-2 md:gap-6 md:px-10 md:py-0">
        <div className="space-y-4 md:space-y-6">
          <Tarjeta className="px-5 md:hidden">
            <ul className="divide-y divide-borde">
              {[['/sueldos', 'Sueldos'], ['/deducibles', 'Deducibles de Ganancias'], ['/monotributo', 'Control del monotributo'], ['/area/casa', 'Casa'], ['/area/estudio', 'Estudio'], ['/area/camiones', 'Camiones']].map(([to, nombre]) => (
                <li key={to}>
                  <Link to={to} className="flex items-center justify-between py-3.5 text-[16px]">
                    {nombre} <ChevronRight size={18} className="text-suave" />
                  </Link>
                </li>
              ))}
            </ul>
          </Tarjeta>

          <Seccion titulo="Carpeta para el contador">
            <p className="mb-3 text-[15px] text-suave">
              Un Excel del mes elegido con una hoja por área y un resumen, listo para mandarle.
            </p>
            <BotonCarpetaContador />
          </Seccion>

          <MisCargas />
        </div>
        <div className="space-y-4 md:space-y-6">
          <Seccion titulo={hogar?.nombre ?? 'Hogar'}>
            <Rotulo className="mb-1">Ven y cargan los mismos datos</Rotulo>
            <ul className="divide-y divide-borde">
              {miembros.map((m) => (
                <li key={m.user_id} className="flex justify-between py-2.5 text-[15px]">
                  <span>{m.nombre}</span>
                  {m.user_id === usuario?.id && <span className="text-suave">Vos{usuario.email && !demo ? ` · ${usuario.email}` : ''}</span>}
                </li>
              ))}
            </ul>
            {demo ? (
              <div className="mt-4 rounded-xl bg-fondo px-4 py-3 text-[14px] text-suave">
                Modo demostración: los datos son de ejemplo y quedan solo en este navegador.
                <button
                  type="button"
                  className="mt-2 block font-semibold text-acento"
                  onClick={() => { db.reiniciar(); location.reload() }}
                >
                  Volver a los datos de ejemplo
                </button>
              </div>
            ) : (
              <button type="button" className="boton-secundario mt-4" onClick={salir}><LogOut size={18} /> Cerrar sesión</button>
            )}
          </Seccion>

          <Conceptos />
        </div>
      </div>
    </>
  )
}
