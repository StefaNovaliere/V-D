-- =============================================================================
-- Prueba de las políticas RLS.
-- Se puede correr en el SQL Editor de Supabase después de 01–04: arma dos
-- hogares de prueba, hace de cuenta que es cada usuario y comprueba que
-- ninguno ve ni toca lo del otro. Todo pasa dentro de una transacción que
-- termina en ROLLBACK, así que no deja nada guardado.
-- Si algo falla, se corta con un error que dice qué. Si llega al final,
-- muestra "RLS OK".
-- =============================================================================

BEGIN;

CREATE FUNCTION pg_temp.comprobar(ok boolean, que text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS NOT TRUE THEN
    RAISE EXCEPTION 'FALLÓ: %', que;
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.ser(usuario uuid) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
                    json_build_object('sub', usuario, 'role', 'authenticated')::text, true);
  SELECT set_config('request.jwt.claim.sub', usuario::text, true);
$$;

-- Usuarios y hogares de prueba (como postgres, sin RLS)
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'prueba-a@rls.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'prueba-b@rls.test');

INSERT INTO public.households (id, nombre) VALUES
  ('aaaaaaaa-1111-0000-0000-000000000000', 'Hogar A'),
  ('bbbbbbbb-1111-0000-0000-000000000000', 'Hogar B');

