# Integration Test Consolidation Analysis

## Current Integration Tests (e2e/integration.spec.ts)

| Test                | Lines   | Purpose                | Redundancy Score                          |
| ------------------- | ------- | ---------------------- | ----------------------------------------- |
| Student CRUD cycle  | 27-94   | Create→Edit→Delete     | **Medium** - 70% could be component tests |
| Evaluation persists | 96-131  | Student selection flow | **High** - 80% could be component tests   |
| Category→Evaluation | 154-229 | Admin→Teacher handoff  | **Low** - Only E2E can test this          |

---

## Detailed Analysis

### Test 1: "Student CRUD cycle" (Lines 27-94)

**What It Tests:**

- Create student via API (not UI)
- UI: Verify student appears
- UI: Open edit dialog
- UI: Change status
- UI: Submit edit
- UI: Verify status changed
- UI: Open delete dialog
- UI: Confirm delete
- UI: Verify student removed

**What Could Move to Component Tests:**

| Current E2E Step                          | Component Test Equivalent             |
| ----------------------------------------- | ------------------------------------- |
| "Verify student was created" → finds row  | Mock Convex query, test row rendering |
| "Open edit dialog" → find row, click edit | Test dialog opens with correct data   |
| "Change status" → selectOption            | Test status select binding            |
| "Submit edit" → click Update              | Test form validation, mutation call   |
| "Verify status changed"                   | Test status badge rendering           |
| "Open delete dialog"                      | Test dialog opens with confirmation   |
| "Confirm delete"                          | Test delete mutation call             |

**What MUST Remain in E2E:**

- ✅ Real Convex `students.update()` mutation
- ✅ Real Convex `students.delete()` mutation
- ✅ Convex reactivity (page updates after mutation)
- ✅ Database state persistence

**Recommendation:**

- **Keep**: One simplified "happy path" test (create→verify exists)
- **Move to Component Tests**: Edit workflow, delete workflow, status changes
- **Reduce from 67 lines to ~15 lines**

---

### Test 2: "Evaluation persists to database" (Lines 96-131)

**What It Tests:**

- Seed baseline data
- Create student via API
- Navigate to /evaluations/new
- Fill search filter
- Click student row
- Verify selection state

**What Could Move to Component Tests:**

| Current E2E Step   | Component Test Equivalent          |
| ------------------ | ---------------------------------- |
| Navigate to page   | Test page renders with structure   |
| Fill search filter | Test search debouncing, filtering  |
| Click student row  | Test selection state toggle        |
| Verify selection   | Test "X students selected" display |

**What MUST Remain in E2E:**

- ✅ Real Convex `students.list` query with filters
- ✅ Real Convex `evaluations.create` mutation (end-to-end)
- ✅ Full form submission flow
- ✅ Database persistence verification

**Recommendation:**

- **Keep**: Full submission test (create evaluation end-to-end)
- **Move to Component Tests**: Filter input behavior, selection UI
- **Reduce from 36 lines to ~10 lines**

---

### Test 3: "Category created by admin can be used in evaluation by teacher" (Lines 154-229)

**What It Tests:**

- Admin creates category (UI)
- New browser context for teacher
- Teacher views evaluation page
- Category appears in dropdown

**What Could Move to Component Tests:**

| Current E2E Step              | Component Test Equivalent      |
| ----------------------------- | ------------------------------ |
| Admin creates category (UI)   | Test category form validation  |
| Teacher views evaluation page | Test category dropdown renders |

**What MUST Remain in E2E:**

- ✅ **Cross-user authentication** (only E2E can test)
- ✅ **Real Convex data sharing** (admin creates → teacher sees)
- ✅ Convex reactivity across sessions
- ✅ Multi-context browser handling

**Recommendation:**

- **Keep 100%**: This test cannot be replicated with component tests
- It's the only test that verifies cross-user Convex data sharing

---

## Proposed Refactoring

### Option A: Minimal Consolidation (Conservative)

**Keep Integration Tests As-Is**

- No changes to existing tests
- Component tests cover NEW scenarios only
- Slightly more total test count but safer

