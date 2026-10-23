-- Public shop config also exposes an optional maintenance message (blank = app is up).
CREATE OR REPLACE FUNCTION public.shop_config() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT COALESCE(jsonb_object_agg(s.key, s.value), '{}'::jsonb) FROM public.settings s
      WHERE s.key IN ('shop_address','shop_phone','shop_email','mobile_area_text','min_app_version','shop_timezone','maintenance_message') $$;
