-- Undo 20261024000012_retire_legacy_auth: recreate the (empty) legacy auth tables and password columns.
ALTER TABLE public.users  ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE public.admins ADD COLUMN IF NOT EXISTS password_hash text;
CREATE TABLE IF NOT EXISTS public.refresh_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.booking_idempotency (
  key text PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, response jsonb, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.refresh_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.refresh_sessions, public.password_resets, public.booking_idempotency FROM anon, authenticated;
CREATE OR REPLACE FUNCTION soflo_private.delete_account(p_user uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_auth uuid;
BEGIN
  SELECT auth_user_id INTO v_auth FROM public.users WHERE id = p_user AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  DELETE FROM public.refresh_sessions WHERE user_id = p_user;
  DELETE FROM public.push_tokens WHERE user_id = p_user;
  UPDATE public.users SET name = 'Deleted customer', email = id::text || '@deleted.invalid', phone = '',
    password_hash = NULL, deleted_at = now(), updated_at = now() WHERE id = p_user;
  RETURN v_auth;
END $$;
