-- Phase 1: Supabase Auth identity mapping and reviewed client access.
-- Additive only. Legacy password/session tables are frozen, not dropped.

-- 1. Identity mapping. users.id / admins.id (and every FK to them) are kept; a
-- Supabase Auth identity maps to exactly one app row through a unique column.
ALTER TABLE users  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
-- Supabase Auth owns credentials now; new rows carry no password hash.
ALTER TABLE users  ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE admins ALTER COLUMN password_hash DROP NOT NULL;

-- 2. Private helper schema. Not exposed through PostgREST, so nothing in it is
-- callable as an RPC from a client.
CREATE SCHEMA IF NOT EXISTS soflo_private;
REVOKE ALL ON SCHEMA soflo_private FROM PUBLIC;
GRANT USAGE ON SCHEMA soflo_private TO authenticated, service_role;

-- Verified Auth UID -> app user id. Deleted customers resolve to NULL.
CREATE OR REPLACE FUNCTION soflo_private.current_user_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT u.id FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.deleted_at IS NULL $$;
REVOKE ALL ON FUNCTION soflo_private.current_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soflo_private.current_user_id() TO authenticated, service_role;

-- 3. Default deny stays. Remove every blanket grant Supabase's default
-- privileges gave the client roles, then add back only reviewed access.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- 4. Customer reads. Writes are never granted: every mutation goes through the
-- soflo-api Edge Function, which validates input and enforces ownership.

-- users: own non-sensitive columns only (never password_hash, urable id, referred_by, auth_user_id).
GRANT SELECT (id, name, email, phone, referral_code, notification_appointments, notification_promos, created_at) ON users TO authenticated;
CREATE POLICY users_select_own ON users FOR SELECT TO authenticated
  USING (auth_user_id = (SELECT auth.uid()) AND deleted_at IS NULL);

GRANT SELECT ON points_ledger TO authenticated;
CREATE POLICY points_select_own ON points_ledger FOR SELECT TO authenticated
  USING (user_id = (SELECT soflo_private.current_user_id()));

GRANT SELECT ON reward_redemptions TO authenticated;
CREATE POLICY redemptions_select_own ON reward_redemptions FOR SELECT TO authenticated
  USING (user_id = (SELECT soflo_private.current_user_id()));

GRANT SELECT ON rewards TO authenticated;
CREATE POLICY rewards_select_active ON rewards FOR SELECT TO authenticated
  USING (active OR EXISTS (SELECT 1 FROM reward_redemptions r WHERE r.reward_id = rewards.id AND r.user_id = (SELECT soflo_private.current_user_id())));

GRANT SELECT (id, title, caption, tag, before_path, after_path, display_order) ON gallery TO authenticated;
CREATE POLICY gallery_select_published ON gallery FOR SELECT TO authenticated USING (published);

GRANT SELECT (id, name, brand, category, description, price_cents, image_path) ON shop_products TO authenticated;
CREATE POLICY shop_products_select_active ON shop_products FOR SELECT TO authenticated USING (active);

-- 5. Public shop contact details, via a function so settings stays closed.
CREATE OR REPLACE FUNCTION public.shop_config() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT COALESCE(jsonb_object_agg(s.key, s.value), '{}'::jsonb) FROM public.settings s
      WHERE s.key IN ('shop_address','shop_phone','shop_email','mobile_area_text','min_app_version','shop_timezone') $$;
REVOKE ALL ON FUNCTION public.shop_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shop_config() TO anon, authenticated;

-- 6. Gallery storage: published images are public to read (bucket is public);
-- clients get no write policy. Admin uploads go through the Edge Function.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('gallery', 'gallery', true, 10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 10485760, allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];
