# Implementation Plan: Student Grades with Classes

## Overview

This plan implements the ability for student grades to have classes (e.g., 7-1, 7-2, 7-3), each class with a homeroom teacher, and the ability to label students as IB students.

## Data Model Design

### Option: Keep grade as number + add class field

**Rationale:**
- Backward compatibility with existing grade queries
- Proper normalization (grade and class are separate attributes)
- Simplified grade advancement logic
- Clean sorting by numeric grade

---

## Phase 1: Database Schema Changes

### 1.1 Add `classes` Table (New)

Create a new table to manage classes with homeroom teachers.

```typescript
classes: defineTable({
  grade: v.number(),           // 7-12
  class: v.string(),            // "1", "2", "3" (class identifier)
  homeroomTeacherId: v.optional(v.id('users')),
  e2eTag: v.optional(v.string())
})
  .index('by_grade_class', ['grade', 'class'])
  .index('by_teacher', ['homeroomTeacherId'])
```

**Constraints:**
- Unique constraint on (grade, class) combination
- `homeroomTeacherId` references a teacher user

### 1.2 Update `students` Table

Add new fields to existing students table.

```typescript
students: defineTable({
  // ... existing fields ...
  class: v.optional(v.string()),  // "1", "2", "3" - links to classes table
  isIB: v.optional(v.boolean()),  // IB student flag
})
  .index('by_grade_class', ['grade', 'class'])  // New compound index
```

---

## Phase 2: Class Management (Backend)

### 2.1 Class CRUD Operations

Create `src/convex/classes.ts`:

```typescript
// List all classes, optionally filtered by grade
export const list = query({
  args: { grade: v.optional(v.number()) },
  handler: async (ctx, args) => { ... }
});

// Create a new class
export const create = mutation({
  args: {
    grade: v.number(),
    class: v.string(),
    homeroomTeacherId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => { ... }
});

// Update class (including homeroom teacher)
export const update = mutation({
  args: {
    id: v.id('classes'),
    homeroomTeacherId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => { ... }
});

// Delete class (only if no students assigned)
export const remove = mutation({ ... });

// Get classes by grade
export const getByGrade = query({ ... });

// Get homeroom teacher's class
export const getByTeacher = query({ ... });
```

### 2.2 Seed Default Classes

Create a mutation to seed default classes for grades 7-12:

```typescript
export const seedDefaultClasses = mutation({
  args: { testToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // Create 7-1, 7-2, 7-3 for each grade 7-12
    // 3 classes per grade = 18 classes total
  }
});
```

---

## Phase 3: Student Schema Updates (Backend)

### 3.1 Update Student Mutations

Update `src/convex/students.ts`:

#### Create Student
- Add `class` (optional string) parameter
- Add `isIB` (optional boolean) parameter
- Validate class belongs to the grade (if provided)
- Auto-assign default class if not provided (class "1")

#### Update Student  
- Add `class` and `isIB` to updatable fields
- Validate class belongs to the grade

#### List Students
- Add filtering by `class` parameter
- Add filtering by `isIB` parameter
- Add `by_grade_class` compound index support

#### Import from Excel
- Add `class` column parsing
- Add `isIB` column parsing (true/false or yes/no)

#### Advance Grades
- Preserve class when advancing (7-1 → 8-1)

### 3.2 Update Student Queries

```typescript
export const list = query({
  args: {
    search: v.optional(v.string()),
    status: v.optional(v.union(v.literal('Enrolled'), v.literal('Not Enrolled'))),
    grade: v.optional(v.number()),
    class: v.optional(v.string()),        // NEW
    isIB: v.optional(v.boolean()),        // NEW
  },
  handler: async (ctx, args) => { ... }
});
```

---

## Phase 4: UI Updates (Student Management)

### 4.1 Student List Page

File: `src/routes/admin/students/+page.svelte`

**Updates:**
1. Add "Class" column to table
2. Add "IB" badge column
3. Add class filter dropdown (grouped by grade)
4. Add IB filter toggle
5. Update grade filter to show "7-1", "7-2" format option

**Display Format:**
- Grade + Class: "7-1" (when class exists), "7" (when no class)
- IB Badge: Show "IB" badge for IB students

### 4.2 Add/Edit Student Form

**Updates:**
1. Add class dropdown (populated from classes table, filtered by selected grade)
2. Add IB checkbox/toggle
3. When grade changes, refresh class dropdown options

### 4.3 Import Students

**Updates:**
1. Add "class" column to CSV template
2. Add "isIB" column to CSV template
3. Preview and import these new fields

---

## Phase 5: UI Updates (Class Management)

### 5.1 New Class Management Page

File: `src/routes/admin/classes/+page.svelte` (new)

**Features:**
1. List all classes with grade, class number, homeroom teacher
2. Create new class form
3. Edit class (assign/change homeroom teacher)
4. Delete class (with validation)
5. Filter by grade

