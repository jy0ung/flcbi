# Supabase Migration Blueprint

## Goal
Move FLC BI from a memory-backed prototype to a Supabase-backed analytics platform without changing the frontend contract or rebuilding the product shell.

## Recommended Architecture
- `Frontend`: keep React + React Query and continue using the typed `/v1` API contract.
- `Domain API`: keep NestJS as the product backend for auth/session translation, governed reads, import orchestration, audit, masking, and exports.
- `Supabase Auth`: primary session provider, ideally behind corporate SSO.
- `Supabase Postgres`: system of record for app, raw, and mart schemas.
- `Supabase Storage`: raw uploads, validation reports, and export artifacts.
- `Supabase Queues`: async dispatch for imports, alerts, and exports.
- `Supabase Cron`: recurring alert evaluation, freshness checks, and reconciliations.
- `Node worker`: heavy XLSX parsing and publish logic; do not force large imports into lightweight edge runtimes.

## Schemas
- `app`: operational tables and entitlements.
- `raw`: immutable imported rows plus validation payloads.
- `mart`: curated read models for the dashboard and explorer.

## Auth Model
- Prefer enterprise sign-in through Supabase Auth plus SAML/OIDC upstream if required by IT.
- Put app claims in JWT `app_metadata`:
  - `company_id`
  - `app_role`
  - `branch_ids`
- Keep the frontend session simple. The browser should hold only the Supabase session and call the Nest API.
- The Nest API should accept the bearer token, resolve the session, and query Supabase with either:
  - a user-scoped client for RLS-enforced reads, or
  - a service-role client for privileged write paths like import publish, admin actions, and exports.

## Data Model
- `app.companies`
- `app.branches`
- `app.user_profiles`
- `app.user_branch_access`
- `app.sla_policies`
- `app.import_jobs`
- `app.dataset_versions`
- `app.vehicle_records`
- `app.quality_issues`
- `app.alert_rules`
- `app.saved_views`
- `app.audit_events`
- `raw.vehicle_import_rows`
- `mart.vehicle_aging`
- `mart.aging_summary`

## Backend Conventions
- Keep `/v1` as the stable product contract.
- Move all direct data access behind repository interfaces in the Nest app.
- Use service-role access only inside the API and worker.
- Let RLS protect the tables even if the browser never hits them directly.
- Keep dashboard queries reading from `mart` or curated RPC/functions, not raw operational tables.

## Rollout Order
1. Land Supabase project config, SQL migrations, buckets, and RLS.
2. Replace dev JWT auth with Supabase sessions in the API guard and frontend auth context.
3. Replace in-memory repository reads with Postgres-backed repository methods for:
   - `me`
   - navigation
   - summary
   - explorer
   - vehicle detail
4. Move imports to:
   - upload to Storage
   - insert `app.import_jobs`
   - enqueue import message
   - worker parses workbook
   - persist `raw.vehicle_import_rows` and `app.quality_issues`
   - publish `app.dataset_versions` and `app.vehicle_records`
5. Move alerts, saved views, audit, and admin modules to Supabase-backed persistence.
6. Cut workers and scheduled jobs over to queues + cron.

## Current Repo Touch Points
- API dependency seams:
  - [apps/api/src/platform/platform.repository.ts](/home/flchrms/Projects/flcbi/apps/api/src/platform/platform.repository.ts)
  - [apps/api/src/auth/auth-session.service.ts](/home/flchrms/Projects/flcbi/apps/api/src/auth/auth-session.service.ts)
- Current memory implementation to replace:
  - [apps/api/src/storage/platform-store.service.ts](/home/flchrms/Projects/flcbi/apps/api/src/storage/platform-store.service.ts)
  - [apps/api/src/auth/token.service.ts](/home/flchrms/Projects/flcbi/apps/api/src/auth/token.service.ts)
- Frontend auth/session bridge:
  - [src/contexts/AuthContext.tsx](/home/flchrms/Projects/flcbi/src/contexts/AuthContext.tsx)
  - [src/lib/api-client.ts](/home/flchrms/Projects/flcbi/src/lib/api-client.ts)
- Import pipeline entry points:
  - [apps/api/src/imports/imports.controller.ts](/home/flchrms/Projects/flcbi/apps/api/src/imports/imports.controller.ts)
  - [apps/worker/src/main.ts](/home/flchrms/Projects/flcbi/apps/worker/src/main.ts)
  - [packages/contracts/src/imports.ts](/home/flchrms/Projects/flcbi/packages/contracts/src/imports.ts)

## File Change Order
1. `supabase/config.toml`
2. `supabase/migrations/*.sql`
3. `apps/api/src/platform/platform.repository.ts`
4. `apps/api/src/auth/auth-session.service.ts`
5. `apps/api/src/storage/platform-store.service.ts`
6. `apps/api/src/common/api-auth.guard.ts`
7. `apps/api/src/auth/auth.controller.ts`
8. `src/contexts/AuthContext.tsx`
9. `src/lib/api-client.ts`
10. `apps/api/src/imports/*`
11. `apps/worker/src/main.ts`

## Definition Of Done For Cutover
- No in-memory data source in the API request path.
- Auth sessions come from Supabase Auth, not local HMAC tokens.
- Import preview and publish persist to Supabase tables and buckets.
- Summary and explorer read from Supabase-backed marts.
- Audit and alert records persist across restarts.
- Local development works with `supabase start` plus the existing web/api commands.

## Source Links
- Secure data: https://supabase.com/docs/guides/database/secure-data
- Securing the Data API: https://supabase.com/docs/guides/api/securing-your-api
- Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Column Level Security: https://supabase.com/docs/guides/database/postgres/column-level-security
- Cron: https://supabase.com/docs/guides/cron
- Log drains: https://supabase.com/docs/guides/telemetry/log-drains
- PrivateLink limitations: https://supabase.com/docs/guides/platform/privatelink
