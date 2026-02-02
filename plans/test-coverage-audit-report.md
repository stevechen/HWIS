# Test Coverage Audit Report

## Executive Summary

This audit analyzes the HWIS codebase's testing infrastructure, identifying **9 skipped/fixme tests** and significant **test redundancy** across E2E, browser unit, and server unit test layers. The codebase has 18 E2E spec files, 14 browser unit test files, and 8 server-side unit test files.

---

## Test Inventory

### E2E Tests (Playwright)

| File                       | Test Count | Tags              |
| -------------------------- | ---------- | ----------------- |
| `smoke.spec.ts`            | 5          | @smoke, @students |
| `setup.spec.ts`            | 1          | setup             |
| `navigation.spec.ts`       | 1          | -                 |
| `evaluations.spec.ts`      | 3+         | @evaluations      |
| `students.list.spec.ts`    | 4          | @students         |
| `students.create.spec.ts`  | 3          | @students         |
| `students.edit.spec.ts`    | 1          | @students         |
| `students.delete.spec.ts`  | 4          | @students         |
| `students.archive.spec.ts` | 5          | @students         |
| `categories.spec.ts`       | 8+         | @categories       |
| `weekly-reports.spec.ts`   | 5          | -                 |
| `users.spec.ts`            | 6          | @users            |
| `permissions.spec.ts`      | 5          | -                 |
| `redirect.spec.ts`         | 4          | -                 |
| `audit.spec.ts`            | 10+        | -                 |
| `integration.spec.ts`      | 3          | @integration      |
| `admin-dashboard.spec.ts`  | 5          | @admin            |
| `cleanup.spec.ts`          | 2          | cleanup           |

**Total E2E Tests: ~75**

### Browser Unit Tests (vitest-browser-svelte)

| File                       | Test Count |
| -------------------------- | ---------- |
| `students.test.ts`         | 10         |
| `categories.test.ts`       | 8          |
| `evaluation-form.test.ts`  | 8          |
| `login.test.ts`            | 5          |
| `users.test.ts`            | 3          |
| `audit.test.ts`            | 4          |
| `backup.test.ts`           | 6          |
| `weekly-reports.test.ts`   | 10+        |
| `academic.test.ts`         | ?          |
| `students-dialogs.test.ts` | ?          |
| `evaluations-list.test.ts` | ?          |
| `rejected.test.ts`         | ?          |
| `admin-dashboard.test.ts`  | ?          |

**Total Browser Unit Tests: ~60+**

### Server Unit Tests (convex-test)

| File                          | Test Count |
| ----------------------------- | ---------- |
| `students.test.ts`            | 8          |
| `categories.test.ts`          | 5          |
| `evaluations.test.ts`         | 3+         |
| `audit.test.ts`               | 4          |
| `backup.test.ts`              | 2          |
| `weekly-reports.test.ts`      | 2+         |
| `students.duplicates.test.ts` | 5          |

**Total Server Unit Tests: ~30**

---

## Skipped/Fixme Tests Analysis

### Critical Priority (Blocking Core Functionality)

#### 1. `e2e/integration.spec.ts` - Student CRUD Cycle

```typescript
test.fixme('Student CRUD cycle - create, edit, delete works with real backend', ...)
```

**Root Cause:** Complex UI interactions need updating after component changes  
**Impact:** HIGH - Core feature validation missing  
**Effort:** MEDIUM (2-3 hours)  
**Remediation:**

- Update selectors to match current UI components
- Review dialog interaction patterns
- Ensure proper waiting for Convex reactivity

#### 2. `e2e/integration.spec.ts` - Evaluation Persistence

```typescript
test.fixme('Evaluation persists to database and appears in list', ...)
```

**Root Cause:** Requires categories to be seeded  
**Impact:** HIGH - Data persistence validation missing  
**Effort:** LOW (30 min)  
**Remediation:**

- Add `seedBaseline()` call in beforeEach
- Ensure proper test isolation

#### 3. `e2e/integration.spec.ts` - Category to Evaluation Flow

```typescript
test.fixme('Category created by admin can be used in evaluation by teacher', ...)
```

**Root Cause:** Complex cross-user setup and UI interactions  
**Impact:** MEDIUM - Integration validation missing  
**Effort:** HIGH (4-6 hours)  
**Remediation:**

