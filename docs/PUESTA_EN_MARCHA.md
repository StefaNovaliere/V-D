# Puesta en marcha: lo que hay que hacer a mano

## 1. Decidir con la clienta (antes de tocar Mis Cargas)

- [ ] ¿El ingreso limpio de los camiones va **con o sin IVA**? Hoy se trae el
      saldo del dueño de Mis Cargas, que lo incluye.
- [ ] Un mes en que un camión dio negativo, ¿se carga como gasto? Así está
      hecho.
- [ ] Repasar las interpretaciones del alcance del README: "repetir",
      "+ Nueva", filtros, editar y borrar, recuperar contraseña.

## 2. Supabase de esta app (proyecto nuevo, separado del de Mis Cargas)

- [ ] Crear el proyecto (región São Paulo, la más cercana).
- [ ] Authentication → Sign In / Providers → **desactivar "Allow new users to
      sign up"**. Las cuentas las creás vos; así nadie se registra solo.
- [ ] Authentication → Users → Add user (con "Auto Confirm User"), una para
      cada uno.
- [ ] SQL Editor: correr `supabase/01_esquema.sql`, `02_rls.sql`,
      `03_datos_iniciales.sql` y `04_mis_cargas.sql`, en ese orden.
- [ ] Editar los dos emails y los nombres en `05_crear_hogar.sql` y correrlo.
- [ ] Correr `supabase/tests/rls_test.sql`: tiene que mostrar `RLS OK`.
- [ ] Desplegar la Edge Function, con la CLI de Supabase:
      ```bash
      supabase login
      supabase link --project-ref <ref-del-proyecto-nuevo>
      supabase functions deploy sincronizar-mis-cargas
      ```
- [ ] Copiar la Project URL y la anon key (Settings → API).

## 3. Vercel

- [ ] Mergear la rama `claude/loving-wozniak-6jwo1o` a `main`.
- [ ] Importar el repo `V-D` en Vercel (framework Vite).
- [ ] Environment Variables: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
- [ ] Deploy. Entrar con las dos cuentas desde el celular y la computadora.

## 4. Mis Cargas

- [ ] Pasarle `docs/mis-cargas/PROMPT_SESION_MIS_CARGAS.md` a la sesión del
      repositorio de Mis Cargas y revisar lo que haga.
- [ ] En el Supabase **de Mis Cargas**: correr
      `supabase/integracion_app_familiar.sql`.
- [ ] Desplegar el endpoint: `supabase functions deploy ingreso-mensual --no-verify-jwt`
      (con la CLI linkeada al proyecto de Mis Cargas).
- [ ] Desplegar Mis Cargas (Vercel) para que aparezca la sección nueva en
      Configuración.

## 5. Conectar las dos apps

- [ ] En Mis Cargas, **con la cuenta que tiene los camiones**: Configuración →
      "Token para la app familiar" → Generar token. Copiar el token y la
      dirección del endpoint.
- [ ] En Cuentas de la familia: Ajustes → Mis Cargas → pegar la dirección y el
      token → Conectar. La app trae los últimos 6 meses.
- [ ] Comparar Camiones → Ingreso limpio con el resumen mensual de Mis Cargas:
      tienen que dar lo mismo, patente por patente.

## 6. Entrega a la familia

- [ ] Pasarles el link y sus contraseñas.
- [ ] Instalarla en los dos celulares: en Android, Chrome → "Agregar a la
      pantalla principal"; en iPhone, Safari → Compartir → "Agregar a
      inicio".
- [ ] Cargar juntos las personas con sueldo, los gastos fijos con sus
      vencimientos y, si corresponde, la categoría y el tope del monotributo.

---

# Mejoras (segunda tanda)

Gastos fijos automáticos, avisos al celular, comprobantes, resumen anual,
inflación, proyección de fin de mes, plata por cobrar y carga rápida. Lo que
hay que hacer a mano, en orden:

## A. Supabase de esta app

- [ ] SQL Editor: correr `supabase/06_mejoras.sql`. Crea el bucket
      `comprobantes` de Storage con sus permisos.
- [ ] Opcional: correr `supabase/tests/mejoras_test.sql`; tiene que mostrar
      `MEJORAS OK`.
- [ ] Redesplegar `sincronizar-mis-cargas` (cambió: ahora también trae lo que
      deben los dadores). En el editor: abrir la función, pegar el código
      nuevo de `supabase/functions/sincronizar-mis-cargas/index.ts`, Deploy.

## B. Avisos al celular

- [ ] Generar las claves, en cualquier compu con Node:
      `npx web-push generate-vapid-keys`. Da una Public Key y una Private Key.
- [ ] Inventar un secreto largo para el cron (por ejemplo, con un generador de
      contraseñas).
- [ ] Edge Functions → Secrets, cargar:
      `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
      `VAPID_SUBJECT` (`mailto:` + tu email) y `CRON_SECRET` (el secreto).
- [ ] Crear la función `recordatorios-diarios` (Via Editor) con el código de
      `supabase/functions/recordatorios-diarios/index.ts` y **desactivar**
      "Enforce JWT verification" (la protege el secreto del cron).
- [ ] Vercel → Environment Variables: `VITE_VAPID_PUBLIC_KEY` = la Public Key
      (la misma de arriba). Redeploy.
- [ ] En `supabase/07_cron.sql` reemplazar los dos `CAMBIAR` (URL del proyecto
      y el secreto) y correrlo en el SQL Editor. Comprobar con
      `SELECT jobname, schedule FROM cron.job;` que hay dos tareas.
- [ ] En cada celular: Ajustes → "Avisos al celular" → activar. En iPhone,
      primero instalar la app en la pantalla de inicio y abrirla desde el ícono.

## C. Mis Cargas (lo que deben los dadores)

- [ ] Pasarle `docs/mis-cargas/PROMPT_2_POR_COBRAR.md` a la sesión de Mis
      Cargas y revisar lo que haga.
- [ ] En el Supabase de Mis Cargas: correr `supabase/integracion_app_familiar_2.sql`.
- [ ] Redesplegar `ingreso-mensual` (sigue **sin** verificación de JWT).
- [ ] En la app familiar: Camiones → Actualizar. En "Por cobrar" aparece lo que
      deben los dadores.

## D. Nada que configurar

Resumen anual, proyección de fin de mes, carga rápida y plata por cobrar del
estudio andan solos. La comparación con inflación usa el IPC del INDEC a
través de `/api/ipc` (está en `vercel.json`); si la API no responde, esa línea
simplemente no aparece.
