# Test Server Deployment

This repo now includes an idempotent deployment path for the FLC BI test server on `192.168.1.133`.

## What It Installs

- The nginx site for `flcbi.test`
- `bi-api.service`
- `bi-web.service`
- `bi-worker.service`
- `bi-scheduler.service`
- `bi-redis.service`

The service definitions live in `ops/systemd/*.service.template`, so the exact runtime config is source-controlled instead of existing only on the machine.

## Prerequisites

- The repo is checked out on the server
- `npm install` has already been run
- `npm run test-server:bootstrap` has already created `.env.test-server.local`
- You have sudo access on the server

## Deploy

Run this from the repo root on the server:

```bash
sudo bash scripts/deploy-test-server.sh
```

The script:

1. Builds the platform
2. Installs or refreshes the nginx site
3. Writes the systemd unit files
4. Reloads systemd
5. Enables and restarts the runtime services
6. Waits for the API health endpoint to respond
7. Prints the public and direct server URLs

## Verify

After deployment, run:

```bash
npm run test-server:links
npm run smoke:runtime
npm run smoke:dashboard
```

If you need the public hostname to resolve from the server itself for local curls, keep a hosts entry for `flcbi.test` pointing at `127.0.0.1`. Client machines still need their own `flcbi.test` mapping to `192.168.1.133`.
