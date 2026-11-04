-- Migration: 20261104120500_search_admin_email_references.sql

CREATE OR REPLACE FUNCTION public.search_admin_email_references()
RETURNS TABLE(table_name text, column_name text, match_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  query_str TEXT;
  cnt BIGINT;
BEGIN
  FOR rec IN (
    SELECT c.table_name::TEXT as t_name, c.column_name::TEXT as c_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = 'public'
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.data_type IN ('text', 'character varying')
  ) LOOP
    query_str := format('SELECT count(*) FROM public.%I WHERE %I ILIKE %L', rec.t_name, rec.c_name, '%poweplus100@gmail.com%');
    BEGIN
      EXECUTE query_str INTO cnt;
      IF cnt > 0 THEN
        table_name := rec.t_name;
        column_name := rec.c_name;
        match_count := cnt;
        RETURN NEXT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- ignore tables with casting or access issues
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_admin_email_references() TO anon, authenticated;
NOTIFY pgrst, 'reload schema';

