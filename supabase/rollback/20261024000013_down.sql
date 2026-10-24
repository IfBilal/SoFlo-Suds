-- Reverse 20261024000013: back to the 7-argument record_job (no refund/cancel reversal, phone-only referral check).
DROP FUNCTION IF EXISTS soflo_private.record_job(uuid, text, text, text, text, timestamptz, bigint, text);
CREATE OR REPLACE FUNCTION soflo_private.record_job(
  p_user uuid, p_job text, p_vehicle text, p_status text, p_payment text,
  p_scheduled timestamptz, p_amount_paid_cents bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_old public.job_sync%ROWTYPE; v_is_new boolean; v_credited integer := 0; v_reversed integer := 0;
  v_rate numeric := 0; v_ref public.referrals%ROWTYPE; v_ref_points integer := 0; v_marked integer; v_reject text;
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
        v_reject := NULL;
        IF EXISTS (SELECT 1 FROM public.users a JOIN public.users b ON a.phone IS NOT NULL AND a.phone <> '' AND a.phone = b.phone
                   WHERE a.id = v_ref.referrer_id AND b.id = v_ref.referee_id) THEN
          v_reject := 'duplicate_phone';
        ELSIF (SELECT count(*) FROM public.referrals WHERE referrer_id = v_ref.referrer_id AND status = 'rewarded'
                 AND rewarded_at >= date_trunc('month', now()))
              >= COALESCE((SELECT (value #>> '{}')::int FROM public.settings WHERE key = 'referral_monthly_cap'), 20) THEN
          v_reject := 'monthly_cap';
        END IF;
        IF v_reject IS NOT NULL THEN
          UPDATE public.referrals SET status = 'rejected', reject_reason = v_reject, qualifying_job_id = p_job WHERE id = v_ref.id;
        ELSE
          SELECT COALESCE((value #>> '{}')::int, 0) INTO v_ref_points FROM public.settings WHERE key = 'referral_reward_points';
          UPDATE public.referrals SET status = 'rewarded', rewarded_at = now(), qualifying_job_id = p_job WHERE id = v_ref.id;
          IF COALESCE(v_ref_points, 0) > 0 THEN
            INSERT INTO public.points_ledger (user_id, delta, reason, source_key) VALUES
              (v_ref.referrer_id, v_ref_points, 'referral_referrer', v_ref.id::text),
              (v_ref.referee_id,  v_ref_points, 'referral_referee',  v_ref.id::text) ON CONFLICT DO NOTHING;
          END IF;
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


REVOKE ALL ON FUNCTION soflo_private.record_job(uuid, text, text, text, text, timestamptz, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION soflo_private.record_job(uuid, text, text, text, text, timestamptz, bigint) TO service_role;

CREATE OR REPLACE FUNCTION soflo_private.delete_account(p_user uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_auth uuid;
BEGIN
  SELECT auth_user_id INTO v_auth FROM public.users WHERE id = p_user AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  DELETE FROM public.push_tokens WHERE user_id = p_user;
  UPDATE public.users SET name = 'Deleted customer', email = id::text || '@deleted.invalid', phone = '',
    deleted_at = now(), updated_at = now() WHERE id = p_user;
  RETURN v_auth;
END $$;
REVOKE ALL ON FUNCTION soflo_private.delete_account(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION soflo_private.delete_account(uuid) TO service_role;

ALTER TABLE public.job_sync DROP COLUMN IF EXISTS payment_fingerprint;
ALTER TABLE public.users DROP COLUMN IF EXISTS device_id;
