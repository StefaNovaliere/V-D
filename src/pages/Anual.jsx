import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import Encabezado from '../components/Encabezado.jsx'
import { BarrasCategorias, ColumnasSaldo } from '../components/Graficos.jsx'
import { Chips, Interruptor, Monto, Rotulo, Tarjeta, Vacio } from '../components/ui.jsx'
import { aPesosDe, resumenAnual } from '../lib/calculos.js'
import { hoy, mesActual, nombreMes, nombreMesCorto } from '../lib/fechas.js'

const INICIALES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** El año entero: cuánto les quedó cada mes y en qué se fue la plata. */
export default function Anual() {
  const categorias = useStore((s) => s.categorias)
  const consultar = useStore((s) => s.consultarMovimientos)
  const inflacion = useStore((s) => s.inflacion)
  const anioActual = Number(hoy().slice(0, 4))
  const [anio, setAnio] = useState(anioActual)
  const [movs, setMovs] = useState(null)
  const [ajustar, setAjustar] = useState(false)

  useEffect(() => {
    let vigente = true
    consultar({ gte: { fecha: `${anio}-01-01` }, lte: { fecha: `${anio}-12-31` } })
      .then((f) => vigente && setMovs(f))
      .catch(() => vigente && setMovs([]))
    return () => { vigente = false }
  }, [anio, consultar])

  const r = useMemo(() => resumenAnual(movs ?? [], anio, categorias), [movs, anio, categorias])

  // "En pesos de hoy": cada mes llevado al mes actual con el IPC.
  const hasta = mesActual()
  const ajusta = ajustar && inflacion
  const llevar = (monto, mes) => (ajusta ? aPesosDe(monto, mes, hasta, inflacion.ipc) ?? monto : monto)
  const meses = r.meses.map((m) => ({
    ...m,
    entro: llevar(m.entro, m.mes),
    salio: llevar(m.salio, m.mes),
    quedo: llevar(m.quedo, m.mes),
  }))
  const total = (campo) => meses.reduce((t, m) => t + m[campo], 0)
  const conDatos = meses.filter((m) => m.cantidad > 0)

  // En qué se fue: con el ajuste, cada gasto se lleva a pesos de hoy por su mes.
  const enQueSeFue = useMemo(() => {
    if (!ajusta) return r.enQueSeFue
    const porCat = new Map()
    for (const m of movs ?? []) {
      if (m.tipo !== 'gasto') continue
      const v = llevar(Number(m.monto), m.fecha.slice(0, 7))
      porCat.set(m.categoria_id, (porCat.get(m.categoria_id) ?? 0) + v)
    }
    return r.enQueSeFue.map((g) => ({ ...g, monto: porCat.get(g.categoria_id) ?? g.monto })).sort((a, b) => b.monto - a.monto)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ajusta, r, movs, inflacion])

  const top = enQueSeFue.slice(0, 7).map((g) => ({ clave: g.categoria_id, nombre: g.nombre, area: g.area, monto: g.monto }))
  const resto = enQueSeFue.slice(7)
  if (resto.length) top.push({ clave: 'resto', nombre: `Otras ${resto.length} categorías`, area: null, monto: resto.reduce((t, g) => t + g.monto, 0) })

  return (
    <>
      <Encabezado titulo="Resumen anual" tituloCelular="Resumen anual" conMes={false} />
      <div className="space-y-4 px-4 py-4 md:space-y-6 md:px-10 md:py-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Chips
            opciones={[anioActual - 2, anioActual - 1, anioActual].map((a) => ({ valor: a, nombre: String(a) }))}
            valor={anio}
            onCambio={setAnio}
          />
          {inflacion && (
            <label className="flex items-center gap-3 text-[15px]">
              <span>En pesos de {nombreMes(hasta)}</span>
              <Interruptor activo={ajustar} onCambio={setAjustar} etiqueta={`Mostrar en pesos de ${nombreMes(hasta)}`} />
            </label>
          )}
        </div>
        {ajusta && (
          <p className="-mt-2 text-[13px] text-suave">
            Cada mes ajustado por el IPC del INDEC. Último dato publicado: {nombreMes(inflacion.ultimoPublicado)}
            {inflacion.estimados.length ? '; los meses siguientes se estiman con la última inflación mensual.' : '.'}
          </p>
        )}

        {movs === null ? <Tarjeta className="px-5"><Vacio>Cargando…</Vacio></Tarjeta> : !conDatos.length ? (
          <Tarjeta className="px-5"><Vacio>No hay movimientos en {anio}.</Vacio></Tarjeta>
        ) : (
          <>
            <Tarjeta className="grid grid-cols-1 divide-y divide-borde px-5 py-2 md:grid-cols-3 md:divide-y-0 md:px-7 md:py-5">
              {[['Entró', 'entro', false], ['Salió', 'salio', false], ['Quedó', 'quedo', true]].map(([titulo, campo, saldo]) => (
                <div key={campo} className="flex items-baseline justify-between py-3 md:block md:py-0">
                  <Rotulo>{titulo}</Rotulo>
                  <Monto valor={total(campo)} saldo={saldo} className="text-[20px] font-semibold md:mt-1 md:block md:text-[24px]" />
                </div>
              ))}
            </Tarjeta>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
              <Tarjeta className="px-4 py-5 md:px-6">
                <h2 className="mb-3 text-[17px] font-semibold">Cuánto les quedó cada mes</h2>
                <ColumnasSaldo
                  etiquetas={INICIALES}
                  datos={meses.map((m) => ({
                    clave: m.mes, valor: m.quedo, entro: m.entro, salio: m.salio,
                    titulo: `${nombreMesCorto(m.mes)} ${anio}`,
                  }))}
                />
              </Tarjeta>
              <Tarjeta className="px-5 py-5 md:px-6">
                <h2 className="mb-4 text-[17px] font-semibold">En qué se fue la plata</h2>
                <BarrasCategorias filas={top} />
              </Tarjeta>
            </div>

            <Tarjeta className="overflow-x-auto px-4 py-4 md:px-6">
              <table className="w-full text-[13px] md:text-[14px]">
                <caption className="rotulo mb-2 text-left">Mes por mes</caption>
                <thead>
                  <tr className="text-left text-suave">
                    <th className="py-2 font-medium">Mes</th>
                    <th className="py-2 text-right font-medium">Entró</th>
                    <th className="py-2 text-right font-medium">Salió</th>
                    <th className="py-2 text-right font-medium">Quedó</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {conDatos.map((m) => (
                    <tr key={m.mes}>
                      <td className="py-2">
                        <span className="md:hidden">{nombreMesCorto(m.mes).slice(0, 3)}</span>
                        <span className="hidden md:inline">{nombreMesCorto(m.mes)}</span>
                      </td>
                      <td className="py-2 text-right"><Monto valor={m.entro} /></td>
                      <td className="py-2 text-right"><Monto valor={m.salio} /></td>
                      <td className="py-2 text-right"><Monto valor={m.quedo} saldo className="font-semibold" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Tarjeta>
          </>
        )}
      </div>
    </>
  )
}
