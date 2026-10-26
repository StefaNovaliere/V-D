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
