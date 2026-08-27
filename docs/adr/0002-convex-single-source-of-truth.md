# ADR-0002: Convex as Single Source of Truth

## Status

Accepted (rendering model updated Aug 2026 — see note below)

## Context

The app needs real-time reactivity (evaluation lists update as teachers create them), a client-side auth gate and initial page load, and a shared data layer accessible from the client. Auth guards were originally implemented with server-side rendering (SSR), but the app has since been converted to a SPA (see note below).

> **Note (Aug 2026):** The app was converted from SSR to a single-page app (SPA, `ssr=false`) with a client-side auth gate (`src/lib/auth-guard.ts`). Auth state settles in the browser before any redirect; the root `+page.svelte` redirects approved users via `goto()` and the admin layout gates rendering on Convex auth settling, so no premature bounce or full-page reload occurs. The rest of this ADR (Convex as the single source of truth) is unchanged.

## Decision

Convex is the single source of truth for both backend logic and data.

- All business logic (CRUD, auth, locking, reporting) lives in Convex queries, mutations, and actions.
- Client-side uses `convex-svelte` with `setupConvex()`, `useQuery()`, and `useMutation()` for reactivity. Auth sessions flow from the SPA into Convex via the Better Auth Convex plugin (JWT), so authenticated Convex queries see the real user.
- No duplicate business logic in SvelteKit server routes — they serve only as thin proxies (e.g., cron backup endpoint).
- Convex function-call volume should be minimized while on free quotas. Prefer reactive subscriptions, batching, and client-side filtering over repeated ad-hoc queries, action loops, or polling that increases billable invocations.
- Vercel Edge request volume should be minimized. Keep authenticated and dynamic work in Convex, use client-side SPA transitions where appropriate, cache immutable static assets, and avoid routing scheduled jobs through Vercel when Convex scheduled functions can run them directly.

## Consequences

- Single set of business rules to maintain, enforced at the data layer.
- Real-time subscriptions work automatically for all data consumers.
- SvelteKit is a pure rendering layer, reducing surface area for bugs.
- As a SPA, the client holds one long-lived Convex connection instead of creating a server Convex client per request, which removes the per-navigation server latency and Vercel function invocations the SSR model incurred.
