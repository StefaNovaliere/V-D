-- =============================================================================
-- 01 · Esquema
-- Cuentas de la familia. Se puede correr las veces que haga falta en el
-- SQL Editor de Supabase: todo usa IF NOT EXISTS / OR REPLACE.
--
-- Reglas que valen para todo el archivo:
--  * La plata va en numeric(14,2). Nunca float: con float 0,1 + 0,2 no da 0,3
--    y un resumen mensual termina con centavos fantasma.
--  * Las fechas de calendario (cuándo se pagó, cuándo vence) van en `date`.
--    En Mis Cargas guardarlas como instantes en UTC corrió fechas un día.
--    Además, ninguna fecha de calendario tiene DEFAULT current_date: el
--    servidor está en UTC y a las 22 h de Argentina ya es mañana. La fecha la
--    manda siempre la app, con el día que ve la persona.
--  * Toda tabla con datos tiene household_id; las políticas están en 02_rls.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Hogar y miembros
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.households (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.household_members (
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Cómo aparece en "Cargó Laura".
  nombre       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);

-- Una persona pertenece a un solo hogar. Así mi_hogar() no tiene que adivinar
-- y la app no necesita un selector de hogar que nadie pidió.
CREATE UNIQUE INDEX IF NOT EXISTS household_members_un_hogar_por_usuario
  ON public.household_members (user_id);

-- SECURITY DEFINER para que las políticas puedan consultar household_members
-- sin volver a disparar la política de household_members (recursión infinita).
CREATE OR REPLACE FUNCTION public.mi_hogar()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id FROM public.household_members WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.es_miembro(p_household uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = p_household AND user_id = auth.uid()
  )
$$;

-- ---------------------------------------------------------------------------
-- Conceptos deducibles de Ganancias (regalo 2)
-- Configurables a propósito: qué se puede deducir lo confirma el contador y
-- cambia con la ley. La app no codifica ninguna regla impositiva.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conceptos_deducibles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL DEFAULT public.mi_hogar()
               REFERENCES public.households(id) ON DELETE CASCADE,
  nombre       text NOT NULL,
  orden        int  NOT NULL DEFAULT 0,
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, nombre),
  UNIQUE (id, household_id)
);

-- ---------------------------------------------------------------------------
-- Categorías. Vienen precargadas por hogar (ver 03_datos_iniciales.sql).
-- `clave` es lo que usa la app para reconocer una categoría aunque le cambien
-- el nombre: sueldo, aguinaldo, mis_cargas, honorarios, etc.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categorias (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          uuid NOT NULL DEFAULT public.mi_hogar()
                        REFERENCES public.households(id) ON DELETE CASCADE,
  area                  text NOT NULL CHECK (area IN ('casa', 'estudio', 'camiones')),
  tipo                  text NOT NULL CHECK (tipo IN ('ingreso', 'gasto')),
  nombre                text NOT NULL,
  clave                 text,
  orden                 int  NOT NULL DEFAULT 0,
  activa                boolean NOT NULL DEFAULT true,
  -- Regalo 3: los ingresos que suman para el tope del monotributo.
  cuenta_monotributo    boolean NOT NULL DEFAULT false,
  -- Regalo 2: concepto que se sugiere al cargar un gasto de esta categoría.
  concepto_deducible_id uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, area, tipo, nombre),
  -- Para que movimientos y gastos fijos solo puedan apuntar a una categoría
  -- del mismo hogar, la misma área y el mismo tipo (ver FKs compuestas).
  UNIQUE (id, household_id, area, tipo),
  FOREIGN KEY (concepto_deducible_id, household_id)
    REFERENCES public.conceptos_deducibles (id, household_id)
    ON DELETE SET NULL (concepto_deducible_id)
);

-- ---------------------------------------------------------------------------
-- Personas con sueldo: secretaria (estudio), niñera (casa).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   uuid NOT NULL DEFAULT public.mi_hogar()
                 REFERENCES public.households(id) ON DELETE CASCADE,
  area           text NOT NULL CHECK (area IN ('casa', 'estudio')),
  nombre         text NOT NULL,
  rol            text NOT NULL,
  sueldo_mensual numeric(14,2) NOT NULL DEFAULT 0 CHECK (sueldo_mensual >= 0),
  fecha_alta     date,
  activa         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, household_id)
);

