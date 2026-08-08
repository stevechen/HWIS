# ADR-0003: Domain-Restricted Google OAuth

## Status

Accepted

## Context

All teachers and students at HWIS have Google accounts with fixed email domains (`@hwhs.tc.edu.tw` for staff, `@std.hwhs.tc.edu.tw` for students). The system should be immediately accessible without requiring separate username/password management.

## Decision

Authentication uses Google OAuth via Better Auth, with email domain restriction as the sole access gate.

- Allowed domains: `@hwhs.tc.edu.tw` (staff), `@std.hwhs.tc.edu.tw` (students)
- Exception allowlist for specific non-school emails (developers, test accounts)
- Staff first login creates a `pending` user profile via `onboarding.ensureUserProfile`; admin manually sets status to `active` to grant full access
- Admins can revoke access by setting a user back to `pending` (e.g., when a teacher leaves mid-year)
- **Students have no user profile.** Their identity is derived from their email on every read: the address must match `s{studentId}@std.hwhs.tc.edu.tw`, and the resulting student record's **Enrolled** status gates access to their own evaluations. Access is enforced in-app (in the `viewer` query, route guards, and the anonymous evaluations query), not at the auth hook.

## Consequences

- Zero sign-up friction for teachers and students — they already have Google accounts.
- No password management, no password resets.
- Manual approval gate keeps the system restricted to current staff.
- Domain restriction prevents external access at the auth level; active/enrollment policy controls application access after authentication.
- Students cannot be impersonated via a user profile because no profile exists; authorization always re-resolves the record from the email.
