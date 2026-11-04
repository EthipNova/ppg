-- Migration: 20261104120300_check_staff_account_links.sql

CREATE OR REPLACE FUNCTION public.check_user_references()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_staff_58 JSONB;
  v_trainer_58 JSONB;
  v_customer_58 JSONB;
  v_staff_b4 JSONB;
  v_trainer_b4 JSONB;
  v_customer_b4 JSONB;
BEGIN
  SELECT jsonb_agg(to_jsonb(s)) INTO v_staff_58
  FROM public.staff_profiles s WHERE user_id = '58122e97-7799-4e05-a8c1-a63e8573cc19';

  SELECT jsonb_agg(to_jsonb(t)) INTO v_trainer_58
  FROM public.trainer_profiles t WHERE user_id = '58122e97-7799-4e05-a8c1-a63e8573cc19';

  SELECT jsonb_agg(to_jsonb(c)) INTO v_customer_58
  FROM public.customers c WHERE user_id = '58122e97-7799-4e05-a8c1-a63e8573cc19';

  SELECT jsonb_agg(to_jsonb(s)) INTO v_staff_b4
  FROM public.staff_profiles s WHERE user_id = 'b4fe64fe-d0c3-4746-a2b2-7bea47baecbb';

  SELECT jsonb_agg(to_jsonb(t)) INTO v_trainer_b4
  FROM public.trainer_profiles t WHERE user_id = 'b4fe64fe-d0c3-4746-a2b2-7bea47baecbb';

  SELECT jsonb_agg(to_jsonb(c)) INTO v_customer_b4
  FROM public.customers c WHERE user_id = 'b4fe64fe-d0c3-4746-a2b2-7bea47baecbb';

  RETURN jsonb_build_object(
    'user_5812_staff', COALESCE(v_staff_58, '[]'::jsonb),
    'user_5812_trainer', COALESCE(v_trainer_58, '[]'::jsonb),
    'user_5812_customer', COALESCE(v_customer_58, '[]'::jsonb),
    'user_b4fe_staff', COALESCE(v_staff_b4, '[]'::jsonb),
    'user_b4fe_trainer', COALESCE(v_trainer_b4, '[]'::jsonb),
    'user_b4fe_customer', COALESCE(v_customer_b4, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_user_references() TO anon, authenticated;
NOTIFY pgrst, 'reload schema';