-- ---------------------------------------------------------------------------
-- Gastos fijos con vencimiento: seguro, contador, IIBB, RTO, sueldos,
-- monotributo, aportes... Pagar uno carga el movimiento y corre el
-- vencimiento al período siguiente.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gastos_fijos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id        uuid NOT NULL DEFAULT public.mi_hogar()
                      REFERENCES public.households(id) ON DELETE CASCADE,
  area                text NOT NULL CHECK (area IN ('casa', 'estudio', 'camiones')),
  tipo                text NOT NULL DEFAULT 'gasto' CHECK (tipo = 'gasto'),
  categoria_id        uuid NOT NULL,
  concepto            text NOT NULL,
  -- Texto corto que se ve debajo: "3 camiones", "AE 412 KT".
  detalle             text,
  patente             text,
  persona_id          uuid,
  monto               numeric(14,2) NOT NULL DEFAULT 0 CHECK (monto >= 0),
  frecuencia          text NOT NULL DEFAULT 'mensual'
                      CHECK (frecuencia IN ('mensual', 'bimestral', 'trimestral',
                                            'cuatrimestral', 'semestral', 'anual')),
  proximo_vencimiento date NOT NULL,
  -- Regalo 4: aparece en el calendario de vencimientos impositivos.
  es_impositivo       boolean NOT NULL DEFAULT false,
  activo              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, household_id),
  FOREIGN KEY (categoria_id, household_id, area, tipo)
    REFERENCES public.categorias (id, household_id, area, tipo),
  FOREIGN KEY (persona_id, household_id)
    REFERENCES public.personas (id, household_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Movimientos: cada peso que entra o sale.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.movimientos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          uuid NOT NULL DEFAULT public.mi_hogar()
                        REFERENCES public.households(id) ON DELETE CASCADE,
  tipo                  text NOT NULL CHECK (tipo IN ('ingreso', 'gasto')),
  area                  text NOT NULL CHECK (area IN ('casa', 'estudio', 'camiones')),
  categoria_id          uuid NOT NULL,
  -- Siempre positivo; el signo lo da `tipo`.
  monto                 numeric(14,2) NOT NULL CHECK (monto > 0),
  fecha                 date NOT NULL,
  nota                  text,
  -- Quién lo cargó. Lo completa la base con el usuario logueado; null en lo
  -- que trae la sincronización con Mis Cargas.
  creado_por            uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  origen                text NOT NULL DEFAULT 'manual'
                        CHECK (origen IN ('manual', 'fijo', 'mis_cargas')),
  persona_id            uuid,
  gasto_fijo_id         uuid,
  patente               text,
  concepto_deducible_id uuid,
  -- Identificador estable de lo que viene de afuera ("mis_cargas:2026-10:AE412KT").
  -- Con el UNIQUE, volver a sincronizar actualiza en vez de duplicar.
  ref_externa           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, ref_externa),
  FOREIGN KEY (categoria_id, household_id, area, tipo)
    REFERENCES public.categorias (id, household_id, area, tipo),
  -- SET NULL solo sobre la columna propia (Postgres 15+): si no, también
  -- intentaría poner household_id en null.
  FOREIGN KEY (persona_id, household_id)
    REFERENCES public.personas (id, household_id) ON DELETE SET NULL (persona_id),
  FOREIGN KEY (gasto_fijo_id, household_id)
    REFERENCES public.gastos_fijos (id, household_id) ON DELETE SET NULL (gasto_fijo_id),
  FOREIGN KEY (concepto_deducible_id, household_id)
    REFERENCES public.conceptos_deducibles (id, household_id) ON DELETE SET NULL (concepto_deducible_id)
);

CREATE INDEX IF NOT EXISTS movimientos_hogar_fecha ON public.movimientos (household_id, fecha);
CREATE INDEX IF NOT EXISTS movimientos_persona ON public.movimientos (persona_id) WHERE persona_id IS NOT NULL;

-- Quién cargó un movimiento y a qué hogar pertenece no se cambian después.
CREATE OR REPLACE FUNCTION public.movimientos_antes_de_actualizar()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.household_id := OLD.household_id;
  NEW.creado_por   := OLD.creado_por;
  NEW.created_at   := OLD.created_at;
  NEW.updated_at   := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS movimientos_antes_de_actualizar ON public.movimientos;
CREATE TRIGGER movimientos_antes_de_actualizar
  BEFORE UPDATE ON public.movimientos
  FOR EACH ROW EXECUTE FUNCTION public.movimientos_antes_de_actualizar();

-- ---------------------------------------------------------------------------
-- Configuración del hogar (una fila por hogar).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.configuracion (
  household_id           uuid PRIMARY KEY DEFAULT public.mi_hogar()
                         REFERENCES public.households(id) ON DELETE CASCADE,
  -- Regalo 3. El tope se carga a mano porque ARCA lo actualiza seguido.
  monotributo_activo     boolean NOT NULL DEFAULT false,
  monotributo_categoria  text,
  monotributo_tope       numeric(16,2) CHECK (monotributo_tope IS NULL OR monotributo_tope > 0),
  monotributo_aviso_pct  smallint NOT NULL DEFAULT 80
                         CHECK (monotributo_aviso_pct BETWEEN 1 AND 100),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