### 5.2 Navigation

Add "Classes" link to admin navigation (update `src/routes/+layout.svelte` or admin menu)

---

## Phase 6: Seed Function Updates

### 6.1 Update `students.seed` Mutation

```typescript
export const seed = mutation({
  handler: async (ctx, args) => {
    // Update seed data to include class
    const students = [
      {
        englishName: 'Alice Smith',
        chineseName: '史艾莉',
        studentId: 'S1001',
        grade: 7,
        class: '1',           // NEW
        isIB: true,           // NEW
        status: 'Enrolled',
        note: 'Top performer'
      },
      // ... more students with class and isIB
    ];
  }
});
```

### 6.2 Update E2E Test Utilities

File: `src/lib/e2e-utils.ts`

Update `CreateStudentOptions` interface:
```typescript
export interface CreateStudentOptions {
  studentId: string;
  englishName: string;
  chineseName: string;
  grade: number;
  class?: string;      // NEW
  isIB?: boolean;      // NEW
  status: string;
  e2eTag?: string;
}
```

### 6.3 Update Test Data Factory

File: `src/convex/dataFactory.ts`

Update student creation to include class and isIB fields.

---

## Phase 7: Advanced Features (Future)

### 7.1 Bulk Class Assignment

- Allow admin to assign students to classes in bulk
- Move entire class to next grade

### 7.2 Class-specific Reports

- Generate reports by class
- View homeroom teacher's students

### 7.3 IB Program Management

- Track IB students separately
- IB-specific reports and metrics

---

## Implementation Order

```
Phase 1: Schema Changes
  └─ Add classes table
  └─ Add class/isIB fields to students

Phase 2: Class Management Backend
  └─ CRUD for classes
  └─ Seed default classes
  └─ Teacher assignment

Phase 3: Student Backend Updates
  └─ Update create/update/list mutations
  └─ Update import functions
  └─ Update advanceGrades

Phase 4: Student UI Updates
  └─ Update student list (columns, filters)
  └─ Update add/edit form
  └─ Update import

Phase 5: Class UI
  └─ New class management page
  └─ Navigation

Phase 6: Seed Functions
  └─ Update seed mutation
  └─ Update e2e-utils
  └─ Update test data factory

Phase 7: Evaluation Backend
  └─ Update evaluation queries to include class/isIB

Phase 8: Timeline Component
  └─ Update EvaluationEntry type
  └─ Update card display for class
  └─ Add IB badge to cards
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/convex/schema.ts` | Add classes table, update students |
| `src/convex/classes.ts` | NEW - Class CRUD operations |
| `src/convex/students.ts` | Add class/isIB to all operations |
| `src/routes/admin/classes/+page.svelte` | NEW - Class management UI |
| `src/routes/admin/students/+page.svelte` | Add class/IB columns and filters |
| `src/lib/e2e-utils.ts` | Update CreateStudentOptions |
| `src/convex/dataFactory.ts` | Update student creation |
| `src/lib/components/timeline/types.ts` | Add class and isIB to EvaluationEntry |
| `src/lib/components/timeline/EvaluationsTimeline.svelte` | Display class and IB badge in cards |

---

## Phase 8: Timeline Component Updates

### 8.1 Update EvaluationEntry Type

File: `src/lib/components/timeline/types.ts`

```typescript
export interface EvaluationEntry {
  // ... existing fields ...
  class?: string;      // NEW - class identifier (e.g., "1", "2", "3")
  isIB?: boolean;      // NEW - IB student flag
}
```

### 8.2 Update Timeline Card Display

File: `src/lib/components/timeline/EvaluationsTimeline.svelte`

**Updates to card snippet:**

1. **Grade Display** - Change from "G7" to "G7-1" format:
```svelte
{#if studentGrade || entry.grade}
  <span class="bg-muted px-2 py-0.5 rounded-full text-xs shrink-0">
    G{studentGrade || entry.grade}{entry.class ? `-${entry.class}` : ''}
  </span>
{/if}
```

2. **IB Badge** - Add IB indicator:
```svelte
{#if entry.isIB}
  <span class="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded text-xs shrink-0">
    IB
  </span>
{/if}
```

### 8.3 Update Evaluation Queries

Files: `src/convex/evaluations.ts`

Update evaluation queries to include `class` and `isIB` from the student document:

```typescript
// In list, getByStudent, etc.
// Fetch student to get class and isIB
const student = await ctx.db.get(eval_.studentId);
// Add to return object:
class: student?.class,
isIB: student?.isIB,
```

---

## Testing Strategy

1. **Unit Tests**: Test class CRUD, student CRUD with new fields
2. **E2E Tests**: 
   - Create/view/edit classes
   - Assign homeroom teachers
   - Student with class and IB fields
   - Import with new fields
   - Filter by class/IB
   - Timeline displays class and IB correctly
3. **Migration Tests**: Ensure existing students work with nullable class/isIB
