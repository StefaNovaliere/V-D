import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FileSpreadsheet, Plus } from 'lucide-react'
import { useStore } from '../store/useStore.js'
import Encabezado from '../components/Encabezado.jsx'
import { ListaMovimientos } from '../components/Listas.jsx'
import { Monto, Tarjeta } from '../components/ui.jsx'
import { delMes, resumenDelMes } from '../lib/calculos.js'
import { nombreMes } from '../lib/fechas.js'
import { descargarCarpetaContador } from '../lib/carpetaContador.js'

export function BotonCarpetaContador({ className = '' }) {
  const mes = useStore((s) => s.mes)
  const avisar = useStore((s) => s.avisar)
  const [armando, setArmando] = useState(false)
  async function descargar() {
    setArmando(true)
    try {
      const s = useStore.getState()
      await descargarCarpetaContador({
        mes,
        movimientos: delMes(s.movimientos, mes),
        categorias: s.categorias,
        conceptos: s.conceptos,
        personas: s.personas,
        miembros: s.miembros,
      })
    } catch (e) {
      avisar(`No se pudo armar el Excel: ${e.message}`, 'error')
    } finally {
      setArmando(false)
    }
  }
  return (
    <button type="button" onClick={descargar} disabled={armando} className={`boton-secundario ${className}`}>
      <FileSpreadsheet size={18} /> {armando ? 'Armando…' : 'Carpeta para el contador'}
    </button>
  )
}

export default function Movimientos() {
  const mes = useStore((s) => s.mes)
  const movimientos = useStore((s) => s.movimientos)
  const categorias = useStore((s) => s.categorias)
  const cargando = useStore((s) => s.cargandoMovimientos)
  const movsMes = delMes(movimientos, mes)
  const r = resumenDelMes(movimientos, mes, categorias)
  return (
    <>
      <Encabezado titulo="Movimientos" tituloCelular="Movimientos" acciones={<BotonCarpetaContador />} />
      <div className="space-y-4 px-4 py-4 md:px-10 md:py-0">
        <div className="flex items-center justify-between gap-3 text-[15px] text-suave">
          <span>
            {movsMes.length} movimientos en {nombreMes(mes)} · quedó <Monto valor={r.quedo} saldo className="font-semibold" />
          </span>
        </div>
        <div className="flex gap-2 md:hidden">
          <Link to="/nuevo" className="boton-primario flex-1"><Plus size={18} /> Cargar</Link>
          <BotonCarpetaContador className="flex-1 px-2 text-[15px]" />
        </div>
        <Tarjeta className={`px-5 pb-2 md:px-6 ${cargando ? 'opacity-60' : ''}`}>
          <ListaMovimientos movimientos={movsMes} porDia />
        </Tarjeta>
      </div>
    </>
  )
}