INSERT INTO public.household_members (household_id, user_id, nombre) VALUES
  ('aaaaaaaa-1111-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'A'),
  ('bbbbbbbb-1111-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000002', 'B');

INSERT INTO public.personas (id, household_id, area, nombre, rol, sueldo_mensual)
VALUES ('aaaaaaaa-2222-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000',
        'casa', 'Niñera de A', 'Niñera', 500000);

INSERT INTO public.movimientos (id, household_id, tipo, area, categoria_id, monto, fecha, creado_por)
SELECT 'aaaaaaaa-3333-0000-0000-000000000000', household_id, 'gasto', 'casa', id, 1000, '2026-10-01',
       'aaaaaaaa-0000-0000-0000-000000000001'
  FROM public.categorias
 WHERE household_id = 'aaaaaaaa-1111-0000-0000-000000000000' AND area = 'casa' AND clave = 'supermercado';

INSERT INTO public.gastos_fijos (household_id, area, categoria_id, concepto, monto, proximo_vencimiento)
SELECT household_id, 'camiones', id, 'Seguro', 540000, '2026-11-05'
  FROM public.categorias
 WHERE household_id = 'aaaaaaaa-1111-0000-0000-000000000000' AND area = 'camiones' AND clave = 'seguro';

SELECT pg_temp.comprobar(
  (SELECT count(*) FROM public.categorias WHERE household_id = 'bbbbbbbb-1111-0000-0000-000000000000') > 20,
  'el trigger carga las categorías al crear un hogar');

-- Id de una categoría de A, para probar que B no la puede usar.
SELECT set_config('prueba.cat_a', id::text, true)
  FROM public.categorias
 WHERE household_id = 'aaaaaaaa-1111-0000-0000-000000000000' AND area = 'casa' AND clave = 'supermercado';

-- ---------------------------------------------------------------------------
-- Usuario B: no ve nada de A
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.ser('bbbbbbbb-0000-0000-0000-000000000002');

SELECT pg_temp.comprobar(public.mi_hogar() = 'bbbbbbbb-1111-0000-0000-000000000000', 'mi_hogar() de B');
SELECT pg_temp.comprobar((SELECT count(*) FROM public.households) = 1, 'B ve solo su hogar');
SELECT pg_temp.comprobar((SELECT count(*) FROM public.household_members) = 1, 'B ve solo a los miembros de su hogar');
SELECT pg_temp.comprobar((SELECT count(*) FROM public.movimientos) = 0, 'B no ve movimientos de A');
SELECT pg_temp.comprobar((SELECT count(*) FROM public.personas) = 0, 'B no ve personas de A');
SELECT pg_temp.comprobar((SELECT count(*) FROM public.gastos_fijos) = 0, 'B no ve gastos fijos de A');
SELECT pg_temp.comprobar(
  (SELECT count(*) FROM public.categorias WHERE household_id <> 'bbbbbbbb-1111-0000-0000-000000000000') = 0,
  'B no ve categorías de A');
SELECT pg_temp.comprobar(
  (SELECT count(*) FROM public.conceptos_deducibles WHERE household_id <> 'bbbbbbbb-1111-0000-0000-000000000000') = 0,
  'B no ve conceptos deducibles de A');
SELECT pg_temp.comprobar((SELECT count(*) FROM public.configuracion) = 1, 'B ve solo su configuración');

DO $$
DECLARE
  n int;
BEGIN
  -- Escribir en el hogar de A
  BEGIN
    INSERT INTO public.movimientos (household_id, tipo, area, categoria_id, monto, fecha)
    SELECT 'aaaaaaaa-1111-0000-0000-000000000000', 'gasto', 'casa', id, 1, '2026-10-01'
      FROM public.categorias WHERE area = 'casa' AND clave = 'supermercado';
    RAISE EXCEPTION 'FALLÓ: B pudo cargar un movimiento en el hogar de A';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.personas (household_id, area, nombre, rol)
    VALUES ('aaaaaaaa-1111-0000-0000-000000000000', 'casa', 'Intrusa', 'Niñera');
    RAISE EXCEPTION 'FALLÓ: B pudo cargar una persona en el hogar de A';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Usar una categoría de A desde el hogar de B (la FK compuesta lo frena)
  BEGIN
    INSERT INTO public.movimientos (tipo, area, categoria_id, monto, fecha)
    VALUES ('gasto', 'casa', current_setting('prueba.cat_a')::uuid, 1, '2026-10-01');
    RAISE EXCEPTION 'FALLÓ: B pudo usar una categoría de A';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  UPDATE public.movimientos SET monto = 1 WHERE id = 'aaaaaaaa-3333-0000-0000-000000000000';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.comprobar(n = 0, 'B no puede editar movimientos de A');

  DELETE FROM public.movimientos WHERE id = 'aaaaaaaa-3333-0000-0000-000000000000';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.comprobar(n = 0, 'B no puede borrar movimientos de A');

  DELETE FROM public.personas WHERE id = 'aaaaaaaa-2222-0000-0000-000000000000';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.comprobar(n = 0, 'B no puede borrar personas de A');

  UPDATE public.configuracion SET monotributo_activo = true
   WHERE household_id = 'aaaaaaaa-1111-0000-0000-000000000000';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.comprobar(n = 0, 'B no puede tocar la configuración de A');

  -- Pasarse un movimiento propio al hogar de A
  BEGIN
    UPDATE public.movimientos SET household_id = 'aaaaaaaa-1111-0000-0000-000000000000';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- Usuario A: ve lo suyo, carga con su firma y no puede firmar como otro
-- ---------------------------------------------------------------------------
SELECT pg_temp.ser('aaaaaaaa-0000-0000-0000-000000000001');

SELECT pg_temp.comprobar((SELECT count(*) FROM public.movimientos) = 1, 'A ve su movimiento');
SELECT pg_temp.comprobar((SELECT count(*) FROM public.personas) = 1, 'A ve su persona');
SELECT pg_temp.comprobar((SELECT count(*) FROM public.gastos_fijos) = 1, 'A ve su gasto fijo');

-- Sin household_id ni creado_por: los completa la base.
INSERT INTO public.movimientos (tipo, area, categoria_id, monto, fecha, nota)
SELECT 'ingreso', 'estudio', id, 900000.50, '2026-10-24', 'prueba default'
  FROM public.categorias WHERE area = 'estudio' AND clave = 'honorarios';

SELECT pg_temp.comprobar(
  (SELECT household_id = 'aaaaaaaa-1111-0000-0000-000000000000'
          AND creado_por = 'aaaaaaaa-0000-0000-0000-000000000001'
          AND monto = 900000.50
          AND fecha = DATE '2026-10-24'
     FROM public.movimientos WHERE nota = 'prueba default'),
  'household_id y creado_por por defecto, monto y fecha exactos');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.movimientos (tipo, area, categoria_id, monto, fecha, creado_por)
    SELECT 'gasto', 'casa', id, 1, '2026-10-01', 'bbbbbbbb-0000-0000-0000-000000000002'
      FROM public.categorias WHERE area = 'casa' AND clave = 'supermercado';
    RAISE EXCEPTION 'FALLÓ: A pudo cargar un movimiento firmado por B';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Categoría de otra área: la FK compuesta lo frena
  BEGIN
    INSERT INTO public.movimientos (tipo, area, categoria_id, monto, fecha)
    SELECT 'gasto', 'estudio', id, 1, '2026-10-01'
      FROM public.categorias WHERE area = 'casa' AND clave = 'supermercado';
    RAISE EXCEPTION 'FALLÓ: se aceptó una categoría de Casa en un movimiento del Estudio';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  -- Montos negativos o cero
  BEGIN
    INSERT INTO public.movimientos (tipo, area, categoria_id, monto, fecha)
    SELECT 'gasto', 'casa', id, 0, '2026-10-01'
      FROM public.categorias WHERE area = 'casa' AND clave = 'supermercado';
    RAISE EXCEPTION 'FALLÓ: se aceptó un monto en cero';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;

-- Editar no cambia quién lo cargó
UPDATE public.movimientos SET creado_por = 'bbbbbbbb-0000-0000-0000-000000000002', monto = 2000
 WHERE id = 'aaaaaaaa-3333-0000-0000-000000000000';
SELECT pg_temp.comprobar(
  (SELECT creado_por = 'aaaaaaaa-0000-0000-0000-000000000001' AND monto = 2000
     FROM public.movimientos WHERE id = 'aaaaaaaa-3333-0000-0000-000000000000'),
  'editar cambia el monto pero no quién lo cargó');

-- Mis Cargas: se guarda el token pero no se puede leer
SELECT public.guardar_conexion_mis_cargas('https://ejemplo.supabase.co/functions/v1/ingreso-mensual', 'secreto');
SELECT pg_temp.comprobar((SELECT count(*) FROM public.mis_cargas_conexion) = 0, 'el token no se puede leer desde la app');
SELECT pg_temp.comprobar((SELECT conectado FROM public.estado_mis_cargas()), 'estado_mis_cargas() dice conectado');

SELECT pg_temp.ser('bbbbbbbb-0000-0000-0000-000000000002');
SELECT pg_temp.comprobar((SELECT conectado FROM public.estado_mis_cargas()) IS NOT TRUE, 'B no ve la conexión de A');

-- ---------------------------------------------------------------------------
-- Sin sesión (anon): nada
-- ---------------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT pg_temp.comprobar((SELECT count(*) FROM public.movimientos) = 0, 'anon no ve movimientos');
SELECT pg_temp.comprobar((SELECT count(*) FROM public.households) = 0, 'anon no ve hogares');
SELECT pg_temp.comprobar((SELECT count(*) FROM public.categorias) = 0, 'anon no ve categorías');

RESET ROLE;
SELECT 'RLS OK' AS resultado;

ROLLBACK;
