-- =============================================================================
-- 03 · Datos iniciales de cada hogar
-- Categorías, conceptos deducibles y la fila de configuración. Se cargan solos
-- al crear un hogar (trigger) y este archivo también los completa en los
-- hogares que ya existen, sin duplicar ni pisar lo que hayan cambiado.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sembrar_hogar(p_household uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO configuracion (household_id) VALUES (p_household)
  ON CONFLICT (household_id) DO NOTHING;

  -- Ejemplos para arrancar. Qué se deduce de verdad lo define el contador;
  -- se pueden renombrar o desactivar desde Ajustes.
  INSERT INTO conceptos_deducibles (household_id, nombre, orden) VALUES
    (p_household, 'Cuota médico-asistencial (prepaga)', 1),
    (p_household, 'Personal de casas particulares (sueldo y aportes)', 2),
    (p_household, 'Alquiler de vivienda', 3),
    (p_household, 'Seguro de vida', 4),
    (p_household, 'Honorarios médicos', 5),
    (p_household, 'Gastos de educación', 6),
    (p_household, 'Donaciones', 7)
  ON CONFLICT (household_id, nombre) DO NOTHING;

  INSERT INTO categorias (household_id, area, tipo, nombre, clave, orden, cuenta_monotributo)
  VALUES
    -- Casa
    (p_household, 'casa', 'ingreso', 'Otros ingresos',          'otros',        1, false),
    (p_household, 'casa', 'gasto',   'Supermercado',            'supermercado', 1, false),
    (p_household, 'casa', 'gasto',   'Sueldo niñera',           'sueldo',       2, false),
    (p_household, 'casa', 'gasto',   'Aguinaldo niñera',        'aguinaldo',    3, false),
    (p_household, 'casa', 'gasto',   'Aportes casas particulares', 'aportes_cp', 4, false),
    (p_household, 'casa', 'gasto',   'Colegio',                 'colegio',      5, false),
    (p_household, 'casa', 'gasto',   'Servicios',               'servicios',    6, false),
    (p_household, 'casa', 'gasto',   'Prepaga',                 'prepaga',      7, false),
    (p_household, 'casa', 'gasto',   'Alquiler',                'alquiler',     8, false),
    (p_household, 'casa', 'gasto',   'Otros',                   'otros',        99, false),
    -- Estudio
    (p_household, 'estudio', 'ingreso', 'Honorarios',           'honorarios',   1, true),
    (p_household, 'estudio', 'ingreso', 'Otros ingresos',       'otros',        2, false),
    (p_household, 'estudio', 'gasto',   'Sueldo secretaria',    'sueldo',       1, false),
    (p_household, 'estudio', 'gasto',   'Aguinaldo secretaria', 'aguinaldo',    2, false),
    (p_household, 'estudio', 'gasto',   'Alquiler oficina',     'alquiler',     3, false),
    (p_household, 'estudio', 'gasto',   'Servicios',            'servicios',    4, false),
    (p_household, 'estudio', 'gasto',   'Matrícula',            'matricula',    5, false),
    (p_household, 'estudio', 'gasto',   'Insumos',              'insumos',      6, false),
    (p_household, 'estudio', 'gasto',   'Monotributo',          'monotributo',  7, false),
    (p_household, 'estudio', 'gasto',   'Otros',                'otros',        99, false),
    -- Camiones
    (p_household, 'camiones', 'ingreso', 'Ingreso limpio (Mis Cargas)', 'mis_cargas', 1, false),
    (p_household, 'camiones', 'ingreso', 'Otros ingresos',      'otros',        2, false),
    -- Si un camión dio pérdida en el mes, la sincronización lo carga acá.
    (p_household, 'camiones', 'gasto',   'Resultado negativo (Mis Cargas)', 'mis_cargas', 90, false),
    (p_household, 'camiones', 'gasto',   'Seguro',              'seguro',       1, false),
    (p_household, 'camiones', 'gasto',   'Ingresos Brutos',     'iibb',         2, false),
    (p_household, 'camiones', 'gasto',   'Contador',            'contador',     3, false),
    (p_household, 'camiones', 'gasto',   'Técnica (RTO)',       'rto',          4, false),
    (p_household, 'camiones', 'gasto',   'Otros',               'otros',        99, false)
  ON CONFLICT (household_id, area, tipo, nombre) DO NOTHING;

  -- Sugerencias de concepto deducible, solo donde todavía no hay una elegida.
  UPDATE categorias c
     SET concepto_deducible_id = d.id
    FROM conceptos_deducibles d
   WHERE c.household_id = p_household
     AND d.household_id = p_household
     AND c.concepto_deducible_id IS NULL
     AND (c.area, c.clave, d.nombre) IN (
           ('casa', 'prepaga',    'Cuota médico-asistencial (prepaga)'),
           ('casa', 'sueldo',     'Personal de casas particulares (sueldo y aportes)'),
           ('casa', 'aguinaldo',  'Personal de casas particulares (sueldo y aportes)'),
           ('casa', 'aportes_cp', 'Personal de casas particulares (sueldo y aportes)'),
           ('casa', 'alquiler',   'Alquiler de vivienda'),
           ('casa', 'colegio',    'Gastos de educación')
         );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sembrar_hogar(uuid) FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.households_despues_de_crear()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sembrar_hogar(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS households_despues_de_crear ON public.households;
CREATE TRIGGER households_despues_de_crear
  AFTER INSERT ON public.households
  FOR EACH ROW EXECUTE FUNCTION public.households_despues_de_crear();

-- Completar los hogares que ya existían.
SELECT public.sembrar_hogar(id) FROM public.households;
