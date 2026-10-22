-- Phase 1/4: transaction-safe business rules called by the Edge Functions.
-- All functions pin an empty search_path, schema-qualify every reference and
-- are executable only by service_role (the Edge Functions' trusted context).

-- Scheduler checkpoint + lease so Cron runs resume in bounded batches and can
-- never overlap. RLS on, no policies: only the trusted role touches it.
CREATE TABLE IF NOT EXISTS sync_state (
  name text PRIMARY KEY,
  cursor uuid,
  lease_until timestamptz,
  last_run_at timestamptz,
  last_stats jsonb
);
ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sync_state FROM anon, authenticated;
INSERT INTO sync_state (name) VALUES ('jobs') ON CONFLICT DO NOTHING;

-- Take the lease and return the saved cursor; no row means another run holds it.
CREATE OR REPLACE FUNCTION soflo_private.claim_sync_lease(p_name text, p_seconds integer)
RETURNS TABLE(claimed boolean, cursor uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.sync_state s SET lease_until = now() + make_interval(secs => p_seconds)
  WHERE s.name = p_name AND (s.lease_until IS NULL OR s.lease_until < now())
  RETURNING true, s.cursor;
  IF NOT FOUND THEN RETURN QUERY SELECT false, NULL::uuid; END IF;
END $$;

CREATE OR REPLACE FUNCTION soflo_private.finish_sync_lease(p_name text, p_cursor uuid, p_stats jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$ UPDATE public.sync_state SET cursor = p_cursor, lease_until = NULL, last_run_at = now(), last_stats = p_stats WHERE name = p_name $$;

-- Customer profile completion after Supabase Auth signup. Idempotent: a second
-- call for the same Auth user returns the existing row. Never links by email.
CREATE OR REPLACE FUNCTION soflo_private.complete_profile(
  p_auth_user_id uuid, p_email text, p_name text, p_phone text,
  p_urable_customer_id text, p_referral_code text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_id uuid; v_referrer uuid; v_code text; v_email text := lower(p_email);
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; v_bytes bytea; i int; tries int := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('complete_profile:' || p_auth_user_id::text));
  SELECT id INTO v_id FROM public.users WHERE auth_user_id = p_auth_user_id AND deleted_at IS NULL;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE lower(email) = v_email AND deleted_at IS NULL) THEN
    IF EXISTS (SELECT 1 FROM public.users WHERE lower(email) = v_email AND deleted_at IS NULL AND auth_user_id IS NULL)
      THEN RAISE EXCEPTION 'ACCOUNT_NEEDS_MIGRATION'; END IF;
    RAISE EXCEPTION 'EMAIL_TAKEN';
  END IF;
  IF p_referral_code IS NOT NULL AND p_referral_code <> '' THEN
    SELECT id INTO v_referrer FROM public.users WHERE referral_code = upper(p_referral_code) AND deleted_at IS NULL;
    IF v_referrer IS NULL THEN RAISE EXCEPTION 'REFERRAL_INVALID'; END IF;
  END IF;
  LOOP
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex'); v_code := '';
    FOR i IN 0..5 LOOP v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE referral_code = v_code);
    tries := tries + 1; IF tries > 20 THEN RAISE EXCEPTION 'REFERRAL_CODE_EXHAUSTED'; END IF;
  END LOOP;
  INSERT INTO public.users (auth_user_id, urable_customer_id, name, email, phone, referral_code, referred_by)
  VALUES (p_auth_user_id, p_urable_customer_id, p_name, v_email, p_phone, v_code, v_referrer)
  RETURNING id INTO v_id;
  IF v_referrer IS NOT NULL THEN INSERT INTO public.referrals (referrer_id, referee_id) VALUES (v_referrer, v_id); END IF;
  RETURN v_id;
END $$;

-- Account deletion: anonymize, drop push tokens and legacy sessions. Returns the
-- Auth identity so the Edge Function can remove it. Urable records are retained.
CREATE OR REPLACE FUNCTION soflo_private.delete_account(p_user uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_auth uuid;
BEGIN
  SELECT auth_user_id INTO v_auth FROM public.users WHERE id = p_user AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  DELETE FROM public.refresh_sessions WHERE user_id = p_user;
  DELETE FROM public.push_tokens WHERE user_id = p_user;
  UPDATE public.users SET name = 'Deleted customer', email = id::text || '@deleted.invalid', phone = '',
    password_hash = NULL, deleted_at = now(), updated_at = now() WHERE id = p_user;
  RETURN v_auth;
END $$;

-- Atomic reward redemption: serialized per user, balance computed server-side.
CREATE OR REPLACE FUNCTION soflo_private.redeem_reward(p_user uuid, p_reward uuid)
RETURNS TABLE(id uuid, code text, status text, reward_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_reward public.rewards%ROWTYPE; v_balance integer; v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('points:' || p_user::text));
  SELECT * INTO v_reward FROM public.rewards r WHERE r.id = p_reward AND r.active;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT COALESCE(sum(delta), 0)::int INTO v_balance FROM public.points_ledger WHERE user_id = p_user;
  IF v_balance < v_reward.points_cost THEN RAISE EXCEPTION 'INSUFFICIENT_POINTS'; END IF;
  INSERT INTO public.reward_redemptions (user_id, reward_id, code)
  VALUES (p_user, p_reward, upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)))
  RETURNING reward_redemptions.id INTO v_id;
  INSERT INTO public.points_ledger (user_id, delta, reason, source_key) VALUES (p_user, -v_reward.points_cost, 'redeem', v_id::text);
  RETURN QUERY SELECT rr.id, rr.code, rr.status, v_reward.name FROM public.reward_redemptions rr WHERE rr.id = v_id;
