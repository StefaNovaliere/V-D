import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './store/useStore.js'
import Marco from './components/Marco.jsx'
import { Cargando } from './components/ui.jsx'
import Resumen from './pages/Resumen.jsx'

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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
