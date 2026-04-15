# Architecture

This repository is being reshaped from a single business-intelligence application into a modular UBS platform.

## Current structure

- `src/platform/*` contains cross-cutting platform concerns such as routing, auth, and module configuration.
- `src/modules/*` contains domain route composition for business areas.
- `src/pages/*` still contains the existing concrete page implementations.

## Routing layout

- `src/platform/routing/AppRouter.tsx` owns public vs authenticated routing.
- `src/platform/routing/AuthenticatedApp.tsx` owns the authenticated app shell.
- `src/modules/platform/routes.tsx` defines suite-level routes.
- `src/modules/auto-aging/routes.tsx` defines the current active module routes.
- `src/modules/admin/routes.tsx` defines admin routes with role enforcement.

## Auto Aging data flow

- `src/modules/auto-aging/services/mappers.ts` converts database rows into typed module entities.
- `src/modules/auto-aging/services/repository.ts` owns Supabase reads and writes for the Auto Aging module.
- `src/modules/auto-aging/hooks/useAutoAgingData.ts` owns module state and composes repository calls.
- `src/contexts/DataContext.tsx` is now a thin compatibility wrapper over the module hook.

## Why this refactor exists

The original app worked well as a prototype, but its routing and data access were tightly coupled to app-wide files. UBS needs clearer boundaries between:

- platform shell
- platform auth and role checks
- module registration
- domain-specific routes
- domain-specific data services

## Next refactor targets

1. Replace remaining demo-backed configuration with database-backed configuration.
2. Add company bootstrap, invitations, and module enablement flows.
3. Introduce server-side import jobs for heavier data processing.
4. Split page implementations under their respective modules as the suite expands.
5. Add module-scoped tests around repository and hook behavior.
