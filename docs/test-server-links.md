# Test Server Links

This project is configured to run on `192.168.1.133` without clashing with the other Supabase-based test stack already using `8000` and `54322-54327`.

## Public URLs
- App: http://flcbi.test
- API: http://flcbi.test/v1
- Swagger: http://flcbi.test/docs
- Health: http://flcbi.test/v1/health

## Direct Service URLs
- App: http://192.168.1.133:18133
- API: http://192.168.1.133:18134/v1
- Supabase API: http://192.168.1.133:55431
- Supabase Studio: http://192.168.1.133:55433
- Mailpit: http://192.168.1.133:55434

## Supporting Services
- Legacy Postgres: `postgresql://flcbi:flcbi@192.168.1.133:55452/flcbi`
- Redis: `redis://192.168.1.133:56379`
- MinIO: http://192.168.1.133:59000
- MinIO Console: http://192.168.1.133:59001

## Commands
```bash
npm run test-server:bootstrap
npm run test-server:dev
npm run test-server:links
npm run smoke:import
```

`npm run test-server:dev` can start before Supabase is provisioned, but sign-in will stay unavailable until `npm run test-server:bootstrap` completes.
`npm run test-server:bootstrap` now provisions a real company admin account and default SLA/branch records instead of demo business data.

## Nginx
The public test URL is intended to be served by nginx on port `80`, proxying the Vite dev server, the Nest API, and the local Supabase gateway through one origin. Install the site config with:

```bash
sudo bash scripts/install-nginx-flcbi.sh
```

Because `flcbi.test` is not public DNS, each client machine needs a hosts entry:

```text
192.168.1.133 flcbi.test
```
