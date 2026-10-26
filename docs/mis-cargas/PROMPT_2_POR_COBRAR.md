# Prompt para la sesión de Mis Cargas · parte 2: lo que deben los dadores

Copiá todo lo que está debajo de la línea y pegalo en la sesión conectada a
Mis Cargas.

---

La app "Cuentas de la familia" ya consume el endpoint `ingreso-mensual` que
agregamos (saldo del dueño por mes y patente). Ahora necesito que el mismo
endpoint también devuelva **lo que los dadores de carga todavía deben**: los
viajes con `liquidado_dador` en false, agrupados por dador. No cambies nada
más de Mis Cargas.

## 1. SQL nuevo: `supabase/integracion_app_familiar_2.sql`

Con este contenido. Yo lo corro en el SQL Editor: vos no lo ejecutes.

```sql
-- =============================================================================
-- INTEGRACIÓN CON LA APP "CUENTAS DE LA FAMILIA" · parte 2: lo que deben los
-- dadores. Correr en el SQL Editor del Supabase de Mis Cargas, después de
-- integracion_app_familiar.sql. Re-ejecutable.
--
-- Mismo criterio que el "Por cobrar" del resumen mensual
-- (src/components/Viajes/ResumenMensual.jsx): viajes con liquidado_dador en
-- false, sumando importe_bruto_con_iva. Acá de todos los meses, agrupado por
-- dador (transporte_nombre). Si una cambia, cambiar la otra.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.por_cobrar_por_dador(p_user uuid)
RETURNS TABLE (dador text, monto numeric, viajes int)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(nullif(trim(v.transporte_nombre), ''), 'Sin dador') AS dador,
         round(sum(coalesce(v.importe_bruto_con_iva, 0)), 2) AS monto,
         count(*)::int AS viajes
    FROM viajes v
   WHERE v.user_id = p_user
     AND NOT coalesce(v.liquidado_dador, false)
   GROUP BY 1
  HAVING sum(coalesce(v.importe_bruto_con_iva, 0)) > 0
   ORDER BY 2 DESC
$$;

-- Solo la Edge Function (service role).
REVOKE EXECUTE ON FUNCTION public.por_cobrar_por_dador(uuid) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.por_cobrar_por_dador(uuid) TO service_role;
```

Antes de dejarlo, verificá contra el código que el criterio sea el mismo que
el "Por cobrar" de `src/components/Viajes/ResumenMensual.jsx`: viajes con
`liquidado_dador` en false, sumando `importe_bruto_con_iva`, y el dador en
`transporte_nombre`. Si en el código el monto o el nombre del dador salen de
otro lado, ajustá el SQL y avisame qué cambiaste.

## 2. `supabase/functions/ingreso-mensual/index.ts`

Al final, después de armar `porMes`, agregá la consulta y sumá `por_cobrar` a
la respuesta. Si la función SQL todavía no existe (porque no corrí el SQL),
el endpoint tiene que seguir respondiendo como hoy, sin `por_cobrar`:

```ts
  // Lo que los dadores todavía deben (viajes sin liquidar, de cualquier mes).
  // Si el SQL de esta parte todavía no se corrió, se responde sin este dato:
  // la otra app lo tolera.
  const { data: deudas, error: errorDeudas } = await admin.rpc("por_cobrar_por_dador", { p_user: fila.user_id });
  if (errorDeudas) console.error("ingreso-mensual por_cobrar:", errorDeudas);

  return responder({
    meses: [...porMes].map(([mes, patentes]) => ({ mes, patentes })),
    ...(errorDeudas ? {} : {
      por_cobrar: (deudas ?? []).map((d: { dador: string; monto: number; viajes: number }) => ({
        dador: d.dador, monto: Number(d.monto), viajes: d.viajes,
      })),
    }),
  });
```

(reemplaza al `return responder({ meses: ... })` actual). Actualizá también
el comentario de arriba que documenta el formato de la respuesta, agregando:

```
//   (también trae "por_cobrar": [ { "dador": "Cargill", "monto": 1450000, "viajes": 3 } ],
//    lo que los dadores todavía no liquidaron, sin importar el mes)
```

Nada más cambia: el resto del formato de la respuesta queda igual.

## Cómo trabajar

- Commits chicos con mensajes en castellano que expliquen el porqué.
- `npm run lint` y `npm run build` sin errores.
- No corras SQL ni despliegues nada: al terminar, decime qué tengo que correr
  y desplegar, en orden (el SQL y redesplegar `ingreso-mensual` sin
  verificación de JWT, como la vez anterior).
