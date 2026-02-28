# Implementation Plan: Student Grades with Classes

## Overview

Implement support for student grades with classes (e.g., 7-1, 7-2, 7-3), where each class has a homeroom teacher, and students can be labeled as IB students.

## Target Schema

### New `classes` table
```typescript
classes: defineTable({
  grade: v.number(),        // 7-12
  class: v.string(),        // "1", "2", "3" (or empty for single class)
  homeroomTeacherId: v.optional(v.id('users'))
})
  .index('by_grade_class', ['grade', 'class'])
```

### Modified `students` table
```typescript
students: defineTable({
  englishName: v.string(),
  chineseName: v.string(),
  studentId: v.string(),
  classId: v.id('classes'),     // REQUIRED - foreign key to classes
  isIB: v.optional(v.boolean()), // IB student label
  status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled')),
  note: v.optional(v.string()),
  e2eTag: v.optional(v.string())
})
  .index('by_studentId', ['studentId'])
  .index('by_classId', ['classId'])  // NEW index
  .index('by_status', ['status'])
  .index('by_e2eTag', ['e2eTag'])
```

---

## Implementation Steps

### Phase 1: Schema Update (Critical Path)

#### 1.1 Update schema.ts
- [ ] Add `classes` table definition
- [ ] Modify `students` table: remove `grade`, add `classId`, add `isIB`
- [ ] Add `by_classId` index on students

#### 1.2 Run codegen
```bash
npx convex codegen
```

#### 1.3 Deploy schema
```bash
npx convex dev  # for local
# or
npx convex deploy  # for production
```

---

### Phase 2: Code Already Compatible (No Changes Needed)

The following files already support the new schema:

- ✅ [`src/convex/classes.ts`](src/convex/classes.ts) - Already uses `classes` table and `by_classId` index
- ✅ [`src/routes/admin/classes/+page.svelte`](src/routes/admin/classes/+page.svelte) - Admin UI for managing classes
- ✅ [`src/routes/admin/students/+page.svelte`](src/routes/admin/students/+page.svelte:29) - Already uses `classId` and `classInfo`
- ✅ [`src/convex/students.ts`](src/convex/students.ts:17) - Already accepts `classId` in queries and mutations
- ✅ [`src/lib/e2e-utils.ts`](src/lib/e2e-utils.ts:335) - Already has class creation

---

### Phase 3: Fix Affected Code

#### 3.1 Fix backup.ts
- [ ] Line 83: Update type reference to use classId
- [ ] Line 112: Fix student object to use classId
- [ ] Line 153, 262: Query classes table
- [ ] Line 267-269: Get grade from class via classId
- [ ] Line 292-296: Get grade from class via classId for student progression

#### 3.2 Fix audit.ts  
- [ ] Line 111: Change `student.grade` to get grade from class

---

### Phase 4: Fix Test Files

All test files use direct `ctx.db.insert('students', {...})` which must include `classId` instead of `grade`.

#### 4.1 test.setup.ts helper
- [ ] Ensure `createStudentWithClass` helper exists (already done)

#### 4.2 Fix test files

| File | Student Inserts | Action |
|------|-----------------|--------|
| [`src/convex/weekly-reports.test.ts`](src/convex/weekly-reports.test.ts:42) | 7 | Use API or add class creation |
| [`src/convex/backup.test.ts`](src/convex/backup.test.ts:10) | 11 | Use API or add class creation |
| [`src/convex/evaluations.test.ts`](src/convex/evaluations.test.ts:11) | 15 | Use API or add class creation |
| [`src/convex/audit.test.ts`](src/convex/audit.test.ts:19) | 1 | Use API or add class creation |
| [`src/convex/students.duplicates.test.ts`](src/convex/students.duplicates.test.ts:10) | 4 | Use API or add class creation |
| [`src/convex/categories.test.ts`](src/convex/categories.test.ts) | 2 | Use API or add class creation |
| [`src/convex/students.test.ts`](src/convex/students.test.ts) | Check | Use API or add class creation |

#### Recommended Approach for Tests
Use the `createStudentWithClass` helper from test.setup.ts, or call the API mutation `api.students.create` which handles classId validation.

---

### Phase 5: Data Migration (If needed for production)

If there's existing production data:

1. Create classes for each unique grade
2. Migrate students to classes (one class per grade if no class divisions)
3. Update any hardcoded references

---

## Files Summary

### Will Need Changes
| File | Changes |
|------|---------|
| [`src/convex/schema.ts`](src/convex/schema.ts) | Add classes table, modify students |
| [`src/convex/backup.ts`](src/convex/backup.ts) | Fix grade references |
| [`src/convex/audit.ts`](src/convex/audit.ts:111) | Fix student.grade reference |
| Test files (7 files) | Add classId to student inserts |

### Already Compatible
| File | Status |
|------|--------|
| [`src/convex/classes.ts`](src/convex/classes.ts) | ✅ Works |
| [`src/routes/admin/classes/+page.svelte`](src/routes/admin/classes/+page.svelte) | ✅ Works |
| [`src/routes/admin/students/+page.svelte`](src/routes/admin/students/+page.svelte) | ✅ Works |
| [`src/convex/students.ts`](src/convex/students.ts) | ✅ Works |

---

## Testing Checklist

After implementation:
- [ ] Run `npx convex codegen` - should succeed with no errors
- [ ] Run unit tests - should pass
- [ ] Run e2e tests - should pass
- [ ] Verify admin/classes page works
- [ ] Verify admin/students page works
- [ ] Verify IB student toggle works
- [ ] Verify class homeroom teacher assignment works