**Time to implement:** 0 hours

---

### Option B: Active Consolidation (Recommended)

**Rewrite integration.spec.ts:**

```typescript
// Simplified integration.spec.ts
import { test, expect } from '@playwright/test';
import { createStudent, seedBaseline } from './convex-client';
import { getTestSuffix } from './helpers';

test.describe('Integration Tests (Real Backend) @integration', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	// KEEP: Only tests that require real Convex
	test('Student CRUD with real backend', async ({ page }) => {
		const suffix = getTestSuffix('crud');
		const studentId = `S_${suffix}`;
		const englishName = `CrudTest_${suffix}`;

		// 1. Create via API
		await createStudent({
			studentId,
			englishName,
			grade: 10,
			e2eTag: `e2e-test_${suffix}`
		});

		// 2. Verify appears (Convex reactivity)
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText(englishName)).toBeVisible();

		// 3. Simple edit test
		// ... minimal edit workflow

		// 4. Simple delete test
		// ... minimal delete workflow
	});

	// KEEP: Full evaluation submission
	test('Teacher can create evaluation end-to-end', async ({ page }) => {
		await seedBaseline();
		// ... full form submission test
	});

	// KEEP: Cross-user data sharing (CANNOT be component tested)
	test('Admin category available to teacher', async ({ page, context }) => {
		// ... existing test, but simplified
	});
});

// REMOVE: These scenarios move to component tests
// - Filter combinations
// - Form validation
// - Loading states
// - Empty states
// - Dialog interactions
```

**Component Tests (NEW FILE: `src/routes/admin/students/+page.spec.ts`):**

```typescript
// Test everything else:
// - Filter combinations (grade + search + status)
// - Form validation logic
// - Loading/error/empty states
// - Dialog open/close behavior
// - Pagination
```

**Impact:**

- Integration tests: ~50 lines (down from ~200)
- New component tests: ~100 lines
- Total: ~150 lines (same as before)
- **Better coverage** (isolated component testing)
- **Faster feedback** (component tests run faster)

---

### Option C: Aggressive Consolidation

**Convert ALL integration tests to use mocks where possible:**

- Only keep tests that verify actual Convex database operations
- Move UI interactions to component tests

**Risk:** May miss integration bugs that only appear with real Convex

**Not Recommended** for production systems

---

## Recommendation: Option B

**Rationale:**

1. **Cross-user tests MUST stay in E2E** - Component tests can't verify Convex data sharing between users
2. **CRUD workflows overlap with E2E tests in other files** - `students.create.spec.ts`, `students.edit.spec.ts`, `students.delete.spec.ts` already cover these
3. **Reduces duplicate coverage** - Remove overlap between `integration.spec.ts` and individual feature specs

**Files Affected:**

- `e2e/integration.spec.ts` - Simplify to ~50 lines
- `src/routes/admin/students/+page.spec.ts` - NEW component tests
- `src/routes/admin/categories/+page.spec.ts` - NEW component tests
- `src/routes/evaluations/new/+page.spec.ts` - NEW component tests

**Estimated Time:**

- 2-3 hours to refactor integration tests
- 4-6 hours to write component tests
- **Net: 6-9 hours investment for better coverage**

---

## What NOT to Consolidate

These scenarios should STAY in E2E regardless:

| Scenario                        | Reason                                    |
| ------------------------------- | ----------------------------------------- |
| Cross-user data sharing         | Component tests can't simulate multi-user |
| Real Convex database operations | Must verify actual persistence            |
| Auth/permission flows           | Requires real auth context                |
| Full user journeys              | End-to-end verification                   |
| Performance testing             | Requires full stack                       |

## Quick Wins

**Immediately removable (no component tests needed):**

- Lines 66-69 in integration.spec.ts - Status select test (covered in `students.edit.spec.ts`)
- Lines 82-86 in integration.spec.ts - Delete dialog test (covered in `students.delete.spec.ts`)

**Comment out for now, add to component tests later:**

- Filter combination tests (move to component tests when created)
- Form validation tests (move to component tests when created)