- Break into smaller, focused tests
- Use API helpers for setup instead of UI
- Consider if this belongs in E2E or integration tests

### Medium Priority (Feature-Specific)

#### 4. `e2e/students.delete.spec.ts` - Cascade Delete

```typescript
test.fixme('can delete student with cascade', ...)
```

**Root Cause:** Requires baseline categories to be seeded  
**Impact:** MEDIUM - Cascade delete validation missing  
**Effort:** LOW (30 min)  
**Remediation:**

- Add `seedBaseline()` to beforeEach
- Verify cascade logic in Convex function

#### 5. `e2e/students.delete.spec.ts` - Delete Dialog with Evaluations

```typescript
test.fixme('delete dialog shows Set Not Enrolled for student with evaluations', ...)
```

**Root Cause:** UI may have changed, selectors need updating  
**Impact:** MEDIUM - User experience validation missing  
**Effort:** MEDIUM (1-2 hours)  
**Remediation:**

- Update dialog selectors
- Verify conditional rendering logic

#### 6. `e2e/students.delete.spec.ts` - Set Not Enrolled from Delete Dialog

```typescript
test.fixme('can set student to Not Enrolled from delete dialog', ...)
```

**Root Cause:** UI flow may have changed  
**Impact:** MEDIUM - Alternative action validation missing  
**Effort:** MEDIUM (1-2 hours)  
**Remediation:**

- Review current delete dialog implementation
- Update test to match actual UI flow

#### 7. `e2e/students.create.spec.ts` - Student ID Check Icon

```typescript
test.fixme('shows check icon for unique student ID after manual check', ...)
```

**Root Cause:** UI component changed, manual check feature may be removed  
**Impact:** LOW - Visual feedback validation  
**Effort:** LOW (30 min)  
**Remediation:**

- Verify if manual check feature still exists
- If removed, delete test; if exists, update selectors

#### 8. `e2e/categories.spec.ts` - Edit Form Pre-fill

```typescript
test.fixme('pre-fills form with category data', ...)
```

**Root Cause:** Form pre-fill logic may have changed  
**Impact:** LOW - Edit form validation  
**Effort:** LOW (30 min)  
**Remediation:**

- Verify edit form implementation
- Update selectors for pre-filled values

### Low Priority (Edge Cases)

#### 9. `e2e/weekly-reports.spec.ts` - Empty State

```typescript
test.skip(true, 'Empty state test skipped - requires isolated database state');
```

**Root Cause:** Requires isolated database state  
**Impact:** LOW - Edge case validation  
**Effort:** LOW (30 min)  
**Remediation:**

- Use test-specific data tags for isolation
- Or move to unit test with mocked data

---

## Redundant Test Analysis

### High Redundancy Areas

#### 1. **Permission/Access Control Tests** (5+ redundant tests)

**Files affected:**

- `e2e/permissions.spec.ts` (5 tests)
- `e2e/redirect.spec.ts` (4 tests)
- `e2e/smoke.spec.ts` (2 tests)
- `e2e/students.list.spec.ts` (1 test)
- `e2e/categories.spec.ts` (1 test)

**Redundancy Pattern:**
Multiple tests verify the same redirect behavior:

- Unauthenticated users redirected to `/login`
- Teachers redirected from `/admin/*` routes
- Admin access to protected routes

**Recommendation:**

- Consolidate into single comprehensive permission test suite
- Remove duplicates from smoke and feature tests
- Keep only one test per unique permission scenario

**Tests to Remove:**

- `smoke.spec.ts`: "Permission redirect works correctly" (duplicate of permissions.spec.ts)
- `students.list.spec.ts`: "redirects non-admin users from /admin/students" (duplicate)
- `categories.spec.ts`: "redirects non-admin users from /admin/categories" (duplicate)

#### 2. **Page Structure/Rendering Tests** (20+ redundant tests)

**Files affected:**

- All browser unit tests (`tests/routes/**/*.test.ts`)
- E2E tests that verify basic rendering

**Redundancy Pattern:**
Browser unit tests verify static component rendering:

- Page title as heading
- Back button presence
- Form field existence
- Button visibility

These are also covered by E2E tests implicitly when they interact with elements.

**Recommendation:**

- Keep browser unit tests focused on **interactive behavior** only
- Remove pure rendering tests that don't test behavior
- E2E tests inherently validate rendering by interacting with elements

