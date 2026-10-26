-- =============================================================================
-- 04 · Integración con Mis Cargas
-- La app no habla directo con Mis Cargas: lo hace la Edge Function
-- `sincronizar-mis-cargas` (supabase/functions), que lee el token desde acá
-- con la service role. Por eso mis_cargas_conexion tiene RLS activado y
-- ninguna política: desde el navegador no se puede leer el token, solo
-- guardarlo con guardar_conexion_mis_cargas().
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.mis_cargas_conexion (
  household_id uuid PRIMARY KEY REFERENCES public.households(id) ON DELETE CASCADE,
  url          text NOT NULL,
  token        text NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mis_cargas_conexion ENABLE ROW LEVEL SECURITY;
-- (sin políticas a propósito)

CREATE TABLE IF NOT EXISTS public.mis_cargas_sync (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  desde        text NOT NULL,   -- 'aaaa-mm'
  hasta        text NOT NULL,
  ok           boolean NOT NULL,
  detalle      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mis_cargas_sync_hogar ON public.mis_cargas_sync (household_id, created_at DESC);

ALTER TABLE public.mis_cargas_sync ENABLE ROW LEVEL SECURITY;

-- Los miembros pueden ver el historial; solo la Edge Function lo escribe.
DROP POLICY IF EXISTS "miembros ven las sincronizaciones" ON public.mis_cargas_sync;
CREATE POLICY "miembros ven las sincronizaciones" ON public.mis_cargas_sync
  FOR SELECT TO authenticated
  USING (public.es_miembro(household_id));

-- Guardar (o borrar, con token vacío) la conexión del propio hogar.
CREATE OR REPLACE FUNCTION public.guardar_conexion_mis_cargas(p_url text, p_token text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hogar uuid := public.mi_hogar();
BEGIN
  IF v_hogar IS NULL THEN
    RAISE EXCEPTION 'No pertenecés a ningún hogar';
  END IF;

  IF coalesce(trim(p_token), '') = '' THEN
    DELETE FROM mis_cargas_conexion WHERE household_id = v_hogar;
    RETURN;
  END IF;

  IF p_url !~ '^https://' THEN
    RAISE EXCEPTION 'La dirección de Mis Cargas tiene que empezar con https://';
  END IF;

  INSERT INTO mis_cargas_conexion (household_id, url, token, updated_at)
  VALUES (v_hogar, trim(p_url), trim(p_token), now())
  ON CONFLICT (household_id) DO UPDATE
    SET url = EXCLUDED.url, token = EXCLUDED.token, updated_at = now();
END;
$$;

-- Lo que la app sí puede saber: si hay conexión, a dónde, y cómo fue la última
-- sincronización. Nunca el token.
CREATE OR REPLACE FUNCTION public.estado_mis_cargas()
RETURNS TABLE (conectado boolean, url text, ultima_sync timestamptz, ultima_ok boolean, ultimo_detalle text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.household_id IS NOT NULL,
    c.url,
    s.created_at,
    s.ok,
    s.detalle
  FROM (SELECT public.mi_hogar() AS h) yo
  LEFT JOIN mis_cargas_conexion c ON c.household_id = yo.h
  LEFT JOIN LATERAL (
    SELECT created_at, ok, detalle FROM mis_cargas_sync
     WHERE household_id = yo.h
     ORDER BY created_at DESC LIMIT 1
  ) s ON true
  WHERE yo.h IS NOT NULL
$$;

REVOKE EXECUTE ON FUNCTION public.guardar_conexion_mis_cargas(text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.estado_mis_cargas() FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.guardar_conexion_mis_cargas(text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.estado_mis_cargas() TO authenticated;
