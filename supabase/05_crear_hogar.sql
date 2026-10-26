-- =============================================================================
-- 05 · Crear el hogar y sumar a los dos usuarios
-- Se corre una sola vez, después de crear las dos cuentas en
-- Authentication → Users → Add user (con "Auto Confirm User").
-- Cambiá los dos emails y los nombres antes de correrlo.
-- Es re-ejecutable: si el hogar ya existe, solo suma a quien falte.
-- =============================================================================

DO $$
DECLARE
  v_nombre_hogar constant text := 'Familia';
  v_miembros constant text[][] := ARRAY[
    -- email,               nombre que se ve en "Cargó ..."
    ARRAY['ella@ejemplo.com', 'Laura'],
    ARRAY['el@ejemplo.com',   'Martín']
  ];
  v_hogar uuid;
  v_user  uuid;
  i int;
BEGIN
  -- Si alguno de los dos ya está en un hogar, se usa ese.
  SELECT m.household_id INTO v_hogar
    FROM public.household_members m
    JOIN auth.users u ON u.id = m.user_id
   WHERE lower(u.email) IN (lower(v_miembros[1][1]), lower(v_miembros[2][1]))
   LIMIT 1;

  IF v_hogar IS NULL THEN
    INSERT INTO public.households (nombre) VALUES (v_nombre_hogar) RETURNING id INTO v_hogar;
  END IF;

  FOR i IN 1 .. array_length(v_miembros, 1) LOOP
    SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(v_miembros[i][1]);
    IF v_user IS NULL THEN
      RAISE EXCEPTION 'No existe el usuario %. Crealo primero en Authentication → Users.', v_miembros[i][1];
    END IF;
    INSERT INTO public.household_members (household_id, user_id, nombre)
    VALUES (v_hogar, v_user, v_miembros[i][2])
    ON CONFLICT (household_id, user_id) DO UPDATE SET nombre = EXCLUDED.nombre;
  END LOOP;

  RAISE NOTICE 'Hogar listo: %', v_hogar;
END;
$$;
