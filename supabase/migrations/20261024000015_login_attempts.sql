-- Supabase's password-verification hook is not available on this plan, so the handbook's login limit (section 7:
-- 5 attempts per 15 minutes per IP + email) is enforced by the `soflo-auth` Edge Function instead. It records only
-- failed logins (email, IP, time); rows older than a day are removed as new failures arrive. A second cap of 20 failures
-- per email per 15 minutes bounds attacks that rotate IP addresses.
DROP FUNCTION IF EXISTS public.hook_password_verification_attempt(jsonb);
DROP TABLE IF EXISTS public.login_failures;
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id bigserial PRIMARY KEY,
  email text NOT NULL,
  ip text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_email_at_idx ON public.login_attempts (email, at DESC);
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_attempts FROM PUBLIC, anon, authenticated;
