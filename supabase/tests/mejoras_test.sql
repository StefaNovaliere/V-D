-- =============================================================================
-- Prueba de 06_mejoras.sql. Igual que rls_test.sql: corre en el SQL Editor,
-- termina en ROLLBACK y si sale bien muestra "MEJORAS OK".
-- =============================================================================
BEGIN;

CREATE FUNCTION pg_temp.comprobar(ok boolean, que text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FALLÓ: %', que; END IF; END; $$;

CREATE FUNCTION pg_temp.ser(usuario uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', usuario, 'role', 'authenticated')::text, true);
  SELECT set_config('request.jwt.claim.sub', usuario::text, true);
$$;

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'mejoras-a@test'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'mejoras-b@test');
INSERT INTO public.households (id, nombre) VALUES
  ('aaaaaaaa-1111-0000-0000-00000000000a', 'A'), ('bbbbbbbb-1111-0000-0000-00000000000b', 'B');
INSERT INTO public.household_members VALUES
  ('aaaaaaaa-1111-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 'A', now()),
  ('bbbbbbbb-1111-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000b', 'B', now());

-- Un gasto fijo automático que venció hace 2 meses y medio: tiene que cargar
-- 3 períodos y dejar el próximo en el futuro.
INSERT INTO public.gastos_fijos (id, household_id, area, categoria_id, concepto, monto, frecuencia, proximo_vencimiento, automatico)
SELECT 'aaaaaaaa-5555-0000-0000-00000000000a', household_id, 'camiones', id, 'Seguro', 540000, 'mensual',
       public.hoy_argentina() - interval '2 months' - interval '10 days', true
  FROM public.categorias WHERE household_id = 'aaaaaaaa-1111-0000-0000-00000000000a' AND area = 'camiones' AND clave = 'seguro';
-- Uno NO automático vencido: no se toca.
INSERT INTO public.gastos_fijos (household_id, area, categoria_id, concepto, monto, proximo_vencimiento)
SELECT household_id, 'camiones', id, 'Contador', 180000, public.hoy_argentina() - 5
  FROM public.categorias WHERE household_id = 'aaaaaaaa-1111-0000-0000-00000000000a' AND area = 'camiones' AND clave = 'contador';

SELECT pg_temp.comprobar(public.siguiente_vencimiento('2026-01-31', 'mensual') = '2026-02-28', 'siguiente vencimiento con mes corto');
SELECT pg_temp.comprobar(public.siguiente_vencimiento('2026-11-05', 'anual') = '2027-11-05', 'siguiente vencimiento anual');

SET LOCAL ROLE authenticated;
SELECT pg_temp.ser('bbbbbbbb-0000-0000-0000-00000000000b');
SELECT pg_temp.comprobar(public.cargar_fijos_vencidos() = 0, 'B no carga los gastos fijos de A');

SELECT pg_temp.ser('aaaaaaaa-0000-0000-0000-00000000000a');
SELECT pg_temp.comprobar(public.cargar_fijos_vencidos() = 3, 'A carga los 3 períodos vencidos');
SELECT pg_temp.comprobar(public.cargar_fijos_vencidos() = 0, 'volver a correrlo no duplica');
SELECT pg_temp.comprobar(
  (SELECT count(*) = 3 AND bool_and(origen = 'fijo' AND creado_por IS NULL AND fecha = periodo)
     FROM public.movimientos WHERE gasto_fijo_id = 'aaaaaaaa-5555-0000-0000-00000000000a'),
  'los movimientos automáticos quedan como gasto fijo, sin firma y con su período');
SELECT pg_temp.comprobar(
  (SELECT proximo_vencimiento > public.hoy_argentina() FROM public.gastos_fijos WHERE id = 'aaaaaaaa-5555-0000-0000-00000000000a'),
  'el próximo vencimiento queda en el futuro');
SELECT pg_temp.comprobar(
  (SELECT count(*) = 0 FROM public.movimientos m JOIN public.gastos_fijos g ON g.id = m.gasto_fijo_id WHERE g.concepto = 'Contador'),
  'un gasto fijo no automático no se carga solo');

-- Pagar a mano un período ya cargado: lo frena el índice único
DO $$ BEGIN
  INSERT INTO public.movimientos (tipo, area, categoria_id, monto, fecha, gasto_fijo_id, periodo, origen)
  SELECT 'gasto', 'camiones', categoria_id, 1, public.hoy_argentina(), id,
         (SELECT min(periodo) FROM public.movimientos WHERE gasto_fijo_id = g.id), 'fijo'
    FROM public.gastos_fijos g WHERE id = 'aaaaaaaa-5555-0000-0000-00000000000a';
  RAISE EXCEPTION 'FALLÓ: se pudo pagar dos veces el mismo período';
EXCEPTION WHEN unique_violation THEN NULL; END $$;

-- Por cobrar
INSERT INTO public.por_cobrar (area, quien, monto) VALUES ('estudio', 'Sucesión Ramírez', 900000);
SELECT pg_temp.comprobar((SELECT household_id FROM public.por_cobrar) = 'aaaaaaaa-1111-0000-0000-00000000000a', 'por cobrar toma el hogar por defecto');

-- Comprobantes y Storage
INSERT INTO storage.objects (bucket_id, name) VALUES ('comprobantes', 'aaaaaaaa-1111-0000-0000-00000000000a/x/foto.jpg');
INSERT INTO public.comprobantes (movimiento_id, ruta, tipo)
SELECT id, 'aaaaaaaa-1111-0000-0000-00000000000a/' || id || '/foto.jpg', 'image/jpeg' FROM public.movimientos LIMIT 1;
DO $$ BEGIN
  INSERT INTO storage.objects (bucket_id, name) VALUES ('comprobantes', 'bbbbbbbb-1111-0000-0000-00000000000b/x/intruso.jpg');
  RAISE EXCEPTION 'FALLÓ: A pudo subir un archivo en la carpeta de B';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  INSERT INTO storage.objects (bucket_id, name) VALUES ('comprobantes', 'no-es-un-uuid/foto.jpg');
  RAISE EXCEPTION 'FALLÓ: se aceptó una ruta sin hogar';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  INSERT INTO public.comprobantes (movimiento_id, ruta, tipo)
  SELECT id, 'bbbbbbbb-1111-0000-0000-00000000000b/' || id || '/foto.jpg', 'image/jpeg' FROM public.movimientos LIMIT 1;
  RAISE EXCEPTION 'FALLÓ: un comprobante apunta a la carpeta de otro hogar';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

-- Avisos
INSERT INTO public.push_suscripciones (endpoint, p256dh, auth) VALUES ('https://push.example/a', 'k', 'a');

-- B no ve nada de lo de A
SELECT pg_temp.ser('bbbbbbbb-0000-0000-0000-00000000000b');
SELECT pg_temp.comprobar((SELECT count(*) FROM public.por_cobrar) = 0, 'B no ve lo que le deben a A');
SELECT pg_temp.comprobar((SELECT count(*) FROM public.comprobantes) = 0, 'B no ve los comprobantes de A');
SELECT pg_temp.comprobar((SELECT count(*) FROM storage.objects) = 0, 'B no ve los archivos de A');
SELECT pg_temp.comprobar((SELECT count(*) FROM public.push_suscripciones) = 0, 'B no ve los avisos de A');
DO $$ DECLARE n int; BEGIN
  DELETE FROM storage.objects; GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.comprobar(n = 0, 'B no puede borrar archivos de A');
END $$;

RESET ROLE;
SELECT 'MEJORAS OK' AS resultado;
ROLLBACK;
