-- =============================================================================
-- 02 · Seguridad por filas (RLS)
-- Regla única: solo los miembros de un hogar leen y escriben sus datos.
-- Re-ejecutable: cada política se borra antes de crearla.
-- =============================================================================

ALTER TABLE public.households           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conceptos_deducibles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gastos_fijos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion        ENABLE ROW LEVEL SECURITY;

-- Hogar y miembros: se leen desde la app pero se crean desde el SQL Editor
-- (ver 05_crear_hogar.sql). Sin políticas de escritura, nadie los toca desde
-- la app.
DROP POLICY IF EXISTS "miembros ven su hogar" ON public.households;
CREATE POLICY "miembros ven su hogar" ON public.households
  FOR SELECT TO authenticated
  USING (public.es_miembro(id));

DROP POLICY IF EXISTS "miembros ven a los otros miembros" ON public.household_members;
CREATE POLICY "miembros ven a los otros miembros" ON public.household_members
  FOR SELECT TO authenticated
  USING (public.es_miembro(household_id));

-- Tablas de datos comunes: todo permitido dentro del propio hogar.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['conceptos_deducibles', 'categorias', 'personas',
                           'gastos_fijos', 'configuracion']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "miembros del hogar" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "miembros del hogar" ON public.%I
         FOR ALL TO authenticated
         USING (public.es_miembro(household_id))
         WITH CHECK (public.es_miembro(household_id))', t);
  END LOOP;
END;
$$;

-- Movimientos: igual, pero al cargar uno no se puede firmar como otro.
DROP POLICY IF EXISTS "miembros leen movimientos" ON public.movimientos;
CREATE POLICY "miembros leen movimientos" ON public.movimientos
  FOR SELECT TO authenticated
  USING (public.es_miembro(household_id));

DROP POLICY IF EXISTS "miembros cargan movimientos" ON public.movimientos;
CREATE POLICY "miembros cargan movimientos" ON public.movimientos
  FOR INSERT TO authenticated
  WITH CHECK (public.es_miembro(household_id) AND creado_por = auth.uid());

DROP POLICY IF EXISTS "miembros editan movimientos" ON public.movimientos;
CREATE POLICY "miembros editan movimientos" ON public.movimientos
  FOR UPDATE TO authenticated
  USING (public.es_miembro(household_id))
  WITH CHECK (public.es_miembro(household_id));

DROP POLICY IF EXISTS "miembros borran movimientos" ON public.movimientos;
CREATE POLICY "miembros borran movimientos" ON public.movimientos
  FOR DELETE TO authenticated
  USING (public.es_miembro(household_id));

-- Las funciones auxiliares no tienen por qué estar al alcance de anon.
REVOKE EXECUTE ON FUNCTION public.mi_hogar() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.es_miembro(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.mi_hogar() TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.es_miembro(uuid) TO authenticated, service_role;
