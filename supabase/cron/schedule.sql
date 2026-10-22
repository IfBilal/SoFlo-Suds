-- Supabase Cron schedule for the cron-worker Edge Function. NOT a migration: it holds
-- environment-specific values and must be run by hand per environment (staging first).
-- Prerequisites: extensions pg_cron, pg_net and Vault enabled; `supabase functions deploy cron-worker`;
-- `supabase secrets set CRON_SECRET=<random 32+ chars> URABLE_API_KEY=... ADMIN_ORIGINS=...`.
-- DISABLE THE LEGACY API SCHEDULER (`npm run sync:once`) BEFORE RUNNING THIS: only one writer may award points.

select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'soflo_project_url');
select vault.create_secret('SAME-VALUE-AS-THE-CRON_SECRET-FUNCTION-SECRET', 'soflo_cron_secret');

select cron.schedule('soflo-worker', '*/5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'soflo_project_url') || '/functions/v1/cron-worker',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'soflo_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
$$);

-- Inspect:   select * from cron.job_run_details order by start_time desc limit 10;
-- Last run:  select name, last_run_at, last_stats, lease_until from public.sync_state;
-- Roll back: select cron.unschedule('soflo-worker');
