// Las tres áreas son fijas. El orden es el del boceto aprobado.
export const AREAS = ['estudio', 'camiones', 'casa']

// Clases completas (Tailwind no ve clases armadas con template strings).
export const AREA = {
  casa: {
    nombre: 'Casa',
    punto: 'bg-casa',
    texto: 'text-casa',
    fondo: 'bg-casa-claro',
    color: '#5a6b85',
  },
  estudio: {
    nombre: 'Estudio',
    punto: 'bg-estudio',
    texto: 'text-estudio',
    fondo: 'bg-estudio-claro',
    color: '#7a5577',
  },
  camiones: {
    nombre: 'Camiones',
    punto: 'bg-camiones',
    texto: 'text-camiones',
    fondo: 'bg-camiones-claro',
    color: '#a86a2c',
  },
}

export const ORIGEN = {
  manual: 'Cargado a mano',
  fijo: 'Gasto fijo',
  mis_cargas: 'Desde Mis Cargas',
}

export const FRECUENCIAS = [
  { valor: 'mensual', nombre: 'Todos los meses', meses: 1 },
  { valor: 'bimestral', nombre: 'Cada 2 meses', meses: 2 },
  { valor: 'trimestral', nombre: 'Cada 3 meses', meses: 3 },
  { valor: 'cuatrimestral', nombre: 'Cada 4 meses', meses: 4 },
  { valor: 'semestral', nombre: 'Cada 6 meses', meses: 6 },
  { valor: 'anual', nombre: 'Una vez por año', meses: 12 },
]

export function mesesDeFrecuencia(valor) {
  return FRECUENCIAS.find((f) => f.valor === valor)?.meses ?? 1
}

// Atajos del calendario impositivo (regalo 4). Solo completan nombre, área y
// categoría: la fecha y el monto los carga la familia, porque cambian.
export const ATAJOS_IMPOSITIVOS = [
  { concepto: 'Monotributo', area: 'estudio', clave: 'monotributo' },
  { concepto: 'Ingresos Brutos', area: 'camiones', clave: 'iibb' },
  { concepto: 'Aportes casas particulares', area: 'casa', clave: 'aportes_cp' },
  { concepto: 'Seguro de los camiones', area: 'camiones', clave: 'seguro' },
]
