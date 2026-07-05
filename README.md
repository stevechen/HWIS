# HWHS Point Management System

A comprehensive evaluation point management system for **Hong Wen International School (HWIS)**. Teachers give/take evaluation points, admins manage categories/students/users, and house competitions track student engagement.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | SvelteKit 2 + Svelte 5 (runes) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS v4 |
| **UI Library** | shadcn-svelte (bits-ui) |
| **Icons** | Lucide Svelte |
| **Charts** | D3.js |
| **Backend** | Convex (reactive DB + functions) |
| **Auth** | Better Auth (Google OAuth) |
| **Deployment** | Vercel |
| **Package Manager** | Bun |

## Roles & Permissions

### Super User
- Full system access, promote/demote admins

### Admin
- **Students:** CRUD, import from Excel (duplicate handling), enable/disable, bulk assign houses
- **Users:** Manage teachers/admins, approve pending accounts, set roles
- **Categories:** Create/edit/archive point categories with merit/demerit criteria and CAS alignment
- **Evaluations:** View all evaluations (paginated), full audit trail
- **Classes:** Manage grade-class structure, assign homeroom teachers
- **Houses:** Manage house assignments, house events with point awards
- **Backup/Restore:** Export data, create/manage backups, Google Drive auto-backup (daily cron), restore from backup, clear data
- **Academic Year:** Year-end rollover — advance grades, archive graduates, clear evaluations
- **Weekly Reports:** Generate and view weekly evaluation summaries
- **Audit Log:** Full historical record of all mutations with performer/target/value details

### Teacher
- **Evaluations:** Give/take points (-2, -1, +1, +2) via categories, edit/delete own evaluations, bulk evaluate multiple students
- **Students:** Search by name/ID, filter by grade/class/status
- **Timeline:** View individual student evaluation timeline (own records)

### Student
- **View-Only:** Log in via school email, view personal evaluation timeline (anonymous, no teacher names)
- Auth is restricted to `@hwhs.tc.edu.tw` (staff) and `@std.hwhs.tc.edu.tw` (student) domains

## Features

### Authentication
- Google OAuth via Better Auth
- Domain-restricted login with allowlist exceptions for bootstrap users
- Test token bypass for development/testing

### Student Management
- Full CRUD with duplicate student ID validation
- Excel import with halt/skip/update on duplicate modes
- Search by name or student ID, filter by status and class
- House assignment (individual and bulk by name lookup)
- Grade-class auto-resolution on create

### Evaluation System
- Points assigned via categories with merit/demerit criteria and CAS alignment
- Create evaluations for single or multiple students at once
- Edit/delete own evaluations
- Cursor-based pagination for large result sets
- Anonymous student view (teacher names hidden)

### House System
- Four houses: Heracles, Wukong, Ixbalam, Setna
- House events with date ranges and point awards
- Per-house competition statistics (total points, student counts, averages)
- House display/scoreboard page

### Class Management
- Grade (7-12) + class letter structure
- Auto-increment naming, homeroom teacher assignment
- Student counts, move students within same grade
- Protected class names ("1" for IB and "1" for general)

### Backup & Restore
- Full database export (JSON)
- Create/restore/delete snapshots in the backups table
- Google Drive auto-backup via daily Vercel cron (`0 4 * * *`)
- Full data clear or selective evaluation clear

### Audit Trail
- Every mutation logs: action, performer, target table/ID, old/new values
- Filterable by action type and performer
- Enriched with human-readable names (student, teacher, category)

### Category Management
- Dynamic categories
- Each category has: name, merit criteria, demerit criteria, CAS alignment
- Protected from deletion if evaluations reference them

## Project Structure

```
src/
├── convex/              # Convex backend functions
│   ├── schema.ts        # Database schema (11 tables)
│   ├── auth.ts          # Better Auth integration
│   ├── students.ts      # Student CRUD + import
│   ├── evaluations.ts   # Evaluation system
│   ├── categories.ts    # Point categories
│   ├── classes.ts       # Grade/class management
│   ├── users.ts         # User management
│   ├── houses.ts        # House assignments/stats
│   ├── houseEvents.ts   # House event management
│   ├── audit.ts         # Audit log
│   ├── backup.ts        # Backup/restore
│   ├── driveBackup.ts   # Google Drive backup action
│   ├── onboarding.ts    # User profile creation
│   ├── dataFactory.ts   # E2E test data helpers
│   └── ...
├── routes/
│   ├── /                # Landing page
│   ├── /login           # Login
│   ├── /admin/*         # Admin dashboard & sub-pages
│   ├── /evaluations/*   # Evaluation pages (teacher)
│   ├── /houses/*        # House overview & scoreboard
│   └── /api/auth/*      # Better Auth API routes
└── lib/
    └── components/      # shadcn-svelte UI components
```

## Getting Started

```sh
bun install
bun dev
```

Convex dev server must be running in a separate terminal:

```sh
bunx convex dev
```

If local Convex gets stuck:

```sh
bun run convex:local:recover
bunx convex dev --configure existing --typecheck=disable
```

Then in another terminal:

```sh
bun run convex:local:env-sync
```

Full runbook: `docs/convex-local-recovery.md`

## Testing (3-Layer Approach)

### Browser Unit Tests (Vitest + vitest-browser-svelte)

Real Chromium via Playwright, tests page structure with semantic locators:

```sh
bunx vitest run --config vite.config.ts
```

### Server Unit Tests (convex-test)

Deterministic mock DB, no network calls:

```sh
bunx vitest run src/convex/*.test.ts
```

### E2E Tests (Playwright)

Requires dev servers running:

```sh
./scripts/start-dev-servers.sh
bunx playwright test e2e
```

Run all tests:

```sh
bun run test:all
```

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `BETTER_AUTH_SECRET` | Production | Auth JWT signing |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth |
| `SITE_URL` / `VITE_SITE_URL` | Yes | Service URLs |
| `PUBLIC_CONVEX_URL` | Yes | Convex deployment URL |
| `CONVEX_DEPLOYMENT` | Yes | Convex deployment name |
| `CRON_SECRET` | Cron | Vercel cron auth |
| `GOOGLE_REFRESH_TOKEN` | Drive backup | Google Drive upload |
| `GOOGLE_DRIVE_FOLDER_ID` | Optional | Drive backup folder |
| `E2E_TEST_TOKEN` | Testing | Custom test token |

## Database Schema (11 Tables)

| Table | Purpose |
|-------|---------|
| `users` | Auth-linked user profiles with roles |
| `sessions` | Better Auth sessions |
| `accounts` | OAuth/password accounts |
| `verifications` | Email verifications |
| `students` | Student records with house/class/status |
| `classes` | Grade-class mappings with homeroom teachers |
| `evaluations` | Point records linked to students/categories |
| `point_categories` | Dynamic categories with criteria |
| `audit_logs` | Full mutation history |
| `backups` | Database snapshots |
| `settings` | Key-value app settings |
| `house_events` | Timed house point events |
