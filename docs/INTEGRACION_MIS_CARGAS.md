# Integración con Mis Cargas (opción B)

Esta app trae de Mis Cargas **el ingreso limpio de cada camión por mes** (el
saldo del dueño) y lo guarda como movimientos de Camiones con origen
`mis_cargas`. Mis Cargas no se toca desde acá: lo que hay que agregarle está
en `docs/mis-cargas/`, listo para copiar en otra sesión.

```
App familiar (navegador)
   │  supabase.functions.invoke('sincronizar-mis-cargas', {desde, hasta})
   ▼
Edge Function sincronizar-mis-cargas   ← proyecto Supabase de ESTA app
   │  lee url + token de mis_cargas_conexion (service role; el navegador nunca ve el token)
   │  GET {url}?desde=aaaa-mm&hasta=aaaa-mm   Authorization: Bearer mc_…
   ▼
Edge Function ingreso-mensual          ← proyecto Supabase de MIS CARGAS
   │  hash del token → tokens_integracion → user_id
   │  saldo_mensual_por_patente(user_id, desde, hasta)
   ▼
{ meses: [ { mes, patentes: [ { patente, saldo_dueno, viajes, viajes_sin_saldo } ] } ] }
```

## Qué agregar en Mis Cargas

1. **SQL**: correr `docs/mis-cargas/integracion_app_familiar.sql` en el SQL
   Editor del proyecto de Mis Cargas. Crea `tokens_integracion`, las funciones
   para generar y revocar tokens, y `saldo_mensual_por_patente()`.
   Lo probé contra una copia mínima de las tablas `viajes`, `gastos` y
   `camiones`. Antes de correrlo, confirmá estas columnas, que son las que
   usa el store:
   - `viajes`: `user_id`, `camion_id`, `fecha`, `saldo_dueno`, `importe_bruto`,
     `importe_bruto_con_iva`, `comision_chofer_monto`, `comision_transporte_monto`;
   - `gastos`: `viaje_id`, `tipo`, `monto`;
   - `camiones`: `id`, `patente`.
2. **Edge Function**: copiar `docs/mis-cargas/functions/ingreso-mensual/index.ts`
   a `supabase/functions/ingreso-mensual/index.ts` y desplegarla con
   `supabase functions deploy ingreso-mensual --no-verify-jwt`.
3. **Pantalla en Configuración**: una sección "Token para la app familiar".
   - El botón "Generar token" llama a
     `supabase.rpc('generar_token_integracion', { p_nombre: 'App familiar' })`.
     La función devuelve el token y es la única vez que se puede ver, así que
     la pantalla lo muestra con un botón "Copiar" y la dirección del endpoint:
     `https://<proyecto-mis-cargas>.supabase.co/functions/v1/ingreso-mensual`.
   - Debajo, la lista de tokens (`select` sobre `tokens_integracion`: nombre,
     creado, último uso) con un botón "Revocar" que llama a
     `rpc('revocar_token_integracion', { p_id })`.

## Decisiones que conviene revisar con la clienta

- **El saldo del dueño incluye IVA.** Mis Cargas lo calcula sobre el importe
  con IVA. Si en la app familiar lo quieren sin IVA, hay que cambiar
  `saldo_mensual_por_patente()` en Mis Cargas; la app familiar no cambia.
- **Un mes en negativo** (el camión gastó más de lo que facturó) se carga como
  gasto de Camiones en la categoría "Resultado negativo (Mis Cargas)".
- **Mes del viaje**: se usa la fecha del viaje, igual que el resumen de Mis
  Cargas, y no la fecha en que lo liquidó el dador.
- **Viajes sin `saldo_dueno` guardado**: se calculan con la misma cuenta de
  respaldo que `calcularSaldoFinal()`. La respuesta trae `viajes_sin_saldo`
  por si quieren mostrar un aviso.

## Cuándo se sincroniza

- Sola, al abrir la app, si pasaron más de 3 horas: trae el mes actual y el
  anterior.
- A mano, con "Actualizar" en Camiones (últimos 3 meses) o en Ajustes
  (últimos 6 meses).
- Cada mes y patente es un único movimiento (`ref_externa` =
  `mis_cargas:2026-10:AE412KT`), así que sincronizar de nuevo actualiza en
  vez de duplicar. Si en Mis Cargas borran todos los viajes de un camión en
  un mes, la sincronización también lo borra acá.