**Tests to Consider Removing:**

- All "renders page title as heading" tests in browser unit tests
- All "shows back to admin button" tests (covered by navigation E2E)
- All "shows theme toggle button" tests (low value)

#### 3. **Student List/Filter Tests** (Overlapping coverage)

**Files affected:**

- `e2e/smoke.spec.ts`: "filters students by search term"
- `e2e/students.list.spec.ts`: "can filter students by grade", "can filter students by status"
- `tests/routes/admin/students/students.test.ts`: Filter dropdown rendering

**Recommendation:**

- Keep E2E tests for filter functionality (user behavior)
- Remove browser unit test for filter dropdown rendering (covered by E2E)
- Consider consolidating smoke test into students.list.spec.ts

#### 4. **Category Management Tests** (Overlapping coverage)

**Files affected:**

- `e2e/categories.spec.ts`: 8+ tests
- `tests/routes/admin/categories/categories.test.ts`: 8 tests
- `src/convex/categories.test.ts`: 5 tests

**Redundancy Pattern:**

- Browser unit tests verify dialog opens/closes
- E2E tests verify same + actual CRUD operations
- Server tests verify database logic

**Recommendation:**

- Keep server tests for business logic validation
- Keep E2E tests for user workflows
- Remove browser unit tests for categories (redundant with E2E)

#### 5. **Audit Log Tests** (Overlapping coverage)

**Files affected:**

- `e2e/audit.spec.ts`: 10+ tests
- `tests/routes/admin/audit/audit.test.ts`: 4 tests
- `src/convex/audit.test.ts`: 4 tests

**Recommendation:**

- Keep server tests for database operations
- Keep E2E tests for user interactions
- Remove browser unit tests (minimal value, mostly rendering)

#### 6. **Navigation Tests** (Overlapping coverage)

**Files affected:**

- `e2e/navigation.spec.ts`: 1 test
- `e2e/admin-dashboard.spec.ts`: 5 tests
- `e2e/redirect.spec.ts`: 4 tests

**Recommendation:**

- Consolidate all navigation tests into single file
- `admin-dashboard.spec.ts` tests are essentially navigation tests

---

## Test Architecture Recommendations

### Why This Distribution? Understanding Test Layer Value

The current codebase has significant **overlap** between browser unit tests and E2E tests, with both testing similar UI behaviors. The recommendation to reduce browser unit tests in favor of E2E for UI workflows is based on the following analysis:

#### Current Browser Unit Test Issues:

1. **Heavy Mocking Burden** - Each test mocks `convex-svelte` and auth, creating fragile tests that break when APIs change
2. **Limited Value** - Tests like "renders page title" or "shows back button" don't validate behavior, only static structure
3. **False Confidence** - Mocked tests may pass while real integration fails (e.g., Convex reactivity issues)

#### Why E2E is Preferred for UI Workflows:

1. **Real Data Flow** - Tests actual Convex reactivity, auth integration, and data persistence
2. **Higher Confidence** - Validates the complete stack, not just mocked components
3. **Less Mock Maintenance** - No need to maintain complex mocks for each component

#### What SHOULD Remain as Browser Unit Tests:

- **Complex component interactions** that are painful to test in E2E
- **Form validation feedback** (error messages, field states)
- **Component edge cases** (empty states, loading states, error boundaries)
- **Reusable component testing** (UI library components)

### 1. Layer Responsibilities

**E2E Tests (Playwright):**

- User workflows and journeys
- Cross-page interactions
- Real data persistence validation
- Permission/role-based access
- **Target: ~40 tests** (reduce from ~75)

**Browser Unit Tests (vitest-browser-svelte):**

- Complex component interactions not suitable for E2E
- Form validation feedback and error states
- Component edge cases (loading, empty, error states)
- Reusable UI component validation
- **Target: ~30 tests** (reduce from ~60+)
- **Focus:** Remove pure rendering tests, keep behavioral tests

**Server Unit Tests (convex-test):**

- Business logic validation
- Database operation correctness
- Edge cases and error handling
- **Target: ~30 tests** (maintain current level)

### 2. Specific Consolidation Actions

#### Phase 1: Remove Redundancy (Immediate)

