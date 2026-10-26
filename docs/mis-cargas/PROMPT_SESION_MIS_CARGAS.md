# Prompt para la sesión de Claude en el repositorio de Mis Cargas

Copiá todo lo que está debajo de la línea y pegalo como primer mensaje en la
sesión conectada a Mis Cargas.

---

Necesito agregarle a Mis Cargas un endpoint de solo lectura para que otra app
mía, "Cuentas de la familia" (otro repositorio y otro proyecto de Supabase),
pueda traer el **saldo del dueño por mes y por patente**. No cambies nada más
de Mis Cargas: ni el cálculo de los viajes, ni otras pantallas, ni el estilo.

## Qué hay que agregar

1. **SQL** en `supabase/integracion_app_familiar.sql` (re-ejecutable, como los
   otros SQL del repo). Va el contenido de abajo. Yo lo corro en el SQL
   Editor: vos no lo ejecutes contra ninguna base.
2. **Edge Function** en `supabase/functions/ingreso-mensual/index.ts`, con el
   código de abajo. Se despliega con `--no-verify-jwt` porque se autentica con
   un token propio, no con la sesión de Supabase (igual que `webhook-mp`).
3. **Una sección en Configuración** (`src/Pages/Configuracion.jsx`), con el
   mismo estilo que el resto de esa pantalla, titulada **"Token para la app
   familiar"**:
   - Una explicación corta: "Sirve para que la app Cuentas de la familia vea
     cuánto dejó cada camión por mes. Solo puede leer ese número; no ve ni
     cambia los viajes."
   - Botón **"Generar token"** →
     `supabase.rpc('generar_token_integracion', { p_nombre: 'App familiar' })`.
     El token que devuelve se muestra **una sola vez**, con botón "Copiar" y el
     aviso "Guardalo ahora: después no se puede volver a ver". Debajo, la
     dirección del endpoint, también con botón "Copiar":
     `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingreso-mensual`.
   - La lista de tokens del usuario
     (`supabase.from('tokens_integracion').select('id, nombre, created_at, ultimo_uso, revocado_at')`),
     con fecha de creación, último uso y un botón **"Revocar"** →
     `supabase.rpc('revocar_token_integracion', { p_id })`. Los revocados se
     ven tachados o en gris.
   - Las fechas de `created_at` y `ultimo_uso` son instantes (timestamptz), no
     fechas de calendario: mostralas en hora local, no con los helpers UTC de
     `src/Utils/fechas.js`, que son para las fechas de los viajes.

## Antes de escribir, verificá contra el código

El SQL supone estas columnas, sacadas de `src/Store/useStore.js`.
Confirmalas leyendo el código y los SQL del repo, y si alguna no coincide,
ajustá el SQL y avisame qué cambiaste:

- `viajes`: `id`, `user_id`, `camion_id`, `fecha`, `saldo_dueno`,
  `importe_bruto`, `importe_bruto_con_iva`, `comision_chofer_monto`,
  `comision_transporte_monto`;
- `gastos`: `viaje_id`, `tipo`, `monto` (el tipo "Kilos descontados" no le
  resta al dueño);
- `camiones`: `id`, `patente`.

La cuenta de `saldo_mensual_por_patente()` tiene que dar **lo mismo** que
`calcularTotalesMensuales(mes).saldoFinal` de `useStore.js`, separado por
patente. Ese número es el saldo guardado en el viaje y, si no hay, el cálculo
de respaldo de `calcularSaldoFinal()`. El mes se toma en UTC, igual que
`mesDeFecha()` en `src/Utils/fechas.js`. Si ves alguna diferencia con esa
lógica, decímela antes de cambiar nada. Agregá un comentario en
`calcularSaldoFinal()` que diga que esa cuenta está repetida en
`saldo_mensual_por_patente()`, para que si cambia una se cambie la otra.

`gen_random_bytes` y `digest` son de pgcrypto, que en Supabase está en el
esquema `extensions`. Por eso la función tiene
`SET search_path = public, extensions`.

## Cómo trabajar

