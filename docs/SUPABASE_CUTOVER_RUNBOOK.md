# Cutover and rollback runbook (do not start before Ali approves the ADR)

## Preconditions
1. [ADR 0001](adr/0001-supabase-backend.md) says **Accepted**, signed by Ali; production Auth settings, sender address, admin identity and controlled Urable checkout conditions approved.
2. Staging (separate project or local stack) has passed: `npm run test:backend`, then the same flows on real devices.
3. Backup taken and a **restore proven in a separate database**: `pg_dump` of `public` plus Auth users and Storage objects; list of deployed function versions.

## Order of operations
1. Audit the live project (read-only): account/admin/session counts, test vs real, Auth settings, extensions.
2. Disable the legacy scheduler (`npm run sync:once` host). Only one writer may award points or send pushes.
3. `supabase db push` the four migrations to production. They are additive; legacy tables stay.
4. Deploy functions and secrets (see [setup](SUPABASE_SETUP.md)). `curl .../functions/v1/health`.
5. `bootstrap-admin.mjs`, sign in on the deployed admin site.
6. Legacy customers: `migrate-legacy-users.mjs` dry run → `--apply --limit 1` → full login/data/logout/reset/delete check on that account → rest, with `--invite` only through the approved channel.
7. Run `supabase/cron/schedule.sql`; watch `cron.job_run_details` and `sync_state` for two cycles.
8. Build the APK/admin bundle with production public values (`EXPO_PUBLIC_SUPABASE_*` / `VITE_SUPABASE_*`); verify the embedded values; install on a second phone, **laptop off, mobile data**: signup, confirm email, login, reset, vehicle, services, rewards.
9. Revoke legacy sessions (`UPDATE refresh_sessions SET revoked_at = now() WHERE revoked_at IS NULL`); keep legacy password columns until retention review.

## Rollback
- Unschedule Cron: `select cron.unschedule('soflo-worker')`; re-enable the legacy scheduler. Undeploy functions (`supabase functions delete ...`) and rotate any exposed secret.
- Distribute the previous (`main`) APK and admin build. **Already installed new APKs do not retarget themselves.**
- Leave `auth_user_id` columns/policies; they are inert. Do **not** delete Auth users that real customers signed up with; plan a supported transition instead.
- Never `git reset --hard` shared work, and never `supabase db reset --linked`.
