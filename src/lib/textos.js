/** 'Honorarios · Sucesión Ramírez', o solo la categoría si la nota la repite. */
export function tituloMovimiento(mov, categorias) {
  const cat = categorias.find((c) => c.id === mov.categoria_id)
  const nombre = cat?.nombre ?? 'Sin categoría'
  return mov.nota && mov.nota !== nombre ? `${nombre} · ${mov.nota}` : nombre
}
