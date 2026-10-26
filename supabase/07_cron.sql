-- =============================================================================
-- 07 · Tareas diarias (pg_cron). Se corre después de 06 y de desplegar la Edge
-- Function `recordatorios-diarios`. Re-ejecutable.
--
-- Antes de correrlo, reemplazá los dos valores marcados con CAMBIAR:
--   * la URL del proyecto (Settings → Data API)
--   * el secreto: el mismo valor que cargues como CRON_SECRET en
--     Edge Functions → Secrets. Inventalo largo, por ejemplo con un generador
--     de contraseñas.
--
-- Horarios en UTC (Argentina es UTC−3):
--   09:05 UTC = 06:05 en Argentina → cargar los gastos fijos automáticos
--   12:00 UTC = 09:00 en Argentina → avisos al celular
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job
   WHERE jobname IN ('cargar-fijos-vencidos', 'recordatorios-diarios');
END;
$$;

-- No depende de nada externo: aunque los avisos no estén configurados, los
-- gastos fijos automáticos se cargan igual.
SELECT cron.schedule(
  'cargar-fijos-vencidos',
  '5 9 * * *',
  $$ SELECT public.cargar_fijos_vencidos_todos() $$
);

SELECT cron.schedule(
  'recordatorios-diarios',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://CAMBIAR.supabase.co/functions/v1/recordatorios-diarios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'CAMBIAR-POR-EL-SECRETO'
    ),
    body    := '{}'::jsonb
  )
  $$
);

-- Para ver que quedaron: SELECT jobname, schedule FROM cron.job;
-- Para ver cómo corrieron: SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
