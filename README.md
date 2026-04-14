# FLC UBS Web App

A React + TypeScript platform shell for building the Fook Loi Unified Business Suite (UBS).

## What this repository is now

This codebase started as the foundation for an internal business intelligence application and currently ships a working Auto Aging module, executive dashboard, authentication flow, and admin screens.

## What this branch changes

This branch hardens the repository to make it a better UBS starting point by:

- renaming the package to a UBS-specific name
- adding `typecheck` and `test:e2e` scripts
- removing committed environment values in favor of placeholders
- adding a checked-in `.env.example`
- adding a CI workflow for lint, typecheck, tests, and build
- adding route-level auth and role enforcement components
- moving the module directory source into a dedicated config file
- preventing unauthorized access to the user management page

## Recommended next steps

1. Move module-specific data loading out of large shared contexts and into domain hooks/services.
2. Replace demo-backed module metadata and branch data with database-backed configuration.
3. Move import parsing and publishing into server-side jobs for large production uploads.
4. Expand platform modules into dedicated folders such as `modules/hr`, `modules/finance`, and `modules/crm`.
5. Add invitation flows, company bootstrap, and richer permission management.

## Development

Copy `.env.example` to `.env` and fill in the Supabase values for your environment.

```bash
npm install
npm run dev
```

## Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
