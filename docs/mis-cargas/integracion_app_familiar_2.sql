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
