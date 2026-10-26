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
