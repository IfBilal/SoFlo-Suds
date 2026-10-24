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

/** Wording for the codes the `soflo-auth` login endpoint returns. */
export function loginErrorMessage(code?: string): string {
  if (code === 'LOGIN_RATE_LIMITED') return LOGIN_LOCKED;
  if (code === 'INVALID_CREDENTIALS') return 'Email or password is incorrect.';
  if (code === 'EMAIL_NOT_CONFIRMED') return authMessages.email_not_confirmed;
  if (code === 'VALIDATION_FAILED') return 'Enter a valid email and your password.';
  return 'Could not log in. Please try again.';
}
