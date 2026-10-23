-- Wrong-code attempts for the 10-per-user-per-hour limit, and one live promo per booking.
CREATE TABLE IF NOT EXISTS promo_attempts (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS promo_attempts_user_idx ON promo_attempts(user_id, created_at);
ALTER TABLE promo_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON promo_attempts FROM anon, authenticated;
REVOKE ALL ON SEQUENCE promo_attempts_id_seq FROM anon, authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS promo_uses_one_live_per_job ON promo_uses(urable_job_id) WHERE status IN ('reserved','applied');
