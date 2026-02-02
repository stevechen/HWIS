# Deploy Convex + SvelteKit Workflow

## Overview

This workflow describes how to develop, test, and deploy the **HWIS** application across four environments:

1. **Local development** – Convex runs locally (`bun convex dev --local --auth`) and the SvelteKit frontend runs with `bun dev`.
2. **Vercel Preview (Staging)** – Deploys to Vercel using the _development_ Convex cloud instance (`convex dev`).
3. **Vercel Production** – Deploys to Vercel using the _production_ Convex cloud instance.
4. **Self‑hosted Convex (Production)** – Runs a self‑hosted Convex server (Docker or binary) behind a custom domain.

The workflow is written as a series of shell commands and configuration steps that can be copied into CI/CD pipelines (GitHub Actions, Vercel Build Hooks, etc.).

---

## 1️⃣ Local Development & Testing

### 1.1 Environment variables

Create a `.env.local.convex` (already present) with the following keys:

```bash
# .env.local.convex
NODE_ENV=development
SITE_URL="http://localhost:5173"               # SvelteKit dev server
CONVEX_SESSION_COOKIE="convex_session_token"
BETTER_AUTH_TRUSTED_ORIGINS="http://localhost:5173"
# Google OAuth dev credentials (add a dev redirect in Google console)
GOOGLE_CLIENT_ID="<dev-client-id>"
GOOGLE_CLIENT_SECRET="<dev-client-secret>"
```

Make sure the Google OAuth console includes the redirect `http://localhost:3210/api/auth/callback`.

### 1.2 Start services (single script)

Edit `start-local.sh` to include the `--auth` flag:

```bash
#!/bin/bash
cd /Users/stevechen/Projects/HWIS
pkill -f "convex dev" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 2
source .env.local.convex
bun convex dev --local --auth &
CONVEX_PID=$!
sleep 12   # wait for Convex to be ready
bun dev --port 5173 &
```

Run `./start-local.sh` and open `http://localhost:5173`. The Google sign‑in flow should work and set the `convex_session_token` cookie.

### 1.3 Run tests

```bash
# Unit tests
bun run test:unit
# End‑to‑end tests (Playwright)
bun run test:e2e
```

All tests must pass before proceeding to any remote deployment.

---

## 2️⃣ Vercel Preview (Staging) – Cloud Convex Development

### 2.1 Convex staging project

Create a separate Convex project (e.g., `hwis-staging`). In the Convex dashboard, enable **Better Auth** and add the same Google OAuth client ID/secret you use for production (or a dedicated staging client).

### 2.2 Vercel preview branch configuration

1. In Vercel, link the repository and set **Environment Variables** for the preview branch:
   - `CONVEX_DEPLOYMENT=hwis-staging`
   - `SITE_URL=https://<your‑preview‑subdomain>.vercel.app`
   - `CONVEX_SESSION_COOKIE=convex_session_token`
   - `BETTER_AUTH_TRUSTED_ORIGINS=https://<your‑preview‑subdomain>.vercel.app`
2. Add a **Vercel Build Hook** (optional) that runs after a push to `preview/*`.

### 2.3 Deploy command (CI step)

```bash
# Install dependencies with Bun (user prefers Bun)
bun install
# Build the SvelteKit app (Vite)
bun run build
# Deploy to Vercel (preview) – Vercel CLI must be authenticated
vercel --prod --prebuilt --token $VERCEL_TOKEN --confirm
```

Vercel automatically detects the `vercel.json` (if present) and sets the correct output directory (`build`). The Convex client will read the `CONVEX_DEPLOYMENT` env var and point to the staging Convex URL.

---

## 3️⃣ Vercel Production – Cloud Convex Production

### 3.1 Convex production project

Use the main Convex project (e.g., `hwis-prod`). Ensure Google OAuth production credentials are set and the allowed redirect is `https://hwis.vercel.app/api/auth/callback`.

### 3.2 Vercel production environment variables

In Vercel dashboard → Settings → Environment Variables, set:

- `CONVEX_DEPLOYMENT=hwis-prod`
- `SITE_URL=https://hwis.vercel.app`
- `CONVEX_SESSION_COOKIE=convex_session_token`
- `BETTER_AUTH_TRUSTED_ORIGINS=https://hwis.vercel.app`

### 3.3 Deploy command (CI step)

```bash
# Ensure the production env vars are present (Vercel will inject them)
# Build
bun run build
# Deploy to production
vercel --prod --prebuilt --token $VERCEL_TOKEN --confirm
```

After deployment, run the full E2E suite against the preview URL to verify the staging build before promoting to production.

---

## 4️⃣ Self‑Hosted Convex (Production) – Optional

### 4.1 Install Convex locally (Docker example)

```bash
docker run -d \
  -p 3210:3210 \
  -e CONVEX_AUTH=true \
  -e CONVEX_SITE_URL="https://convex.mycompany.com" \
  convex/convex:latest
```

Expose the container behind a reverse proxy (NGINX) that terminates TLS and sets the `Site-URL` header.

### 4.2 Configure environment variables for SvelteKit

Create a `.env.production` (or use Vercel’s production env) with:

```bash
CONVEX_DEPLOYMENT="http://convex.mycompany.com"   # base URL of the self‑hosted Convex
SITE_URL="https://app.mycompany.com"            # your SvelteKit domain
BETTER_AUTH_TRUSTED_ORIGINS="https://app.mycompany.com"
CONVEX_SESSION_COOKIE=convex_session_token
```

Make sure the Google OAuth client includes the redirect `https://app.mycompany.com/api/auth/callback`.

### 4.3 Deploy SvelteKit to your own host (e.g., Docker)

```Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN bun install && bun run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/build ./
EXPOSE 3000
CMD ["node", "./index.js"]
```

Push the image to your container registry and run it behind the same reverse proxy that serves the Convex instance.

---

## 5️⃣ Summary of Commands

```bash
# Local dev
./start-local.sh
# Run tests
bun run test:unit && bun run test:e2e

# Vercel preview (staging)
vercel --prebuilt --token $VERCEL_TOKEN   # branch‑specific, Vercel injects env vars

# Vercel production
vercel --prod --prebuilt --token $VERCEL_TOKEN

# Self‑hosted Convex + SvelteKit (Docker)
# 1. Start Convex container (see 4.1)
# 2. Build and push SvelteKit image
docker build -t myapp/frontend .
# 3. Deploy container behind TLS proxy
```

---

## 6️⃣ Adding the Workflow to the Project

The file you are reading (`.agent/workflows/deploy_convex_sveltekit.md`) is automatically discovered by the IDE. You can now reference it from any issue or PR with the command:

```
/agent run workflow deploy_convex_sveltekit
```

This will print the steps above and can be used as a checklist for CI pipelines.

---

_End of workflow._
