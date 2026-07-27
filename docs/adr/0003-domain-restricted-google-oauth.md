# ADR-0003: Domain-Restricted Google OAuth

## Status

Accepted

## Context

All teachers and students at HWIS have Google accounts with fixed email domains (`@hwhs.tc.edu.tw` for staff, `@std.hwhs.tc.edu.tw` for students). The system should be immediately accessible without requiring separate username/password management.

## Decision

Authentication uses Google OAuth via Better Auth, with email domain restriction as the sole access gate.

- Allowed domains: `@hwhs.tc.edu.tw` (staff), `@std.hwhs.tc.edu.tw` (students)
- Exception allowlist for specific non-school emails (developers, test accounts)
- First login creates a `pending` user profile via `onboarding.ensureUserProfile`
- Admin manually sets status to `active` to grant full access
- Admins can revoke access by setting a user back to `pending` (e.g., when a teacher leaves mid-year)

## Consequences

- Zero sign-up friction for teachers and students — they already have Google accounts.
- No password management, no password resets.
- Manual approval gate keeps the system restricted to current staff.
- Domain restriction prevents external access at the auth level.
