// Shared key names for the e2e external-session seam. Imported by both the
// app (src/lib/e2e/external-session.ts, src/routes/+layout.svelte) and the e2e
// suite (e2e/setup.spec.ts, e2e/convex-client.ts) so the strings can never
// drift apart.

export const E2E_SESSION_TOKEN_KEY = 'e2eSessionToken';

export const CONVEX_JWT_COOKIE_NAME = 'better-auth.convex_jwt';
