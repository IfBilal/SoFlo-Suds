const authMessages: Record<string, string> = {
  invalid_credentials: 'Email or password is incorrect.',
  email_not_confirmed: 'Please confirm your email first. Check your inbox for the link.',
  user_already_exists: 'This email already has an account.',
  email_exists: 'This email already has an account.',
  weak_password: 'Choose a stronger password (at least 8 characters).',
  over_request_rate_limit: 'Too many attempts. Please wait a few minutes and try again.',
  over_email_send_rate_limit: 'Too many emails requested. Please wait a few minutes and try again.',
};
export const LOGIN_LOCKED = 'Too many failed attempts. Please wait 15 minutes, or reset your password.';

/** Never surface raw Supabase Auth messages; the one exception is recognised and replaced with our own wording. */
export function authMessage(error: { code?: string; message?: string } | null | undefined, fallback: string): string {
  // The server-side login rate limit (handbook 7) rejects with its own message, whatever error code Auth wraps it in.
  if (/too many failed attempts/i.test(error?.message ?? '')) return LOGIN_LOCKED;
  return (error?.code && authMessages[error.code]) || fallback;
}
