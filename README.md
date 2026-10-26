# Cuentas de la familia

La plata de la casa, del estudio y de los camiones en un solo lugar: cuánto
entró, cuánto salió y cuánto les quedó cada mes, y de qué área vino cada peso.

React 19 + Vite, Tailwind 3, Zustand, React Router 7, Supabase y PWA: el
mismo stack que Mis Cargas.

## Correrla

```bash
npm install
cp .env.example .env.local   # completar, o dejar vacío para el modo demostración
npm run dev
```

| Script | Para qué |
|---|---|
| `npm run dev` | servidor de desarrollo |
| `npm run build` | build de producción en `dist/` |
| `npm run lint` | ESLint |
| `npm test` | tests de cálculos, fechas y formato de plata (`node --test`) |

### Variables de entorno

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto de Supabase **de esta app** (no el de Mis Cargas) |
| `VITE_SUPABASE_ANON_KEY` | anon (o publishable) key de ese proyecto |
| `VITE_VAPID_PUBLIC_KEY` | clave pública para los avisos al celular (opcional; ver `docs/PUESTA_EN_MARCHA.md`) |

**Modo demostración**: si faltan las dos variables, la app arranca sin login
y con los datos del boceto aprobado, guardados solo en el navegador. Sirve
para probarla o mostrársela a la clienta. Ajustes → "Volver a los datos de
ejemplo" la deja como al principio.

## Base de datos

La lista completa de pasos manuales, en orden, está en
[`docs/PUESTA_EN_MARCHA.md`](docs/PUESTA_EN_MARCHA.md). Desactivá "Allow new users to
sign up" en Authentication: las cuentas se crean a mano.

Los SQL están en `supabase/` y se corren **en orden** en el SQL Editor. Todos
se pueden volver a correr sin romper nada.

1. `01_esquema.sql`: tablas (hogar, miembros, categorías, personas, gastos
   fijos, movimientos, configuración).
2. `02_rls.sql`: políticas: solo los miembros de un hogar leen y escriben sus
   datos.
3. `03_datos_iniciales.sql`: categorías y conceptos deducibles de cada hogar.
   Se cargan solos al crear un hogar.
4. `04_mis_cargas.sql`: conexión con Mis Cargas (el token no se puede leer
   desde la app) e historial de sincronizaciones.
5. `05_crear_hogar.sql`: **una sola vez**, después de crear las dos cuentas
   en Authentication → Users → Add user (con "Auto Confirm User"). Antes de
   correrlo, cambiá los emails y los nombres.

6. `06_mejoras.sql`: gastos fijos automáticos, plata por cobrar,
   comprobantes (tabla y bucket de Storage) y avisos.
7. `07_cron.sql`: las dos tareas diarias (cargar los gastos fijos automáticos
   y mandar los avisos). Antes hay que reemplazar los `CAMBIAR`.

Para comprobar las políticas: `supabase/tests/rls_test.sql` y
`supabase/tests/mejoras_test.sql` (este muestra `MEJORAS OK`). Arma dos
hogares de prueba, verifica que ninguno ve ni toca lo del otro y termina en
`ROLLBACK`, así que no deja nada guardado. Si sale bien, muestra `RLS OK`.
(`tests/stub_local.sql` es solo para probar en un Postgres fuera de Supabase.)

Reglas que se respetan en todo el esquema:

- La plata va en `numeric(14,2)`.
- Las fechas de calendario van en `date`, sin `DEFAULT current_date`: el
  servidor está en UTC y a la noche de Argentina ya sería mañana.
- En el front, las fechas viajan como texto `aaaa-mm-dd` y nunca pasan por
  `new Date('aaaa-mm-dd')`. Ese fue el bug de los días corridos en Mis Cargas.
  Ver `src/lib/fechas.js`.

## Integración con Mis Cargas

La explicación completa está en [`docs/INTEGRACION_MIS_CARGAS.md`](docs/INTEGRACION_MIS_CARGAS.md).

- En **este** proyecto de Supabase:
  `supabase functions deploy sincronizar-mis-cargas`.
- En **Mis Cargas** hay que agregar lo que está en `docs/mis-cargas/`: un SQL,
  la Edge Function `ingreso-mensual` y una sección en Configuración para
  generar el token.
- Después, en esta app: Ajustes → Mis Cargas → pegar la dirección del
  endpoint y el token.

