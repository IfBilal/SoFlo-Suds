-- Rewards and shop products attached to a booking (handbook 4.2 step 6, 4.5, 4.9).
-- A redemption is attached to at most one live booking; a product is added to a booking once.
ALTER TABLE reward_redemptions ADD COLUMN IF NOT EXISTS applied_job_id text;
CREATE UNIQUE INDEX IF NOT EXISTS reward_redemptions_one_per_job_idx ON reward_redemptions(applied_job_id) WHERE applied_job_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS booking_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  urable_job_id text NOT NULL,
  product_id text NOT NULL,
  name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  as_line_item boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (urable_job_id, product_id)
);

-- "Add to next booking" from the Shop screen: applied when the next booking is linked.
CREATE TABLE IF NOT EXISTS next_booking_products (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
ALTER TABLE booking_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_booking_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON booking_products, next_booking_products FROM anon, authenticated;
