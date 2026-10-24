-- Retire the pre-Supabase Node API's auth storage. Supabase Auth owns identities now; these tables and
-- password columns held no live data (verified empty before this migration) and must not linger as an attack surface.
CREATE OR REPLACE FUNCTION soflo_private.delete_account(p_user uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_auth uuid;
BEGIN
  SELECT auth_user_id INTO v_auth FROM public.users WHERE id = p_user AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  DELETE FROM public.push_tokens WHERE user_id = p_user;
  UPDATE public.users SET name = 'Deleted customer', email = id::text || '@deleted.invalid', phone = '',
    deleted_at = now(), updated_at = now() WHERE id = p_user;
  RETURN v_auth;
END $$;
REVOKE ALL ON FUNCTION soflo_private.delete_account(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION soflo_private.delete_account(uuid) TO service_role;

DROP TABLE IF EXISTS public.refresh_sessions;
DROP TABLE IF EXISTS public.password_resets;
DROP TABLE IF EXISTS public.booking_idempotency;
ALTER TABLE public.users  DROP COLUMN IF EXISTS password_hash;
ALTER TABLE public.admins DROP COLUMN IF EXISTS password_hash;
