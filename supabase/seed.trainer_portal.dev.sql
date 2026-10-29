-- Development-only, repeatable Trainer Portal fixtures.
-- Requires two already-provisioned Supabase Auth users in public.users with
-- role TRAINER and active trainer profiles may be created for them below.
-- Opt in explicitly with PGOPTIONS=-cpowerplus.allow_dev_seed=true.
-- Never run this against a production database.

BEGIN;

DO $$
DECLARE
  v_trainer_ids UUID[];
  v_user_ids UUID[];
  v_class_ids UUID[];
  v_class_id UUID;
  v_trainer_id UUID;
  v_customer_id UUID;
  v_schedule_id UUID;
  v_plan_id UUID;
  v_start TIMESTAMPTZ;
  i INTEGER;
  j INTEGER;
  v_code TEXT;
  v_first TEXT;
  v_last TEXT;
  v_names TEXT[][] := ARRAY[
    ['Mekdes','Alemu'], ['Dawit','Bekele'], ['Hana','Tesfaye'], ['Yonas','Kebede'], ['Rahel','Girma'],
    ['Abel','Fikru'], ['Selam','Haile'], ['Liya','Worku'], ['Samuel','Tadesse'], ['Sara','Mulu']
  ];
BEGIN
  IF current_setting('powerplus.allow_dev_seed', TRUE) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Refusing to seed: opt in only on a development database with PGOPTIONS=-cpowerplus.allow_dev_seed=true';
  END IF;

  SELECT array_agg(u.id ORDER BY u.email) INTO v_user_ids
  FROM public.users u
  WHERE u.email IN ('trainer1@powerplus.test', 'trainer2@powerplus.test')
    AND u.role = 'TRAINER' AND u.is_active = TRUE;
  IF COALESCE(array_length(v_user_ids, 1), 0) <> 2 THEN
    RAISE EXCEPTION 'Provision trainer1@powerplus.test and trainer2@powerplus.test through Supabase Auth and public.users before seeding';
  END IF;

  INSERT INTO public.trainer_profiles (user_id, first_name, last_name, phone, specialization, is_active)
  SELECT u.id, CASE WHEN u.email = 'trainer1@powerplus.test' THEN 'Dev Trainer One' ELSE 'Dev Trainer Two' END,
    'Coach', NULL, 'Development Fitness', TRUE
  FROM public.users u
  WHERE u.email IN ('trainer1@powerplus.test', 'trainer2@powerplus.test')
    AND NOT EXISTS (SELECT 1 FROM public.trainer_profiles tp WHERE tp.user_id = u.id);
  SELECT array_agg(tp.id ORDER BY u.email) INTO v_trainer_ids
  FROM public.users u JOIN public.trainer_profiles tp ON tp.user_id = u.id
  WHERE u.email IN ('trainer1@powerplus.test', 'trainer2@powerplus.test')
    AND u.role = 'TRAINER' AND u.is_active = TRUE AND tp.is_active = TRUE;

  INSERT INTO public.plans (name, price, duration_days, description, benefits, is_active)
  SELECT 'DEV ONLY - Trainer Portal Membership', 1, 30, 'Development seed data; no charge', 'Development only', TRUE
  WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE name = 'DEV ONLY - Trainer Portal Membership');
  SELECT id INTO v_plan_id FROM public.plans WHERE name = 'DEV ONLY - Trainer Portal Membership' LIMIT 1;

  INSERT INTO public.classes (name, description, capacity, is_active)
  SELECT seed.name, seed.description, seed.capacity, TRUE
  FROM (VALUES
    ('DEV ONLY - Strength Basics', 'Development fixture class', 20),
    ('DEV ONLY - Cardio Circuit', 'Development fixture class', 20),
    ('DEV ONLY - Mobility Flow', 'Development fixture class', 20)
  ) AS seed(name, description, capacity)
  WHERE NOT EXISTS (SELECT 1 FROM public.classes c WHERE c.name = seed.name);
  SELECT array_agg(c.id ORDER BY c.name) INTO v_class_ids FROM public.classes c
  WHERE c.name IN ('DEV ONLY - Strength Basics', 'DEV ONLY - Cardio Circuit', 'DEV ONLY - Mobility Flow');

  FOR i IN 1..10 LOOP
    v_code := 'DEV-TRAINER-' || lpad(i::text, 3, '0');
    v_first := v_names[i][1];
    v_last := v_names[i][2];
    INSERT INTO public.customers (id, user_id, customer_code, first_name, last_name, email, phone, join_date, status)
    SELECT (substr(md5('powerplus-dev-trainer-' || i),1,8) || '-' || substr(md5('powerplus-dev-trainer-' || i),9,4) || '-4' || substr(md5('powerplus-dev-trainer-' || i),14,3) || '-a' || substr(md5('powerplus-dev-trainer-' || i),18,3) || '-' || substr(md5('powerplus-dev-trainer-' || i),21,12))::uuid,
      NULL, v_code, v_first, v_last, 'trainer-seed-' || lpad(i::text, 3, '0') || '@example.invalid',
      '000000' || lpad(i::text, 4, '0'), CURRENT_DATE, 'ACTIVE'
    WHERE NOT EXISTS (SELECT 1 FROM public.customers WHERE customer_code = v_code);
    SELECT id INTO v_customer_id FROM public.customers WHERE customer_code = v_code;
    IF NOT EXISTS (SELECT 1 FROM public.memberships WHERE customer_id = v_customer_id AND plan_id = v_plan_id) THEN
      INSERT INTO public.memberships (customer_id, plan_id, start_date, end_date, status, price_at_purchase)
      VALUES (v_customer_id, v_plan_id, CURRENT_DATE, CURRENT_DATE + 30, 'ACTIVE', 1);
    ELSE
      UPDATE public.memberships SET start_date = CURRENT_DATE, end_date = CURRENT_DATE + 30, status = 'ACTIVE'
      WHERE customer_id = v_customer_id AND plan_id = v_plan_id;
    END IF;
  END LOOP;

  FOR i IN 0..6 LOOP
    v_class_id := v_class_ids[(i % 3) + 1];
    v_trainer_id := v_trainer_ids[(i % 2) + 1];
    v_start := (CURRENT_DATE + i)::date + time '07:00';
    INSERT INTO public.class_schedules (class_id, trainer_id, start_at, end_at, capacity, status)
    SELECT v_class_id, v_trainer_id, v_start, v_start + INTERVAL '1 hour', 20, 'ACTIVE'
    WHERE NOT EXISTS (SELECT 1 FROM public.class_schedules
      WHERE class_id = v_class_id AND trainer_id = v_trainer_id AND start_at = v_start);
    SELECT id INTO v_schedule_id FROM public.class_schedules
      WHERE class_id = v_class_id AND trainer_id = v_trainer_id AND start_at = v_start LIMIT 1;

    FOR j IN 1..10 LOOP
      IF (j + i) % 2 = 0 THEN
        v_code := 'DEV-TRAINER-' || lpad(j::text, 3, '0');
        SELECT id INTO v_customer_id FROM public.customers WHERE customer_code = v_code;
        IF NOT EXISTS (SELECT 1 FROM public.class_bookings WHERE class_schedule_id = v_schedule_id AND customer_id = v_customer_id) THEN
          INSERT INTO public.class_bookings (class_schedule_id, customer_id, status, booked_at)
          VALUES (v_schedule_id, v_customer_id, 'BOOKED', now());
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

COMMIT;
