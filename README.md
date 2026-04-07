# FLC BI Platform

FLC BI is structured as a production-oriented analytics application. The repo keeps the React application shell, but adds a real API surface, shared contracts, queue-backed workers, local object storage, infrastructure templates, and a Supabase-backed auth/data path.

## What Is In This Repo

- `src/`: React/Vite frontend using React Query and typed contracts from `@flcbi/contracts`
- `apps/api`: NestJS API with auth, navigation, aging, imports, alerts, exports, audit, and admin endpoints
- `apps/worker`: BullMQ worker handling imports, alerts, and export jobs
- `apps/scheduler`: cron-driven queue scheduler for recurring background work
- `packages/contracts`: shared domain types, API contracts, import parsing, KPI definitions, and analytics helpers
- `supabase`: local config and SQL migrations for the Supabase migration path
- `infra/dbt`: dbt-compatible warehouse skeleton for staging and mart models

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Start backing services:

```bash
docker compose up -d
```

3. Copy environment defaults:

```bash
cp .env.example .env
```

4. Supabase setup:

If you want to use the real application auth and repository path, start your local Supabase project, fill in the `SUPABASE_*`, `VITE_SUPABASE_*`, and `BOOTSTRAP_*` values in `.env`, then bootstrap the first company and admin account:

```bash
supabase start
npm run bootstrap:supabase
```

For this test server specifically, the repo already includes a non-conflicting port layout for `192.168.1.133`. The easiest setup path is:

```bash
npm run test-server:bootstrap
npm run test-server:dev
```

This uses dedicated ports so it does not collide with the other Supabase-based test project on the machine. The generated local Supabase keys are written to `.env.test-server.local`.
The first bootstrap also installs the Supabase CLI into the repo-local `.cache/` directory so it does not share a global tool state with other projects on the server.
The test-server helpers also bring up the local Redis container automatically so the import queue path is available during development.
The test-server Supabase helpers now also apply repo migrations directly to the `flcbi` local database container, so schema changes do not drift to a different local Supabase project when multiple stacks are running on the same machine.
If Supabase has not been bootstrapped yet, `npm run test-server:dev` can still start the UI and API on the test-server ports, but sign-in will remain unavailable until provisioning completes.

For the nginx-backed test URL, add a hosts entry on your client machine:

```text
192.168.1.133 flcbi.test
```

Then install the site config on the server:

```bash
sudo bash scripts/install-nginx-flcbi.sh
```

5. Run the platform:

```bash
npm run dev:platform
```

This starts:

- Web app on `http://localhost:8080`
- API on `http://localhost:3001/v1`
- Swagger docs on `http://localhost:3001/docs`

## Bootstrap Logins

There are no built-in demo users anymore.

Use the company admin account created by `npm run bootstrap:supabase` or `npm run test-server:bootstrap`. The credentials come from the `BOOTSTRAP_ADMIN_*` environment variables, and the test-server helper writes the generated password to `.env.test-server.local`.

## Key Productionization Decisions Already Landed

- Frontend state is API-backed rather than owned by fixture providers
- Auth is Supabase-backed and no longer relies on seeded local accounts
- Imports are handled through backend endpoints and stored as immutable preview/publish records
- Import previews now persist raw rows and validation issues in Supabase, so publish can survive an API restart
- Full-file uploads now default to `replace` mode, which refreshes the live snapshot without deleting import history
- `merge` mode remains available for exceptional incremental uploads
- The active Auto Aging milestone flow is `BG -> ETD -> OUT -> REG -> DEL -> DISB`
- A downloadable import template now lives at `public/templates/auto-aging-import-template.xlsx` and can be regenerated with `npm run generate:import-template`
- KPI, explorer, import parsing, and domain contracts live in one shared package
- Queue, scheduler, warehouse, and storage primitives are scaffolded in-repo for the next implementation phases
- The Supabase migration target, rollout order, and schema plan live in `docs/supabase-migration-blueprint.md`
- The API repository layer now has a Supabase adapter for auth, users, SLAs, alerts, audit, imports, and tenant-scoped analytics reads
- When Redis is configured, import preview parsing runs asynchronously through the in-repo queue and worker instead of blocking the API upload request
- Import publish orchestration now also runs through the imports queue and worker, so the API hands off the heavy publish step and the UI polls `publish_in_progress`
- Alert evaluation now runs through the alerts queue and worker, with the scheduler enqueueing hourly evaluations and API-side rule changes enqueueing immediate company refreshes
- Vehicle explorer CSV exports now run through the exports queue and worker, with completed files stored in the configured export bucket and surfaced in the in-app Exports page
- Daily export subscriptions now fan out through the scheduler and exports worker, with saved explorer filters producing queued CSV jobs on the daily schedule
- Admin users now have an Operations page that surfaces dependency health plus import/export attempts, failures, and queue progress metadata

## Current Limitations

- Some non-critical flows still use lightweight local fallbacks when Supabase is not configured for the environment
- OIDC/SCIM, dbt execution, observability exporters, and true warehouse promotion are not finished in this pass
- The Supabase path is implemented and build-verified, but it still needs a live configured project to be exercised end to end

## Useful Commands

```bash
npm run dev:web
npm run dev:api
npm run dev:worker
npm run dev:scheduler
npm run bootstrap:supabase
npm run test-server:bootstrap
npm run test-server:dev
npm run test-server:links
npm run test-server:supabase:migrate
npm run smoke:import
npm run smoke:publish-modes
npm run generate:import-template
npm run build:platform
npm run test
```
