-- Reverse 20261024000014: disable the hook in Auth first (Dashboard > Auth > Hooks), then drop it.
DROP FUNCTION IF EXISTS public.hook_password_verification_attempt(jsonb);
DROP TABLE IF EXISTS public.login_failures;
