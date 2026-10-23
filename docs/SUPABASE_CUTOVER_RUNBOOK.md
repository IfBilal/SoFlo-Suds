# Release and rollback runbook

The Supabase backend was deployed to an empty active project after Ali's verbal stack approval. This runbook records what is already live and the gates still required before the app is released to customers. Ali's written confirmation is pending. See [migration status](SUPABASE_MIGRATION_STATUS.md) and [end-to-end QA](END_TO_END_QA.md).

## Preconditions
1. Attach Ali's written acceptance to [ADR 0001](adr/0001-supabase-backend.md), including the live shop's deposit/fee rule and controlled Urable checkout conditions.
2. Run the complete [QA sequence](END_TO_END_QA.md) on installed Android/iOS builds. A separate staging project or local Supabase stack remains desirable for rehearsal.
3. Before customer release, record a database/Auth/Storage backup and prove restore in a separate environment; save the deployed Function versions. The live project had no preexisting app users at initial deployment.

## Order of operations
1. **Already done:** initial live audit (zero users), migrations 001-004, original Functions, Function secrets, Auth SMTP/redirect settings, Cron, owner admin, hosted admin site and migration 005. No legacy scheduler is running and no legacy users need migration.
2. Obtain a Supabase CLI session or access token with Function deploy permission for project `tocofoxugjkaytxuxyzb`; the current CLI login gets HTTP 403. Deploy the new `soflo-api` and `cron-worker` code. Do not distribute the new booking APK until both functions are live.
3. Confirm `POST /bookings/handoff` requires a verified customer JWT, `GET /bookings/handoff/latest` returns only that customer's attempt, and a controlled checkout links the correct new Urable job. Observe two Cron cycles and linked payment/status updates.
4. Sign into the hosted admin site in a real browser and exercise the handbook's admin actions. Add the client admin with `bootstrap-admin.mjs`, then deactivate the temporary owner admin when handover is complete.
5. Build the APK/admin bundle with production public values (`EXPO_PUBLIC_SUPABASE_*` / `VITE_SUPABASE_*`). Install on a second phone with the **laptop off and mobile data on**; complete the full QA matrix and compare every required screen with the client concept.
6. Finish the privacy policy, store assets, account access, rollback drill and store submissions.

## Rollback
- Unschedule Cron: `select cron.unschedule('soflo-worker')`; re-enable the legacy scheduler only if its Fastify runtime is actually deployed and configured. Roll back Functions to the prior known-good version; avoid deleting a Function used by an installed APK.
- Distribute the previous (`main`) APK and admin build. **Already installed new APKs do not retarget themselves.**
- Leave `auth_user_id` columns/policies; they are inert. Do **not** delete Auth users that real customers signed up with; plan a supported transition instead.
- Never `git reset --hard` shared work, and never `supabase db reset --linked`.
