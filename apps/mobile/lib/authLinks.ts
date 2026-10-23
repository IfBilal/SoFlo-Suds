/** Why an auth email link cannot be used, from the params Supabase puts on the redirect. Null when it looks usable. */
export function linkProblem(params: { code?: string; error?: string; error_code?: string }): string | null {
  if (params.error_code === 'otp_expired') return 'This link has expired. Request a new one.';
  if (params.error || params.error_code) return 'This link is not valid. Request a new one.';
  if (!params.code) return 'This link is incomplete. Open it from the email on this phone.';
  return null;
}
