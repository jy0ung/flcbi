# Vehicle Explorer Security Audit Report

Generated from the current workspace state on 2026-04-15.

## Executive Summary

Vehicle Explorer is now a cohesive feature surface, but the audit found two high-severity security issues and two medium-severity operational risks that should be addressed before treating the module as production-hardened.

The strongest controls already in place are good: API authentication and role guards are centralized in [apps/api/src/app.module.ts](/home/flchrms/Projects/flcbi/apps/api/src/app.module.ts#L57), mutating HTTP requests are audited by [apps/api/src/common/audit.interceptor.ts](/home/flchrms/Projects/flcbi/apps/api/src/common/audit.interceptor.ts#L12), and the SPA uses role boundaries in [src/App.tsx](/home/flchrms/Projects/flcbi/src/App.tsx#L54). The main gaps are workbook parsing supply-chain risk, CSV export sanitization, dependency hygiene, and the current in-memory explorer/backfill implementation.

Verification baseline:

- `npm test` passed.
- `FLCBI_SMOKE_BASE_URL=http://flcbi.test node scripts/smoke-dashboard.mjs` passed.
- `npm run lint` failed with 3 errors and 12 warnings.
- `npm audit --omit=dev` reported 14 runtime vulnerabilities: 12 high and 2 moderate.

## Scope & Inventory

### Repository and services

- Single monorepo: this repository contains the SPA, API, worker, scheduler, and shared contracts.
- User-facing SPA modules:
  - Executive dashboard in [src/pages/ExecutiveDashboard.tsx](/home/flchrms/Projects/flcbi/src/pages/ExecutiveDashboard.tsx)
  - Vehicle Explorer in [src/pages/auto-aging/VehicleExplorer.tsx](/home/flchrms/Projects/flcbi/src/pages/auto-aging/VehicleExplorer.tsx)
  - Vehicle Detail in [src/pages/auto-aging/VehicleDetail.tsx](/home/flchrms/Projects/flcbi/src/pages/auto-aging/VehicleDetail.tsx)
  - Data Quality, Exports, Import Center, Mapping Admin, SLA Admin, Import History under [src/pages/auto-aging/](/home/flchrms/Projects/flcbi/src/pages/auto-aging)
  - Admin surfaces in [src/pages/admin/](/home/flchrms/Projects/flcbi/src/pages/admin)
- Backend services:
  - NestJS API in [apps/api/src/](/home/flchrms/Projects/flcbi/apps/api/src)
  - BullMQ worker in [apps/worker/src/](/home/flchrms/Projects/flcbi/apps/worker/src)
  - Scheduler in [apps/scheduler/src/](/home/flchrms/Projects/flcbi/apps/scheduler/src)
- Shared library:
  - Domain types, filtering, parsing, and CSV export helpers in [packages/contracts/src/](/home/flchrms/Projects/flcbi/packages/contracts/src)
- Database:
  - Supabase Postgres with `raw`, `app`, and `mart` schemas used throughout the explorer/import/export flows.

### Stack inventory

- Languages: TypeScript across web, API, worker, scheduler, and shared contracts.
- Frontend frameworks/libraries: React 18, Vite, React Router, Radix UI, Recharts, Sonner, Tailwind CSS.
- Backend frameworks/libraries: NestJS 11, Supabase JS, BullMQ, ioredis, class-validator, class-transformer, multer, Swagger.
- Data/import/export libraries: `xlsx`.
- Test/runtime tooling: Vitest, Playwright, npm scripts.

### Legacy / orphaned surface

- No separate legacy Vehicle Explorer implementation was found.
- The explorer surface is consolidated in [src/pages/auto-aging/VehicleExplorer.tsx](/home/flchrms/Projects/flcbi/src/pages/auto-aging/VehicleExplorer.tsx) and [src/pages/auto-aging/VehicleExplorerGrid.tsx](/home/flchrms/Projects/flcbi/src/pages/auto-aging/VehicleExplorerGrid.tsx).
- No orphaned explorer microservice or duplicate route tree was found in the current repo state.

## Automated Analysis

### Checks performed

- `npm test`
- `npm run lint`
- `npm audit --omit=dev`
- `FLCBI_SMOKE_BASE_URL=http://flcbi.test node scripts/smoke-dashboard.mjs`
- Manual code review of import, export, explorer query, and mapping write paths

### Tooling notes

- No dedicated Semgrep, OWASP ZAP, or Snyk configuration was found in the repository.
- The existing smoke script is a good runtime regression check, but it is not a substitute for a DAST scanner.
- `npm audit` is useful here, but precision is limited for framework and router advisories because some findings are transitive and exploitability depends on the exact route or usage pattern.

### False-positive / precision notes

- `npm audit` reported framework-level packages such as `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/swagger`, `react-router-dom`, `@remix-run/router`, `path-to-regexp`, `glob`, `minimatch`, `picomatch`, `lodash`, `yaml`, and `brace-expansion`.
- Some of those advisories may not be directly exploitable in current Vehicle Explorer flows, but they still represent real runtime supply-chain risk and should be tracked.
- Lint warnings in React hook-heavy files are not security issues by themselves, but they reduce review confidence and hide real regressions more easily.

## Manual Review & Threat Model

### Main attack paths

- Workbook upload path: user uploads XLSX -> worker downloads the workbook -> `parseWorkbook()` parses it -> raw rows are persisted -> explorer, publish, and exports consume the data.
- Export path: explorer query -> filter/sort in memory -> CSV serialization -> browser download.
- Mapping path: admin updates branch/payment mappings -> mappings are saved -> raw and canonical rows are backfilled.
- Authorization path: auth guard + role guard + UI role boundaries govern access, while company and branch scoping are applied in the repository.

### Positive controls already present

- Request authentication is centralized in [apps/api/src/common/api-auth.guard.ts](/home/flchrms/Projects/flcbi/apps/api/src/common/api-auth.guard.ts#L13).
- Role enforcement is centralized in [apps/api/src/common/roles.guard.ts](/home/flchrms/Projects/flcbi/apps/api/src/common/roles.guard.ts#L7) and the SPA route guards in [src/App.tsx](/home/flchrms/Projects/flcbi/src/App.tsx#L54).
- Mutating actions are audited by [apps/api/src/common/audit.interceptor.ts](/home/flchrms/Projects/flcbi/apps/api/src/common/audit.interceptor.ts#L12).
- Input validation is applied globally in [apps/api/src/main.ts](/home/flchrms/Projects/flcbi/apps/api/src/main.ts#L12).

## Findings

### High 1. Untrusted XLSX parsing uses a vulnerable dependency

Impact: malicious workbook content can exercise `xlsx` prototype-pollution and ReDoS advisories during import preview and publish processing.

Evidence:

- The parser imports `xlsx` directly in [packages/contracts/src/imports.ts](/home/flchrms/Projects/flcbi/packages/contracts/src/imports.ts#L1).
- The workbook is parsed from user uploads in [packages/contracts/src/imports.ts](/home/flchrms/Projects/flcbi/packages/contracts/src/imports.ts#L209).
- The worker consumes that parser in [apps/worker/src/import-preview.processor.ts](/home/flchrms/Projects/flcbi/apps/worker/src/import-preview.processor.ts#L67).
- `xlsx` is a runtime dependency in [apps/api/package.json](/home/flchrms/Projects/flcbi/apps/api/package.json#L27) and is also present at the repo root in [package.json](/home/flchrms/Projects/flcbi/package.json#L24).

Recommendation:

- Replace or sandbox workbook parsing, because `npm audit` reports no fix for the current `xlsx` advisory set.
- Add pre-parse file-size, sheet-count, and row-count limits.
- Keep workbook parsing isolated from the API process if the dependency must remain for compatibility.
- Rerun the import parser tests and the import smoke after any parser change.

### High 2. CSV export is vulnerable to spreadsheet formula injection

Impact: exported CSV files can execute formulas when opened in spreadsheet software if workbook values begin with formula prefixes.

Evidence:

- CSV serialization does not neutralize formula prefixes in [packages/contracts/src/analytics.ts](/home/flchrms/Projects/flcbi/packages/contracts/src/analytics.ts#L1209).
- Export rows are derived from raw workbook content in [packages/contracts/src/analytics.ts](/home/flchrms/Projects/flcbi/packages/contracts/src/analytics.ts#L1056).
- The worker writes those rows to CSV in [apps/worker/src/export.processor.ts](/home/flchrms/Projects/flcbi/apps/worker/src/export.processor.ts#L96).
- The API fallback export path does the same in [apps/api/src/supabase/supabase-platform.repository.ts](/home/flchrms/Projects/flcbi/apps/api/src/supabase/supabase-platform.repository.ts#L2546).

Recommendation:

- Neutralize leading `=`, `+`, `-`, `@`, tab, and carriage-return prefixes before CSV output.
- Add a regression test with formula-like values in the workbook and ensure the downloaded CSV is inert in spreadsheet apps.
- Keep the fix in the shared serializer so both worker and API fallback exports inherit it.

### High 3. Runtime dependency advisories remain in the shipped stack

Impact: the explorer stack currently depends on runtime packages with known advisories, so the supply-chain risk remains elevated even if the current code path is clean.

Evidence:

- Runtime dependencies are declared in [apps/api/package.json](/home/flchrms/Projects/flcbi/apps/api/package.json#L14) and [package.json](/home/flchrms/Projects/flcbi/package.json#L24).
- `npm audit --omit=dev` reported direct or transitive issues in `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/swagger`, `react-router-dom`, `@remix-run/router`, `path-to-regexp`, `glob`, `minimatch`, `picomatch`, `lodash`, `yaml`, `brace-expansion`, and `xlsx`.

Recommendation:

- Upgrade direct runtime dependencies first, then re-run `npm audit --omit=dev`.
- Treat transitive advisories as tracked risk until the dependency tree is clean.
- Rebuild and rerun the dashboard smoke after dependency upgrades to catch route or swagger regressions.

### Medium 1. Explorer filtering and paging are performed in memory

Impact: large imports will slow down progressively because the API and shared helpers load all visible rows, then filter, sort, and page in application memory on every explorer request.

Evidence:

- Explorer queries fetch all visible workbook rows in [apps/api/src/supabase/supabase-platform.repository.ts](/home/flchrms/Projects/flcbi/apps/api/src/supabase/supabase-platform.repository.ts#L1715) and then call `queryVehicles`.
- The fallback store follows the same pattern in [apps/api/src/storage/platform-store.service.ts](/home/flchrms/Projects/flcbi/apps/api/src/storage/platform-store.service.ts#L1097).
- The shared filter/sort helpers operate over arrays in [packages/contracts/src/analytics.ts](/home/flchrms/Projects/flcbi/packages/contracts/src/analytics.ts#L976).
- Correction lookups also degrade to broader scans when the chassis set grows, increasing memory pressure further in [apps/api/src/supabase/supabase-platform.repository.ts](/home/flchrms/Projects/flcbi/apps/api/src/supabase/supabase-platform.repository.ts#L3096).

Recommendation:

- Push filter, sort, and paging closer to the database or to a dedicated indexed explorer view.
- Add paging-aware queries for workbook rows and corrections.
- Keep the current in-memory helper only as a fallback or for small datasets.

### Medium 2. Mapping saves and backfills are not atomic

Impact: a partial failure can leave mapping rules committed while raw workbook rows and canonical aging rows are only partly updated.

Evidence:

- Mapping writes are upserted first, then backfill is performed in separate calls in [apps/api/src/supabase/supabase-platform.repository.ts](/home/flchrms/Projects/flcbi/apps/api/src/supabase/supabase-platform.repository.ts#L1574).
- The fallback store follows the same sequential pattern in [apps/api/src/storage/platform-store.service.ts](/home/flchrms/Projects/flcbi/apps/api/src/storage/platform-store.service.ts#L704).
- Backfill updates raw rows and canonical rows in separate steps in [apps/api/src/supabase/supabase-platform.repository.ts](/home/flchrms/Projects/flcbi/apps/api/src/supabase/supabase-platform.repository.ts#L3323) and [apps/api/src/supabase/supabase-platform.repository.ts](/home/flchrms/Projects/flcbi/apps/api/src/supabase/supabase-platform.repository.ts#L3375).

Recommendation:

- Wrap the mapping write and backfill in a transaction or in a staged job with explicit success/failure state.
- Make backfill idempotent and retry-safe.
- Emit the audit event only after the canonical and raw updates succeed.

### Low 1. Lint and type-safety debt remains

Impact: no direct vulnerability was identified, but the current warning/error budget makes future security review noisier and can hide regressions.

Evidence:

- `npm run lint` reported errors in [apps/api/src/metrics/platform-metrics.service.ts](/home/flchrms/Projects/flcbi/apps/api/src/metrics/platform-metrics.service.ts#L223) and [src/lib/api-client.ts](/home/flchrms/Projects/flcbi/src/lib/api-client.ts#L316).
- React hook warnings remain in [src/contexts/AuthContext.tsx](/home/flchrms/Projects/flcbi/src/contexts/AuthContext.tsx#L239), [src/pages/auto-aging/DataQuality.tsx](/home/flchrms/Projects/flcbi/src/pages/auto-aging/DataQuality.tsx#L13), and [src/pages/auto-aging/VehicleExplorer.tsx](/home/flchrms/Projects/flcbi/src/pages/auto-aging/VehicleExplorer.tsx#L378).

Recommendation:

- Fix the explicit lint errors first.
- Clean the hook dependency warnings next.
- Keep `dangerouslySetInnerHTML`-style patterns tightly constrained and reviewed when they are necessary.

## Compliance & Monitoring

### Current alignment

- RBAC is present at both the UI and API layers in [src/App.tsx](/home/flchrms/Projects/flcbi/src/App.tsx#L54) and [apps/api/src/common/roles.guard.ts](/home/flchrms/Projects/flcbi/apps/api/src/common/roles.guard.ts#L7).
- Auditability is good for mutating requests via [apps/api/src/common/audit.interceptor.ts](/home/flchrms/Projects/flcbi/apps/api/src/common/audit.interceptor.ts#L12).
- Validation and company scoping are already part of the request and repository flow in [apps/api/src/main.ts](/home/flchrms/Projects/flcbi/apps/api/src/main.ts#L12) and the repository methods under [apps/api/src/supabase/supabase-platform.repository.ts](/home/flchrms/Projects/flcbi/apps/api/src/supabase/supabase-platform.repository.ts).

### Gaps versus best practice

- Dependency lifecycle management needs stronger control, especially for runtime packages that process user uploads or handle routing.
- CSV exports need explicit spreadsheet-safety hardening.
- Mapping backfills need transactional integrity or job-based consistency.
- There is no dedicated SAST/DAST job in CI yet; the current smoke scripts are useful regression checks but not full security scanners.

### Suggested monitoring improvements

- Add a CI job for `npm audit --omit=dev` with a dependency allowlist / review process.
- Add a workbook-import corpus test that includes malformed XLSX, large sheets, and suspicious cell content.
- Add a CSV formula-injection regression test.
- Add a scheduled browser smoke that exercises login, explorer filtering, export creation, and mapping admin flows.
- Keep audit events for mapping changes and export requests, and consider including row counts, file hashes, and import IDs in those events.

## Remediation Order

1. Replace or sandbox `xlsx` usage in the import pipeline.
2. Neutralize CSV export formulas in the shared serializer.
3. Upgrade and retest the runtime dependency tree flagged by `npm audit`.
4. Move explorer filtering/paging to a database-backed or indexed path.
5. Make mapping save/backfill atomic and retry-safe.
6. Clean lint and type-safety debt, then add security checks to CI.

## Verification After Fixes

- Re-run `npm test`.
- Re-run `npm run lint`.
- Re-run `npm audit --omit=dev`.
- Re-run `FLCBI_SMOKE_BASE_URL=http://flcbi.test node scripts/smoke-dashboard.mjs`.
- Re-run the workbook import and export smoke cases after any parser or serializer change.