- Commits chicos, con mensajes en castellano que expliquen el porqué.
- `npm run lint` y `npm run build` sin errores antes de terminar, y probá la
  pantalla de Configuración en el navegador, en celular y en computadora.
- No corras SQL contra Supabase ni despliegues nada: eso lo hago yo.
- Al terminar, decime qué columnas verificaste y qué tengo que correr y
  desplegar, en orden.

## SQL: `supabase/integracion_app_familiar.sql`

```sql
-- =============================================================================
-- PARA MIS CARGAS (no para esta app). Correr en el SQL Editor del proyecto de
-- Supabase de Mis Cargas. Re-ejecutable.
--
-- Agrega:
--  * tokens_integracion: tokens de solo lectura, uno por usuario y app. Se
--    guarda solo el hash (sha256); el token se muestra una vez al generarlo.
--  * generar_token_integracion() / revocar_token_integracion(): para la
--    pantalla de Configuración.
--  * saldo_mensual_por_patente(): el saldo del dueño por mes y patente, con
--    la misma cuenta que calcularTotalesMensuales() en src/Store/useStore.js.
--    Si una cambia, cambiar la otra.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tokens_integracion (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre      text NOT NULL DEFAULT 'App familiar',
  token_hash  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  ultimo_uso  timestamptz,
  revocado_at timestamptz
);

ALTER TABLE public.tokens_integracion ENABLE ROW LEVEL SECURITY;

-- Cada uno ve sus tokens (nunca el token en sí, solo el hash). Crearlos y
-- revocarlos se hace con las funciones de abajo.
DROP POLICY IF EXISTS "cada uno ve sus tokens" ON public.tokens_integracion;
CREATE POLICY "cada uno ve sus tokens" ON public.tokens_integracion
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.generar_token_integracion(p_nombre text DEFAULT 'App familiar')
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token text := 'mc_' || encode(gen_random_bytes(32), 'hex');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Hay que estar logueado';
  END IF;
  INSERT INTO tokens_integracion (user_id, nombre, token_hash)
  VALUES (auth.uid(), coalesce(nullif(trim(p_nombre), ''), 'App familiar'),
          encode(digest(v_token, 'sha256'), 'hex'));
  RETURN v_token;  -- única vez que se ve
END;
$$;

CREATE OR REPLACE FUNCTION public.revocar_token_integracion(p_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE tokens_integracion SET revocado_at = now()
   WHERE id = p_id AND user_id = auth.uid() AND revocado_at IS NULL
$$;

-- El mes se toma en UTC porque así guarda y agrupa Mis Cargas las fechas de
-- los viajes (ver src/Utils/fechas.js: mesDeFecha). En hora argentina, un
-- viaje del día 1 caería en el mes anterior. El ::timestamptz sirve tanto si
-- viajes.fecha es timestamptz como si es date o texto ISO.
CREATE OR REPLACE FUNCTION public.saldo_mensual_por_patente(p_user uuid, p_desde text, p_hasta text)
RETURNS TABLE (mes text, patente text, saldo_dueno numeric, viajes int, viajes_sin_saldo int)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
SET TimeZone = 'UTC'
AS $$
  WITH por_viaje AS (
    SELECT
      to_char(v.fecha::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM') AS mes,
      coalesce(c.patente, 'Sin patente') AS patente,
      v.saldo_dueno IS NULL AS sin_saldo,
      -- Igual que calcularSaldoFinal(): el saldo guardado, y si no hay, la
      -- cuenta. "Kilos descontados" no resta al dueño (se le cobra al chofer).
      coalesce(
        v.saldo_dueno,
        coalesce(nullif(v.importe_bruto_con_iva, 0), v.importe_bruto * 1.21, 0)
          - coalesce(v.comision_chofer_monto, 0)
          - coalesce(v.comision_transporte_monto, 0)
          - coalesce((SELECT sum(g.monto) FROM gastos g
                       WHERE g.viaje_id = v.id AND g.tipo IS DISTINCT FROM 'Kilos descontados'), 0)
      ) AS saldo
    FROM viajes v
    LEFT JOIN camiones c ON c.id = v.camion_id
    WHERE v.user_id = p_user
  )
  SELECT mes, patente, round(sum(saldo), 2), count(*)::int, count(*) FILTER (WHERE sin_saldo)::int
    FROM por_viaje
   WHERE mes BETWEEN p_desde AND p_hasta
   GROUP BY mes, patente
   ORDER BY mes, patente
$$;

-- Solo la Edge Function (service role) consulta saldos de cualquier usuario.
REVOKE EXECUTE ON FUNCTION public.saldo_mensual_por_patente(uuid, text, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.generar_token_integracion(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.revocar_token_integracion(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.saldo_mensual_por_patente(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.generar_token_integracion(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revocar_token_integracion(uuid) TO authenticated;
```

