# ADR 0001: Supabase-hosted backend instead of a separate Node API

**Status: PROPOSED. Awaiting Ali's written decision.** Do not cut over until this says *Accepted*. If *Rejected*, `main` (Fastify) remains the implementation and this branch is not merged.

## Context
The handbook (§2) sketches a Node API (Express or Fastify), custom JWTs, and Render/Railway hosting. An installed APK needs a publicly reachable backend; running our own API host is an operational cost the client wants to avoid. Supabase already hosts the database and storage.

## Decision proposed
Run the backend on Supabase: Auth, Postgres/RLS, Edge Functions (Urable adapter and privileged rules), Storage, Cron. The handbook's **features, business rules, security outcomes and acceptance** are unchanged; only the implementation choice changes.

## Consequences
- No Node process to host; the admin Vite app still needs static hosting.
- Auth, rate limiting and password recovery are Supabase's; password hashes cannot be migrated, so existing customers reset once.
- Edge Function limits require bounded, leased sync batches (implemented).
- Direct DB access from functions bypasses RLS, so ownership checks are in code and tested (`supabase/functions/tests`).

## Decision record
| Date | Decision | By |
| --- | --- | --- |
| _pending_ | _Accepted / Rejected_ | Ali |
