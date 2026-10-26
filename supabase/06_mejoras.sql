-- =============================================================================
-- 06 · Mejoras: gastos fijos automáticos, plata por cobrar, comprobantes y
-- avisos al celular. Se corre después de 01–05. Re-ejecutable.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Período que paga un movimiento de gasto fijo (el vencimiento que cubre).
-- Con el índice único no se puede pagar dos veces el mismo vencimiento, ni
-- aunque los dos lo carguen a la vez o la carga automática corra dos veces.
-- ---------------------------------------------------------------------------
ALTER TABLE public.movimientos ADD COLUMN IF NOT EXISTS periodo date;

CREATE UNIQUE INDEX IF NOT EXISTS movimientos_un_pago_por_periodo
  ON public.movimientos (gasto_fijo_id, periodo)
  WHERE gasto_fijo_id IS NOT NULL AND periodo IS NOT NULL;

-- Si el gasto fijo se carga solo el día que vence.
ALTER TABLE public.gastos_fijos ADD COLUMN IF NOT EXISTS automatico boolean NOT NULL DEFAULT false;

-- Con cuántos días de anticipación avisar un vencimiento.
ALTER TABLE public.configuracion ADD COLUMN IF NOT EXISTS aviso_dias smallint NOT NULL DEFAULT 2
  CHECK (aviso_dias BETWEEN 0 AND 15);

-- "Hoy" en Argentina. El servidor está en UTC: a las 22 h de acá allá ya es
-- mañana, y un gasto se cargaría un día antes de vencer.
CREATE OR REPLACE FUNCTION public.hoy_argentina()
RETURNS date
LANGUAGE sql STABLE
AS $$ SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date $$;

-- Mismo cálculo que siguienteVencimiento() en src/lib/calculos.js: conserva
-- el día y, si el mes es más corto, queda en el último.
CREATE OR REPLACE FUNCTION public.siguiente_vencimiento(p_fecha date, p_frecuencia text)
RETURNS date
LANGUAGE sql IMMUTABLE
AS $$
  SELECT (p_fecha + make_interval(months => CASE p_frecuencia
    WHEN 'bimestral' THEN 2 WHEN 'trimestral' THEN 3 WHEN 'cuatrimestral' THEN 4
    WHEN 'semestral' THEN 6 WHEN 'anual' THEN 12 ELSE 1 END))::date
$$;

-- ---------------------------------------------------------------------------
-- Carga sola los gastos fijos automáticos que ya vencieron, en un hogar.
-- Si pasaron varios períodos (nadie abrió la app ni corrió el cron), carga
-- uno por período, con tope de 24 por si hubiera una fecha mal cargada.
-- Devuelve cuántos cargó.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cargar_fijos_vencidos_de(p_household uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g record;
  v_hoy date := public.hoy_argentina();
  v_vence date;
  v_cargados int := 0;
  v_vueltas int;
  v_deducible uuid;
BEGIN
  FOR g IN
    SELECT * FROM gastos_fijos
     WHERE household_id = p_household AND activo AND automatico AND monto > 0
       AND proximo_vencimiento <= v_hoy
     FOR UPDATE SKIP LOCKED  -- si otro proceso lo está cargando, lo deja
  LOOP
    SELECT concepto_deducible_id INTO v_deducible FROM categorias WHERE id = g.categoria_id;
    v_vence := g.proximo_vencimiento;
    v_vueltas := 0;
    WHILE v_vence <= v_hoy AND v_vueltas < 24 LOOP
      INSERT INTO movimientos (household_id, tipo, area, categoria_id, monto, fecha, nota,
                               creado_por, origen, persona_id, gasto_fijo_id, patente,
                               concepto_deducible_id, periodo)
      VALUES (g.household_id, 'gasto', g.area, g.categoria_id, g.monto, v_vence, g.concepto,
              NULL, 'fijo', g.persona_id, g.id, g.patente, v_deducible, v_vence)
      ON CONFLICT (gasto_fijo_id, periodo) WHERE gasto_fijo_id IS NOT NULL AND periodo IS NOT NULL
      DO NOTHING;
      IF FOUND THEN v_cargados := v_cargados + 1; END IF;
      v_vence := public.siguiente_vencimiento(v_vence, g.frecuencia);
      v_vueltas := v_vueltas + 1;
    END LOOP;
    UPDATE gastos_fijos SET proximo_vencimiento = v_vence WHERE id = g.id;
  END LOOP;
  RETURN v_cargados;
END;
$$;

-- La llama la app al abrir: solo para el hogar de quien la abre.
CREATE OR REPLACE FUNCTION public.cargar_fijos_vencidos()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hogar uuid := public.mi_hogar();
BEGIN
  IF v_hogar IS NULL THEN RETURN 0; END IF;
  RETURN public.cargar_fijos_vencidos_de(v_hogar);
END;
$$;

-- La llama el cron diario (07_cron.sql) para todos los hogares.
CREATE OR REPLACE FUNCTION public.cargar_fijos_vencidos_todos()
RETURNS int
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$ SELECT coalesce(sum(public.cargar_fijos_vencidos_de(id)), 0)::int FROM households $$;

REVOKE EXECUTE ON FUNCTION public.cargar_fijos_vencidos_de(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.cargar_fijos_vencidos_todos() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.cargar_fijos_vencidos() FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.cargar_fijos_vencidos() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.cargar_fijos_vencidos_de(uuid) TO service_role;
GRANT  EXECUTE ON FUNCTION public.cargar_fijos_vencidos_todos() TO service_role;

-- ---------------------------------------------------------------------------
-- Plata por cobrar: honorarios ya trabajados que todavía no entraron, y lo
-- que los dadores le deben a los camiones (viene de Mis Cargas).
-- No suma al resumen: es plata que todavía no está. Al cobrarla se carga el
-- ingreso y la fila queda marcada.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.por_cobrar (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id     uuid NOT NULL DEFAULT public.mi_hogar()
                   REFERENCES public.households(id) ON DELETE CASCADE,
  area             text NOT NULL CHECK (area IN ('casa', 'estudio', 'camiones')),
  -- Cliente del estudio o dador de carga.
  quien            text NOT NULL,
  detalle          text,
  monto            numeric(14,2) NOT NULL CHECK (monto > 0),
  fecha_estimada   date,
  origen           text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'mis_cargas')),
  ref_externa      text,
  movimiento_id    uuid REFERENCES public.movimientos(id) ON DELETE SET NULL,
  cobrado_el       date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, ref_externa)
);

