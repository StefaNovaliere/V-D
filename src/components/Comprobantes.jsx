import { useEffect, useRef, useState } from 'react'
import { Camera, FileText, X } from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { TIPOS_ACEPTADOS } from '../lib/archivos.js'
import { Rotulo } from './ui.jsx'

function Miniatura({ url, esPdf, etiqueta, onQuitar, href }) {
  const contenido = esPdf
    ? <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-[12px] text-suave"><FileText size={22} /> PDF</span>
    : url
      ? <img src={url} alt={etiqueta} className="h-full w-full object-cover" />
      : <span className="h-full w-full animate-pulse bg-fondo" />
  return (
    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-borde bg-white">
      {href ? <a href={href} target="_blank" rel="noreferrer" className="block h-full w-full" aria-label={`Ver ${etiqueta}`}>{contenido}</a> : contenido}
      <button
        type="button"
        onClick={onQuitar}
        className="absolute right-1 top-1 rounded-full bg-tinta/70 p-0.5 text-white"
        aria-label={`Quitar ${etiqueta}`}
      >
        <X size={14} />
      </button>
    </div>
  )
}

function Guardado({ comp, onBorrar }) {
  const urlComprobante = useStore((s) => s.urlComprobante)
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let vigente = true
    urlComprobante(comp.ruta).then((u) => vigente && setUrl(u)).catch(() => {})
    return () => { vigente = false }
  }, [comp.ruta, urlComprobante])
  return (
    <Miniatura
      url={url}
      href={url}
      esPdf={comp.tipo === 'application/pdf'}
      etiqueta="comprobante"
      onQuitar={() => onBorrar(comp)}
    />
  )
}

function Nuevo({ archivo, onQuitar }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (archivo.type === 'application/pdf') return
    // Data URL en vez de createObjectURL: no hay que acordarse de liberarla.
    let vigente = true
    const lector = new FileReader()
    lector.onload = () => vigente && setUrl(lector.result)
    lector.readAsDataURL(archivo)
    return () => { vigente = false }
  }, [archivo])
  return <Miniatura url={url} esPdf={archivo.type === 'application/pdf'} etiqueta={archivo.name} onQuitar={onQuitar} />
}

/**
 * Fotos o PDF de un movimiento. Los guardados se borran en el momento; los
 * nuevos se suben al guardar el movimiento (así sirve también al cargarlo).
 */
export default function Comprobantes({ movimientoId, nuevos, onNuevos }) {
  const listar = useStore((s) => s.listarComprobantes)
  const borrar = useStore((s) => s.borrarComprobante)
  const avisar = useStore((s) => s.avisar)
  const [guardados, setGuardados] = useState([])
  const entrada = useRef(null)

  useEffect(() => {
    if (!movimientoId) return
    let vigente = true
    listar(movimientoId).then((f) => vigente && setGuardados(f)).catch(() => {})
    return () => { vigente = false }
  }, [movimientoId, listar])

  async function borrarGuardado(c) {
    try {
      await borrar(c)
      setGuardados((g) => g.filter((x) => x.id !== c.id))
    } catch (e) {
      avisar(e.message, 'error')
    }
  }

  return (
    <div>
      <Rotulo className="mb-2">Comprobantes</Rotulo>
      <div className="flex flex-wrap gap-2">
        {guardados.map((c) => <Guardado key={c.id} comp={c} onBorrar={borrarGuardado} />)}
        {nuevos.map((a, i) => (
          <Nuevo key={`${a.name}-${i}`} archivo={a} onQuitar={() => onNuevos(nuevos.filter((_, j) => j !== i))} />
        ))}
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[#c5cad1] bg-white text-[13px] text-suave hover:bg-fondo"
        >
          <Camera size={20} /> Agregar
        </button>
      </div>
      <input
        ref={entrada}
        type="file"
        accept={TIPOS_ACEPTADOS}
        multiple
        className="hidden"
        onChange={(e) => {
          onNuevos([...nuevos, ...Array.from(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
      <p className="mt-1.5 text-[13px] text-suave">Una foto del ticket o la factura en PDF. Van en la carpeta para el contador.</p>
    </div>
  )
}