1. **Delete browser unit tests for:**
   - `tests/routes/admin/categories/categories.test.ts` (covered by E2E, only tests rendering)
   - `tests/routes/admin/audit/audit.test.ts` (covered by E2E, only tests rendering)
   - `tests/routes/admin/backup/backup.test.ts` (covered by E2E, only tests rendering)
   - `tests/routes/admin/users/users.test.ts` (covered by E2E, only tests rendering)
   - Rendering-only tests in remaining browser unit tests

2. **Consolidate permission tests:**
   - Move all permission tests to `e2e/permissions.spec.ts`
   - Remove duplicates from other files

#### Alternative Approach: Strengthen Unit Tests Instead

If the team prefers to keep more unit tests and reduce E2E, consider:

1. **Convert E2E to Component Tests:**
   - Use Playwright's component testing for isolated component validation
   - Reduces E2E suite size while keeping fast feedback

2. **Improve Unit Test Value:**
   - Add interaction testing (not just rendering)
   - Test error boundaries and edge cases
   - Validate form validation logic

3. **Hybrid Approach:**
   - Keep critical user journeys in E2E
   - Move detailed UI interactions to component tests
   - Maintain server unit tests for business logic

#### Phase 2: Fix Skipped Tests (Short-term)

1. Fix 3 integration tests in `e2e/integration.spec.ts`
2. Fix 3 delete-related tests in `e2e/students.delete.spec.ts`
3. Fix 1 create test in `e2e/students.create.spec.ts`
4. Fix 1 category test in `e2e/categories.spec.ts`

#### Phase 3: Optimize (Medium-term)

1. Review and consolidate smoke tests
2. Ensure each test validates unique behavior
3. Add missing edge case coverage

---

## Priority Matrix for Skipped Tests

| Test                      | Impact | Effort | Priority | Action                         |
| ------------------------- | ------ | ------ | -------- | ------------------------------ |
| Student CRUD Cycle        | HIGH   | MEDIUM | P1       | Fix immediately                |
| Evaluation Persistence    | HIGH   | LOW    | P1       | Fix immediately                |
| Category to Evaluation    | MEDIUM | HIGH   | P2       | Plan for sprint                |
| Cascade Delete            | MEDIUM | LOW    | P1       | Fix immediately                |
| Delete Dialog Evaluations | MEDIUM | MEDIUM | P2       | Fix in next sprint             |
| Set Not Enrolled Dialog   | MEDIUM | MEDIUM | P2       | Fix in next sprint             |
| Student ID Check Icon     | LOW    | LOW    | P3       | Verify feature exists          |
| Edit Form Pre-fill        | LOW    | LOW    | P3       | Fix when convenient            |
| Empty State               | LOW    | LOW    | P3       | Consider unit test alternative |

---

## Estimated Impact

### If Recommendations Implemented:

- **Test Count Reduction:** ~40 tests (from ~165 to ~125)
- **Maintenance Burden:** Reduced by ~25%
- **CI Execution Time:** Reduced by ~20-30%
- **Coverage Quality:** Maintained or improved (less redundancy, clearer intent)

### Risk Assessment:

- **Low Risk:** Removing pure rendering tests (already covered by E2E implicit validation)
- **Low Risk:** Consolidating permission tests (same coverage, better organization)
- **Medium Risk:** Fixing skipped tests (may reveal actual bugs)

---

## Action Items Summary

### Immediate (This Week)

1. [ ] Fix `e2e/integration.spec.ts` - Evaluation Persistence (add seedBaseline)
2. [ ] Fix `e2e/students.delete.spec.ts` - Cascade Delete (add seedBaseline)
3. [ ] Remove redundant permission tests from smoke.spec.ts
4. [ ] Remove redundant browser unit tests (categories, audit, backup, users)

### Short-term (Next 2 Weeks)

5. [ ] Fix `e2e/integration.spec.ts` - Student CRUD Cycle (update selectors)
6. [ ] Fix `e2e/students.delete.spec.ts` - Delete Dialog tests (update UI flow)
7. [ ] Fix `e2e/students.create.spec.ts` - Student ID Check Icon (verify feature)
8. [ ] Consolidate all permission tests into single file

### Medium-term (Next Month)

9. [ ] Fix `e2e/integration.spec.ts` - Category to Evaluation Flow
10. [ ] Fix `e2e/categories.spec.ts` - Edit Form Pre-fill
11. [ ] Review and optimize smoke test coverage
12. [ ] Document test layer responsibilities for team