ALTER TABLE public.por_cobrar ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "miembros del hogar" ON public.por_cobrar;
CREATE POLICY "miembros del hogar" ON public.por_cobrar
  FOR ALL TO authenticated
  USING (public.es_miembro(household_id))
  WITH CHECK (public.es_miembro(household_id));

-- ---------------------------------------------------------------------------
-- Comprobantes (fotos o PDF) de un movimiento, en Storage.
-- Ruta del archivo: {household_id}/{movimiento_id}/{nombre}
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comprobantes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   uuid NOT NULL DEFAULT public.mi_hogar()
                 REFERENCES public.households(id) ON DELETE CASCADE,
  movimiento_id  uuid NOT NULL REFERENCES public.movimientos(id) ON DELETE CASCADE,
  ruta           text NOT NULL UNIQUE,
  tipo           text NOT NULL,
  tamano         int,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comprobantes_movimiento ON public.comprobantes (movimiento_id);

ALTER TABLE public.comprobantes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "miembros del hogar" ON public.comprobantes;
CREATE POLICY "miembros del hogar" ON public.comprobantes
  FOR ALL TO authenticated
  USING (public.es_miembro(household_id))
  WITH CHECK (public.es_miembro(household_id) AND split_part(ruta, '/', 1) = household_id::text);

-- Bucket privado. 10 MB por archivo, solo imágenes y PDF.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('comprobantes', 'comprobantes', false, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- El primer tramo de la ruta es el hogar. Se compara como texto para que
-- una ruta mal formada dé "no" en vez de un error de conversión.
CREATE OR REPLACE FUNCTION public.es_miembro_de_ruta(p_ruta text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
     WHERE household_id::text = split_part(p_ruta, '/', 1) AND user_id = auth.uid()
  )
$$;
REVOKE EXECUTE ON FUNCTION public.es_miembro_de_ruta(text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.es_miembro_de_ruta(text) TO authenticated;

DROP POLICY IF EXISTS "comprobantes: miembros leen" ON storage.objects;
CREATE POLICY "comprobantes: miembros leen" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'comprobantes' AND public.es_miembro_de_ruta(name));

DROP POLICY IF EXISTS "comprobantes: miembros suben" ON storage.objects;
CREATE POLICY "comprobantes: miembros suben" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comprobantes' AND public.es_miembro_de_ruta(name));

DROP POLICY IF EXISTS "comprobantes: miembros borran" ON storage.objects;
CREATE POLICY "comprobantes: miembros borran" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'comprobantes' AND public.es_miembro_de_ruta(name));

-- ---------------------------------------------------------------------------
-- Avisos al celular (Web Push). Una fila por navegador o celular donde
-- alguien activó los avisos. Cada uno ve y borra solo las suyas.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_suscripciones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL DEFAULT public.mi_hogar()
               REFERENCES public.households(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  dispositivo  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_suscripciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cada uno sus avisos" ON public.push_suscripciones;
CREATE POLICY "cada uno sus avisos" ON public.push_suscripciones
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.es_miembro(household_id));