## Edge Function: `supabase/functions/ingreso-mensual/index.ts`

```ts
// PARA MIS CARGAS: copiar a supabase/functions/ingreso-mensual/index.ts de
// ese repositorio.
//
// Endpoint de solo lectura para la app "Cuentas de la familia". Devuelve,
// por mes y por patente, el saldo del dueño. Se autentica con un token de
// integración (tabla tokens_integracion), no con la sesión de Supabase.
//
//   GET ?desde=2026-08&hasta=2026-10
//   Authorization: Bearer mc_xxxxxxxx
//
//   200 { "meses": [ { "mes": "2026-10", "patentes": [
//           { "patente": "AE 412 KT", "saldo_dueno": 1120000, "viajes": 9, "viajes_sin_saldo": 0 } ] } ] }
//
// Deploy SIN verificación de JWT (el token es propio):
//   supabase functions deploy ingreso-mensual --no-verify-jwt
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen configurados.

import { createClient } from "npm:@supabase/supabase-js@2";

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function sha256(texto: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return responder({ error: "Solo GET" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return responder({ error: "Falta el token" }, 401);

  const url = new URL(req.url);
  const desde = url.searchParams.get("desde") ?? "";
  const hasta = url.searchParams.get("hasta") ?? "";
  if (!MES.test(desde) || !MES.test(hasta) || desde > hasta) {
    return responder({ error: "desde y hasta tienen que ser aaaa-mm" }, 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: fila } = await admin
    .from("tokens_integracion")
    .select("id, user_id")
    .eq("token_hash", await sha256(token))
    .is("revocado_at", null)
    .maybeSingle();
  // Misma respuesta para token inexistente o revocado: no dar pistas.
  if (!fila) return responder({ error: "Token inválido" }, 401);

  await admin.from("tokens_integracion").update({ ultimo_uso: new Date().toISOString() }).eq("id", fila.id);

  const { data, error } = await admin.rpc("saldo_mensual_por_patente", {
    p_user: fila.user_id, p_desde: desde, p_hasta: hasta,
  });
  if (error) return responder({ error: "No se pudo calcular" }, 500);

  const porMes = new Map<string, unknown[]>();
  for (const r of data ?? []) {
    if (!porMes.has(r.mes)) porMes.set(r.mes, []);
    porMes.get(r.mes)!.push({
      patente: r.patente,
      saldo_dueno: Number(r.saldo_dueno),
      viajes: r.viajes,
      viajes_sin_saldo: r.viajes_sin_saldo,
    });
  }
  return responder({ meses: [...porMes].map(([mes, patentes]) => ({ mes, patentes })) });
});
```

## Contrato del endpoint (no lo cambies sin avisarme: la otra app depende de esto)

```
GET {SUPABASE_URL}/functions/v1/ingreso-mensual?desde=2026-08&hasta=2026-10
Authorization: Bearer mc_xxxxxxxx

200 { "meses": [ { "mes": "2026-10", "patentes": [
       { "patente": "AE 412 KT", "saldo_dueno": 1120000, "viajes": 9, "viajes_sin_saldo": 0 } ] } ] }
401 token faltante, inválido o revocado
400 desde/hasta que no son aaaa-mm
```
