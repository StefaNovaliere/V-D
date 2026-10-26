/**
 * 'Honorarios · Sucesión Ramírez'. Si la nota ya empieza con el nombre de la
 * categoría ("Seguro de los camiones" en Seguro), queda solo la nota.
 */
export function tituloMovimiento(mov, categorias) {
  const cat = categorias.find((c) => c.id === mov.categoria_id)
  const nombre = cat?.nombre ?? 'Sin categoría'
  if (!mov.nota) return nombre
  if (mov.nota.toLowerCase().startsWith(nombre.toLowerCase())) return mov.nota
  return `${nombre} · ${mov.nota}`
}
