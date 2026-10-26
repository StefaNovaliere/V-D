import { crearDemo } from './demo.js'
import { crearSupabase } from './supabase.js'

const url = import.meta.env.VITE_SUPABASE_URL
const clave = import.meta.env.VITE_SUPABASE_ANON_KEY

// Sin las dos variables de entorno, la app arranca en modo demostración.
export const db = url && clave ? crearSupabase(url, clave) : crearDemo()
