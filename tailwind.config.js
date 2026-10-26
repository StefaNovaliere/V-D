/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Barlow', 'system-ui', 'sans-serif'],
      },
      colors: {
        fondo: '#f4f5f7',
        borde: '#e3e6ea',
        tinta: '#1d2733',
        suave: '#6b7480',
        acento: { DEFAULT: '#1f4e79', oscuro: '#173b5c', claro: '#e7eef5' },
        positivo: '#2e6b45',
        negativo: '#a63d32',
        casa: { DEFAULT: '#5a6b85', claro: '#eceff3' },
        estudio: { DEFAULT: '#7a5577', claro: '#f3ecf2' },
        camiones: { DEFAULT: '#a86a2c', claro: '#f6efe6' },
      },
    },
  },
  plugins: [],
}
