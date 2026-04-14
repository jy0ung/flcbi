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

## Why this refactor exists

The original app worked well as a prototype, but its routing and module definitions were tightly coupled to a single `App.tsx` file and a demo-data source. UBS needs clearer boundaries between:

- platform shell
- platform auth and role checks
- module registration
- domain-specific routes
- future domain-specific data services

## Next refactor targets

1. Move large shared data contexts into domain services and query hooks.
2. Replace remaining demo-backed configuration with database-backed configuration.
3. Add company bootstrap, invitations, and module enablement flows.
4. Introduce server-side import jobs for heavier data processing.
5. Split page implementations under their respective modules as the suite expands.