## Edge Functions

| Función | Proyecto | JWT | Para qué |
|---|---|---|---|
| `sincronizar-mis-cargas` | este | verificado | trae el ingreso por patente y lo que deben los dadores |
| `recordatorios-diarios` | este | **sin** verificar (secreto `CRON_SECRET`) | carga los gastos fijos automáticos y manda los avisos |
| `ingreso-mensual` | Mis Cargas | **sin** verificar (token propio) | lo que consulta la sincronización |

Secrets de `recordatorios-diarios`: `CRON_SECRET`, `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

## Deploy en Vercel

- Framework: Vite. Build: `npm run build`. Salida: `dist`.
- Cargar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Environment
  Variables.
- `vercel.json` manda todas las rutas a `index.html` para que funcionen los
  links directos (`/vencimientos`, `/area/camiones`).
- `vercel.json` también reenvía `/api/ipc` a la API de series del INDEC
  (datos.gob.ar), para la comparación con inflación.
- La PWA se actualiza sola (`registerType: 'autoUpdate'`). Los avisos se
  suman al service worker con `public/sw-push.js`.

## Qué hay

**Etapa 1**
- Resumen de la familia del mes: les quedó / entró / salió, la parte de cada
  área, comparación con el mes anterior, una tarjeta por área con su
  desglose, últimos movimientos y próximos vencimientos.
- Áreas Casa, Estudio y Camiones, cada una con su saldo, desglose, gastos
  fijos y movimientos. Camiones muestra el ingreso limpio de Mis Cargas por
  patente.
- Cargar, editar y borrar gastos e ingresos: área, monto, categoría, fecha,
  nota, quién lo cargó y "repetir todos los meses".
- Sueldos (secretaria y niñera): pago mensual, aguinaldo sugerido e
  historial por persona.
- Gastos fijos con vencimiento (seguro, contador, IIBB, RTO…). Pagar uno carga
  el gasto y pasa la fecha al período siguiente.
- Hogar con dos usuarios que ven y cargan lo mismo. Login con email y
  contraseña.
- Pensada para el celular e instalable como PWA.

**Regalos**
1. Carpeta para el contador: Excel del mes con un resumen y una hoja por
   área, y las fotos de los comprobantes si las hay (en un ZIP).
2. Deducibles de Ganancias: conceptos configurables y resumen anual por
   concepto, con la aclaración de que lo confirma el contador.
3. Control del tope del monotributo: facturado en 12 meses contra el tope
   cargado a mano, con aviso en el resumen.
4. Calendario de vencimientos impositivos: en Vencimientos, el filtro
   "Impositivos", con fechas que carga la familia.

**Mejoras (segunda tanda)**
- Gastos fijos que se cargan solos el día que vencen (sueldos, seguro…), con
  el aviso "Se cargaron solos" para revisar el monto. No se pueden pagar dos
  veces: la base guarda qué vencimiento cubre cada pago.
- Avisos al celular a la mañana: lo que vence en los próximos días y lo que
  se cargó solo.
- Fotos o PDF de comprobantes en cada movimiento (se achican antes de subir);
  la carpeta para el contador baja un ZIP con el Excel y las fotos.
- Resumen anual: cuánto quedó cada mes, en qué se fue la plata y la tabla mes
  por mes, con la opción de verlo en pesos de hoy.
- Comparación con el mes anterior descontando la inflación (IPC del INDEC).
- Proyección de fin de mes: lo que falta vencer y lo que les quedaría.
- Plata por cobrar: honorarios pendientes del estudio (al cobrarlos se cargan
  como ingreso) y lo que deben los dadores, desde Mis Cargas.
- Carga rápida: repetir uno reciente, categorías ordenadas por uso y el último
  monto sugerido.

**Interpretaciones del alcance**
- **"Repetir todos los meses"** deja un vencimiento mensual; con "Que se
  cargue solo" activado, además se carga solo cada mes.
- **El chip "+ Nueva" del boceto** no está, porque las categorías editables
  son un opcional.
- **La pantalla de Movimientos** lista los movimientos del mes sin filtros,
  que también son un opcional.
- **Editar y borrar** están incluidos: sin eso no hay forma de corregir un
  error de carga.
- **Recuperar la contraseña** no está; por ahora se cambia desde el panel de
  Supabase.
