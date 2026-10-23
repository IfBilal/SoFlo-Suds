# ADR 0001: Supabase-hosted backend instead of a separate Node API

**Status: ACCEPTED. Ali approved the stack change; the project owner confirmed the approval again on 23 October 2026.** Acceptance lifts the architecture block only. Cutover still requires the gates in the [runbook](../SUPABASE_CUTOVER_RUNBOOK.md): live audit, backup/restore proof, staging pass, and approval of production Auth settings, sender and controlled Urable checkout.

## Context
The handbook (§2) sketches a Node API (Express or Fastify), custom JWTs, and Render/Railway hosting. An installed APK needs a publicly reachable backend; running our own API host is an operational cost the client wants to avoid. Supabase already hosts the database and storage.

## Decision
Run the backend on Supabase: Auth, Postgres/RLS, Edge Functions (Urable adapter and privileged rules), Storage, Cron. The handbook's **features, business rules, security outcomes and acceptance** are unchanged; only the implementation choice changes.

## Consequences
- No Node process to host; the admin Vite app still needs static hosting.
- Auth, rate limiting and password recovery are Supabase's; password hashes cannot be migrated, so existing customers reset once.
- Edge Function limits require bounded, leased sync batches (implemented).
- Direct DB access from functions bypasses RLS, so ownership checks are in code and tested (`supabase/functions/tests`).

## Decision record
| Date | Decision | By |
| --- | --- | --- |
| 2026-10-22 | Accepted: handbook tech stack may change to Supabase-hosted backend (relayed) | Ali, via project owner |
| 2026-10-23 | Approval re-confirmed by the project owner; no further sign-off is being waited on | Project owner |
