# Layout Reorganization Plan

## Overview
Reorganize the application layout based on usage frequency to improve user experience and efficiency.

## Current State Analysis

### Teachers Landing Page (`/`)
- Currently shows a welcome page with buttons to:
  - View Evaluations (`/evaluations`)
  - New Evaluation (`/evaluations/new`)
  - Admin Dashboard (only for admins)

### Admin Dashboard (`/admin`)
Current card order:
1. System Data
2. Student Management
3. User Accounts
4. Weekly Reports
5. Backup
6. Audit Log
7. Categories
8. Archive & Reset

## Proposed Changes

### 1. Teachers Landing Page

**Change**: Teachers should automatically land on `/evaluations` (Evaluation Review) instead of the welcome page.

**Rationale**: Evaluation review is used "a few times a week" - it's the most frequent task for teachers.

**Implementation**:
- Modify [`src/routes/+page.svelte`](src/routes/+page.svelte) to redirect teachers to `/evaluations`
- Keep the welcome page for:
  - Non-logged-in users (sign-in prompt)
  - Users pending approval
  - Admin users (they can still access admin dashboard)

### 2. Admin Dashboard Reorganization

**Change**: Reorder admin dashboard cards based on usage frequency.

**New Order** (from most to least frequent):

#### Top Section - Prominent (High Frequency)
1. **Weekly Reports** - Every week
2. **Evaluation Review** - A few times a week (link to `/evaluations`)

#### Middle Section - Occasional (Medium Frequency)
3. **Student Management** - Beginning of year, sporadic use
4. **User Accounts** - Beginning of year, very limited use
5. **Categories** - Beginning of year

#### Bottom Section - Rare (Low Frequency)
6. **Audit Log** - A few times a year (when problems occur)
7. **Backup** - A few times a year (auto-backup runs weekly)
8. **Archive & Reset** - Once or twice a year
9. **System Data** - Testing only (will be removed in production)

**Visual Organization**:
- No section headers (keep simple card layout)
- Maintain consistent spacing between all cards

## Implementation Details

### Files to Modify

1. **[`src/routes/+page.svelte`](src/routes/+page.svelte)**
   - Add automatic redirect for teachers to `/evaluations`
   - Keep existing behavior for non-logged-in, pending, and admin users

2. **[`src/routes/admin/+page.svelte`](src/routes/admin/+page.svelte)**
   - Reorder cards according to frequency
   - Add "Evaluation Review" card (link to `/evaluations`)
   - Consider adding section headers for frequency tiers

### Testing Considerations

- Verify teachers are redirected to `/evaluations` when logged in
- Verify admins still see the admin dashboard
- Verify non-logged-in users see the sign-in page
- Verify pending approval users see the pending message
- Update E2E tests if navigation behavior changes

## User Decisions

1. **Section headers**: No - keep simple card layout without section headers
2. **Evaluation Review card**: Yes - add a card in admin dashboard for easy access
3. **System Data**: Keep it for now - still in development phase
