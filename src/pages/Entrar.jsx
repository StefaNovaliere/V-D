import { useState } from 'react'
import { useStore } from '../store/useStore.js'

export default function Entrar() {
  const entrar = useStore((s) => s.entrar)
  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState(null)
  const [entrando, setEntrando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !contrasena) return setError('Completá el email y la contraseña.')
    setEntrando(true)
    try {
      await entrar(email.trim(), contrasena)
    } catch (err) {
      setError(err.message)
      setEntrando(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-xl" />
          <h1 className="text-[22px] font-semibold leading-tight">Cuentas de la familia</h1>
        </div>
        <form onSubmit={enviar} className="tarjeta space-y-4 p-6">
          <label className="block">
            <span className="rotulo mb-2 block">Email</span>
            <input
              className="campo"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="rotulo mb-2 block">Contraseña</span>
            <input
              className="campo"
              type="password"
              autoComplete="current-password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
            />
          </label>
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[15px] text-negativo">{error}</p>}
          <button type="submit" className="boton-primario w-full py-3.5 text-[17px]" disabled={entrando}>
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <p className="mt-4 text-center text-[14px] text-suave">
          Si te olvidaste la contraseña, pedile a quien administra la app que te la cambie.
        </p>
      </div>
    </div>
  )
}