END $$;

-- Upsert one Urable job for a user and apply every point rule in ONE transaction:
--  * completed AND paid with an amount credits once (marker + unique ledger key)
--  * the referee's first such job settles a pending referral for both sides once
--  * a later refund writes one compensating entry
-- Returns what changed so the caller can notify exactly once.
CREATE OR REPLACE FUNCTION soflo_private.record_job(
  p_user uuid, p_job text, p_vehicle text, p_status text, p_payment text,
  p_scheduled timestamptz, p_amount_paid_cents bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_old public.job_sync%ROWTYPE; v_is_new boolean; v_credited integer := 0; v_reversed integer := 0;
  v_rate numeric := 0; v_ref public.referrals%ROWTYPE; v_ref_points integer := 0; v_marked integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('points:' || p_user::text));
  SELECT * INTO v_old FROM public.job_sync WHERE urable_job_id = p_job;
  IF FOUND AND v_old.user_id <> p_user THEN RETURN jsonb_build_object('skipped', true); END IF;
  v_is_new := NOT FOUND;
  INSERT INTO public.job_sync (user_id, urable_job_id, urable_vehicle_id, last_status, payment_status, scheduled_at)
  VALUES (p_user, p_job, p_vehicle, p_status, p_payment, p_scheduled)
  ON CONFLICT (urable_job_id) DO UPDATE SET last_status = EXCLUDED.last_status,
    payment_status = EXCLUDED.payment_status, scheduled_at = EXCLUDED.scheduled_at, updated_at = now()
  WHERE public.job_sync.user_id = EXCLUDED.user_id;

  IF lower(p_status) = 'completed' AND p_payment = 'paid' AND COALESCE(p_amount_paid_cents, 0) > 0 THEN
    UPDATE public.job_sync SET completed_paid_at = now()
      WHERE urable_job_id = p_job AND user_id = p_user AND completed_paid_at IS NULL;
    GET DIAGNOSTICS v_marked = ROW_COUNT;
    IF v_marked > 0 THEN
      SELECT COALESCE((value #>> '{}')::numeric, 0) INTO v_rate FROM public.settings WHERE key = 'points_per_usd';
      v_credited := floor(p_amount_paid_cents / 100.0 * COALESCE(v_rate, 0))::int;
      IF v_credited > 0 THEN
        INSERT INTO public.points_ledger (user_id, delta, reason, source_key) VALUES (p_user, v_credited, 'job_completed', p_job)
        ON CONFLICT DO NOTHING;
      END IF;
      SELECT * INTO v_ref FROM public.referrals WHERE referee_id = p_user AND status = 'pending' FOR UPDATE;
      IF FOUND THEN
        SELECT COALESCE((value #>> '{}')::int, 0) INTO v_ref_points FROM public.settings WHERE key = 'referral_reward_points';
        UPDATE public.referrals SET status = 'rewarded', rewarded_at = now(), qualifying_job_id = p_job WHERE id = v_ref.id;
        IF COALESCE(v_ref_points, 0) > 0 THEN
          INSERT INTO public.points_ledger (user_id, delta, reason, source_key) VALUES
            (v_ref.referrer_id, v_ref_points, 'referral_referrer', v_ref.id::text),
            (v_ref.referee_id,  v_ref_points, 'referral_referee',  v_ref.id::text) ON CONFLICT DO NOTHING;
        END IF;
      END IF;
    END IF;
  ELSIF p_payment = 'refunded' THEN
    SELECT COALESCE(sum(delta), 0)::int INTO v_reversed FROM public.points_ledger
      WHERE user_id = p_user AND reason = 'job_completed' AND source_key = p_job;
    IF v_reversed > 0 THEN
      INSERT INTO public.points_ledger (user_id, delta, reason, source_key) VALUES (p_user, -v_reversed, 'job_reversed', p_job)
      ON CONFLICT DO NOTHING;
    ELSE v_reversed := 0; END IF;
  END IF;
  RETURN jsonb_build_object('isNew', v_is_new, 'oldStatus', v_old.last_status, 'credited', v_credited, 'reversed', v_reversed);
END $$;

-- Execute rights: trusted role only.
REVOKE ALL ON FUNCTION soflo_private.claim_sync_lease(text, integer), soflo_private.finish_sync_lease(text, uuid, jsonb),
  soflo_private.complete_profile(uuid, text, text, text, text, text), soflo_private.delete_account(uuid),
  soflo_private.redeem_reward(uuid, uuid),
  soflo_private.record_job(uuid, text, text, text, text, timestamptz, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION soflo_private.claim_sync_lease(text, integer), soflo_private.finish_sync_lease(text, uuid, jsonb),
  soflo_private.complete_profile(uuid, text, text, text, text, text), soflo_private.delete_account(uuid),
  soflo_private.redeem_reward(uuid, uuid),
  soflo_private.record_job(uuid, text, text, text, text, timestamptz, bigint) TO service_role;
