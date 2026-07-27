# ADR-0002: Convex as Single Source of Truth

## Status

Accepted

## Context

The app needs real-time reactivity (evaluation lists update as teachers create them), server-side rendering (SSR) for auth guards and initial page load, and a shared data layer accessible from both server and client.

## Decision

Convex is the single source of truth for both backend logic and data.

- All business logic (CRUD, auth, locking, reporting) lives in Convex queries, mutations, and actions.
- SvelteKit SSR authenticates via JWT from cookies (`locals.token`) and calls Convex HTTP endpoints using a Convex client.
- Client-side uses `convex-svelte` with `setupConvex()`, `useQuery()`, and `useMutation()` for reactivity.
- No duplicate business logic in SvelteKit server routes — they serve only as thin proxies (e.g., cron backup endpoint).

## Consequences

- Single set of business rules to maintain, enforced at the data layer.
- Real-time subscriptions work automatically for all data consumers.
- SvelteKit is a pure rendering layer, reducing surface area for bugs.
- SSR requires a Convex client per request, adding some latency overhead.
