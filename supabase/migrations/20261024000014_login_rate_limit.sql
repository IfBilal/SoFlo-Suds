-- Handbook 7: login attempts are rate limited (5 per 15 minutes). Supabase Auth calls this hook on every password check;
-- after 5 failures in 15 minutes the account refuses logins (even the right password) until the window passes or the
-- password is reset by email. Only a count and a timestamp are kept, and rows older than a day are removed.
CREATE TABLE IF NOT EXISTS public.login_failures (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_failures_user_at_idx ON public.login_failures (user_id, at DESC);
ALTER TABLE public.login_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_failures FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hook_password_verification_attempt(event jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user uuid := (event ->> 'user_id')::uuid; v_fails integer;
BEGIN
  SELECT count(*) INTO v_fails FROM public.login_failures WHERE user_id = v_user AND at > now() - interval '15 minutes';
  IF v_fails >= 5 THEN
    RETURN jsonb_build_object('decision', 'reject', 'message', 'Too many failed attempts. Please wait 15 minutes or reset your password.');
  END IF;
  IF COALESCE((event ->> 'valid')::boolean, false) THEN
    DELETE FROM public.login_failures WHERE user_id = v_user;
  ELSE
    INSERT INTO public.login_failures (user_id) VALUES (v_user);
    DELETE FROM public.login_failures WHERE at < now() - interval '1 day';
  END IF;
  RETURN jsonb_build_object('decision', 'continue');
END $$;
REVOKE ALL ON FUNCTION public.hook_password_verification_attempt(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hook_password_verification_attempt(jsonb) TO supabase_auth_admin;
GRANT ALL ON public.login_failures TO supabase_auth_admin;
GRANT USAGE, SELECT ON SEQUENCE public.login_failures_id_seq TO supabase_auth_admin;
