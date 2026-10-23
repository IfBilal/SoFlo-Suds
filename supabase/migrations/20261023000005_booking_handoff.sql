-- A virtual-shop checkout may create a second Urable customer with the same
-- verified email. Keep a server-owned snapshot so a later poll can distinguish
-- the new job from older jobs without trusting timestamps or IDs from the app.
CREATE TABLE booking_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  existing_job_ids text[] NOT NULL DEFAULT '{}',
  matched_job_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_handoffs_user_idx ON booking_handoffs(user_id, created_at DESC);
ALTER TABLE booking_handoffs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON booking_handoffs FROM PUBLIC, anon, authenticated;
GRANT ALL ON booking_handoffs TO service_role;
