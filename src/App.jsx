import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './store/useStore.js'
import Marco from './components/Marco.jsx'
import { Cargando } from './components/ui.jsx'
import Resumen from './pages/Resumen.jsx'
import Area from './pages/Area.jsx'
import Movimientos from './pages/Movimientos.jsx'
import NuevoMovimiento from './pages/NuevoMovimiento.jsx'
import Sueldos from './pages/Sueldos.jsx'
import Vencimientos from './pages/Vencimientos.jsx'
import Deducibles from './pages/Deducibles.jsx'
import Monotributo from './pages/Monotributo.jsx'
import Ajustes from './pages/Ajustes.jsx'

function Pantalla({ titulo, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold">{titulo}</h1>
        <div className="mt-2 text-suave">{children}</div>
      </div>
    </div>
  )
}

export default function App() {
  const estado = useStore((s) => s.estado)
  const error = useStore((s) => s.error)
  const iniciar = useStore((s) => s.iniciar)

  useEffect(() => {
    iniciar()
  }, [iniciar])

  if (estado === 'cargando') return <Cargando />
  if (estado === 'error') {
    return (
      <Pantalla titulo="No se pudo abrir la app">
        <p>{error}</p>
        <button type="button" className="boton-primario mt-5" onClick={() => location.reload()}>Probar de nuevo</button>
      </Pantalla>
    )
  }

  return (
    <Routes>
      <Route element={<Marco />}>
        <Route index element={<Resumen />} />
        <Route path="area/:area" element={<Area />} />
        <Route path="movimientos" element={<Movimientos />} />
        <Route path="nuevo" element={<NuevoMovimiento />} />
        <Route path="movimiento/:id" element={<NuevoMovimiento />} />
        <Route path="sueldos" element={<Sueldos />} />
        <Route path="vencimientos" element={<Vencimientos />} />
        <Route path="deducibles" element={<Deducibles />} />
        <Route path="monotributo" element={<Monotributo />} />
        <Route path="ajustes" element={<Ajustes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
