-- Undo 20261024000010_booking_extras (rewards/products on a booking). Drops only data created by that feature.
DROP TABLE IF EXISTS public.next_booking_products;
DROP TABLE IF EXISTS public.booking_products;
DROP INDEX IF EXISTS public.reward_redemptions_one_per_job_idx;
ALTER TABLE public.reward_redemptions DROP COLUMN IF EXISTS applied_job_id;
