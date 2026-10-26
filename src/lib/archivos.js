// Fotos de comprobantes: se achican en el teléfono antes de subirlas. Una
// foto de 4 MB queda en unos 300 KB y se sigue leyendo bien.

const LADO_MAXIMO = 1600
export const TAMANO_MAXIMO = 10 * 1024 * 1024
export const TIPOS_ACEPTADOS = 'image/*,application/pdf'

export async function prepararArchivo(archivo) {
  if (archivo.type === 'application/pdf') return { blob: archivo, tipo: 'application/pdf', extension: 'pdf' }
  if (!archivo.type.startsWith('image/')) throw new Error('Solo se pueden adjuntar fotos o PDF.')
  try {
    const imagen = await createImageBitmap(archivo)
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height))
    const lienzo = document.createElement('canvas')
    lienzo.width = Math.round(imagen.width * escala)
    lienzo.height = Math.round(imagen.height * escala)
    lienzo.getContext('2d').drawImage(imagen, 0, 0, lienzo.width, lienzo.height)
    const blob = await new Promise((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.8))
    if (blob && blob.size < archivo.size) return { blob, tipo: 'image/jpeg', extension: 'jpg' }
  } catch {
    // El navegador no la puede abrir (por ejemplo, HEIC): va como vino.
  }
  const extension = (archivo.name.split('.').pop() || 'jpg').toLowerCase()
  return { blob: archivo, tipo: archivo.type, extension }
}
