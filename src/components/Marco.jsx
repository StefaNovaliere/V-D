import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AlignLeft, CalendarDays, ChartNoAxesColumn, Settings } from 'lucide-react'
import { useStore } from '../store/useStore.js'
import { AREA } from '../lib/areas.js'
import { PuntoArea } from './ui.jsx'

const enlaceLateral = ({ isActive }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[16px] transition-colors ${
    isActive ? 'bg-[#eceef1] font-semibold text-tinta' : 'text-tinta/85 hover:bg-[#eceef1]/60'
  }`

function BarraLateral() {
  const miembros = useStore((s) => s.miembros)
  const demo = useStore((s) => s.demo)
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-borde bg-white px-4 py-6 md:flex">
      <div className="mb-7 flex items-center gap-3 px-2">
        <img src="/icons/icon-192.png" alt="" className="h-9 w-9 rounded-lg" />
        <span className="text-[17px] font-semibold leading-tight">Cuentas de la familia</span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5" aria-label="Secciones">
        <NavLink to="/" end className={enlaceLateral}>Resumen</NavLink>
        <div className="my-3 border-t border-borde" />
        {['casa', 'estudio', 'camiones'].map((a) => (
          <NavLink key={a} to={`/area/${a}`} className={enlaceLateral}>
            <PuntoArea area={a} /> {AREA[a].nombre}
          </NavLink>
        ))}
        <div className="my-3 border-t border-borde" />
        <NavLink to="/movimientos" className={enlaceLateral}>Movimientos</NavLink>
        <NavLink to="/anual" className={enlaceLateral}>Resumen anual</NavLink>
        <NavLink to="/por-cobrar" className={enlaceLateral}>Por cobrar</NavLink>
        <NavLink to="/sueldos" className={enlaceLateral}>Sueldos</NavLink>
        <NavLink to="/vencimientos" className={enlaceLateral}>Vencimientos</NavLink>
        <NavLink to="/deducibles" className={enlaceLateral}>Deducibles</NavLink>
        <NavLink to="/monotributo" className={enlaceLateral}>Monotributo</NavLink>
        <NavLink to="/ajustes" className={enlaceLateral}>Ajustes</NavLink>
      </nav>
      <div className="border-t border-borde px-2 pt-4 text-[14px] leading-relaxed text-suave">
        Cuenta familiar · {miembros.length} {miembros.length === 1 ? 'usuario' : 'usuarios'}
        {demo && <div>Datos de ejemplo</div>}
      </div>
    </aside>
  )
}

const enlaceInferior = ({ isActive }) =>
  `flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2 text-[13px] ${isActive ? 'font-semibold text-acento' : 'text-suave'}`

function BarraInferior() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-borde bg-white safe-bottom md:hidden"
      aria-label="Secciones"
    >
      <NavLink to="/" end className={enlaceInferior}>
        <ChartNoAxesColumn size={22} strokeWidth={1.8} /> Resumen
      </NavLink>
      <NavLink to="/movimientos" className={enlaceInferior}>
        <AlignLeft size={22} strokeWidth={1.8} /> Movimientos
      </NavLink>
      <NavLink to="/vencimientos" className={enlaceInferior}>
        <CalendarDays size={22} strokeWidth={1.8} /> Vencimientos
      </NavLink>
      <NavLink to="/ajustes" className={enlaceInferior}>
        <Settings size={22} strokeWidth={1.8} /> Ajustes
      </NavLink>
    </nav>
  )
}

function Aviso() {
  const aviso = useStore((s) => s.aviso)
  if (!aviso) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 md:bottom-8">
      <div
        role="status"
        className={`rounded-xl px-4 py-3 text-[15px] font-medium text-white ${
          aviso.tipo === 'error' ? 'bg-negativo' : 'bg-tinta'
        }`}
      >
        {aviso.texto}
      </div>
    </div>
  )
}

export default function Marco() {
  const { pathname } = useLocation()
  // La pantalla de carga ocupa todo en el celular, sin barra inferior.
  const pantallaCompleta = pathname.startsWith('/nuevo') || pathname.startsWith('/movimiento/')
  return (
    <div className="min-h-screen">
      <BarraLateral />
      <main className={`md:pl-60 ${pantallaCompleta ? '' : 'pb-barra'} md:pb-10`}>
        <Outlet />
      </main>
      {!pantallaCompleta && <BarraInferior />}
      <Aviso />
    </div>
  )
}
