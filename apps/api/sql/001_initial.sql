CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  urable_customer_id text UNIQUE NOT NULL,
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text NOT NULL,
  password_hash text NOT NULL,
  referral_code text UNIQUE NOT NULL,
  referred_by uuid REFERENCES users(id),
  notification_appointments boolean NOT NULL DEFAULT true,
  notification_promos boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS refresh_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_sessions_user_idx ON refresh_sessions(user_id);
CREATE TABLE IF NOT EXISTS password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS job_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  urable_job_id text UNIQUE NOT NULL,
  urable_vehicle_id text NOT NULL,
  service_ids text[] NOT NULL DEFAULT '{}',
  last_status text NOT NULL,
  payment_status text,
  scheduled_at timestamptz,
  completed_paid_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_sync_user_idx ON job_sync(user_id, scheduled_at DESC);
CREATE TABLE IF NOT EXISTS booking_idempotency (
  key text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  request_hash text NOT NULL,
  job_sync_id uuid REFERENCES job_sync(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  kind text NOT NULL CHECK (kind IN ('percent','fixed')),
  value numeric(10,2) NOT NULL CHECK (value > 0),
  min_order_usd numeric(10,2) NOT NULL DEFAULT 0,
  first_booking_only boolean NOT NULL DEFAULT false,
  max_uses_per_user integer,
  max_total_uses integer,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS promo_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id uuid NOT NULL REFERENCES promo_codes(id),
  user_id uuid NOT NULL REFERENCES users(id),
  urable_job_id text,
  status text NOT NULL CHECK (status IN ('reserved','applied','released')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS promo_uses_limit_idx ON promo_uses(promo_id,user_id,status);
CREATE TABLE IF NOT EXISTS points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  delta integer NOT NULL CHECK (delta <> 0),
  reason text NOT NULL,
  source_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,reason,source_key)
);
CREATE INDEX IF NOT EXISTS points_user_idx ON points_ledger(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  points_cost integer NOT NULL CHECK (points_cost > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  reward_id uuid NOT NULL REFERENCES rewards(id),
  code text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','used','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES users(id),
  referee_id uuid UNIQUE NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','rewarded','rejected')),
  reject_reason text,
  qualifying_job_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  rewarded_at timestamptz,
  CHECK (referrer_id <> referee_id)
);
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  urable_job_id text UNIQUE NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text CHECK (length(body) <= 1000),
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gallery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  caption text,
  tag text,
  before_path text NOT NULL,
  after_path text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS warranties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  urable_customer_id text NOT NULL,
  urable_vehicle_id text NOT NULL,
  urable_job_id text NOT NULL,
  product text,
  coverage text,
  applied_on date NOT NULL,
  expires_on date,
  document_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(urable_job_id,urable_vehicle_id)
);
CREATE TABLE IF NOT EXISTS shop_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  brand text,
  category text,
  description text,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  urable_product_id text,
  image_path text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS push_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  event_key text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  sent_at timestamptz,
  UNIQUE(user_id,event_key)
);
CREATE TABLE IF NOT EXISTS admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES admins(id),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO settings (key,value) VALUES ('points_per_usd','1'::jsonb) ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key,value) VALUES ('shop_timezone','"America/New_York"'::jsonb) ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key,value) VALUES ('protection_categories','["ceramic coating","paint protection film","ppf","window tinting","windshield film"]'::jsonb) ON CONFLICT (key) DO NOTHING;

-- This app exposes data only through the Fastify API. Supabase's public schema
-- is reachable through PostgREST, so deny anon/authenticated clients by default.
-- The dedicated server database role uses BYPASSRLS and has grants only on
-- these application tables.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit ENABLE ROW LEVEL SECURITY;
