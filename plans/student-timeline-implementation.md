# Student Timeline Page Implementation Plan

## Overview
Implement a student evaluation timeline page that displays point history for individual students, with role-based views for teachers and admins.

## Architecture

### Route Structure
```
/evaluations/student/[studentId]  - Student timeline page
```

### Data Flow
```
User clicks eval card -> Navigate to /evaluations/student/[studentId]
  |
  v
Page loads -> Check authentication -> Fetch student details
  |
  v
Fetch evaluation history based on user role
  |
  v
Render timeline with role-specific features
```

## Components

### 1. Student Timeline Page (`src/routes/evaluations/student/[studentId]/+page.svelte`)

**Features:**
- [x] Authentication enforcement (redirect to login if not authenticated)
- [x] Student info header (full name, grade, class section)
- [x] Breadcrumb navigation back to evaluations page
- [x] Role-based timeline views:
  - **Teacher View**: "Your Assigned Points" - only evaluations by current teacher
  - **Admin View**: "All Points History" - all evaluations with filter toggle
- [x] CSS Grid layout with three columns for perfect centering
- [x] Alternating zig-zag pattern for timeline entries
- [x] Compact design with hidden comments by default
- [x] Hover interaction to reveal comments
- [x] Color-coded nodes and borders
- [x] Admin-specific styling (purple border outline)
- [x] Points badge positioned absolutely at top-right corner

**Timeline Entry Features:**
- [x] Date/time stamps (descending default, optional ascending toggle)
- [x] Light gray separators between entries
- [x] Hover tooltips with additional details
- [x] Award/deduction icons based on point value sign
- [x] Consistent point colors (green for positive, red for negative)
- [x] Assigned reason text
- [x] Admin-specific styling (purple border outline, star icons, "Admin Adjustment" prefix)
- [x] Optional grouping by assigning user (admin view only)

### 2. Convex Queries (`src/convex/evaluations.ts`)

**New Queries:**
```typescript
// Get student details by ID
export const getStudent = query({
  args: { studentId: v.id('students'), testToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.testToken);
    if (!user) return null;
    return await ctx.db.get(args.studentId);
  }
});

// Get evaluation history for a student (teacher view)
export const getStudentEvaluationsByTeacher = query({
  args: {
    studentId: v.id('students'),
    testToken: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const user = await requireUserProfile(ctx, args.testToken);
    const evaluations = await ctx.db
      .query('evaluations')
      .withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
      .filter((q) => q.eq(q.field('teacherId'), user._id))
      .collect();
    return enrichEvaluations(ctx, evaluations);
  }
});

// Get all evaluation history for a student (admin view)
export const getStudentEvaluationsAll = query({
  args: {
    studentId: v.id('students'),
    testToken: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.testToken);
    const evaluations = await ctx.db
      .query('evaluations')
      .withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
      .collect();
    return enrichEvaluations(ctx, evaluations);
  }
});
```

### 3. Evaluation Card Updates (`src/routes/evaluations/+page.svelte`)

**Changes:**
- [x] Wrapped each evaluation card in a clickable element
- [x] Added `onclick` handler to navigate to student timeline
- [x] Pass student ID in URL parameter

```svelte
<Card.Root
  class="cursor-pointer hover:shadow-md transition-shadow"
  onclick={() => void goto(`/evaluations/student/${eval_.studentId}`)}
>
  <!-- existing card content -->
</Card.Root>
```

### 4. Server-Side Load Function (`src/routes/evaluations/student/[studentId]/+page.ts`)

**Features:**
- [x] Disabled SSR (`export const ssr = false`)
- [x] Passes `testRole` and `studentId` to page component

## Pending Features

### 1. Convex Queries (`src/convex/evaluations.ts`)
- [ ] Add `getStudent` query to fetch student details by ID
- [ ] Add `getStudentEvaluationsByTeacher` query for teacher view
- [ ] Add `getStudentEvaluationsAll` query for admin view
- [ ] Replace mock data with real Convex queries

### 2. Tests
- [ ] Write browser unit tests for student timeline page
- [ ] Write E2E tests for navigation and role-based views
- [ ] Write E2E tests for timeline features (sorting, filtering)
- [ ] Write E2E tests for error handling scenarios

## Final Design Decisions

### CSS Grid Layout
The timeline uses a three-column CSS Grid layout for perfect centering:
- Column 1: Date/time elements (left side)
- Column 2: Central timeline line and nodes (center)
- Column 3: Content cards (right side)

This approach ensures that:
- The timeline line is always perfectly centered
- Date/time elements and content cards are positioned symmetrically
- The layout is responsive and works well on different screen sizes

### Alternating Zig-Zag Pattern
Timeline entries alternate between left and right positions:
- Even-indexed entries: Date/time on right, content on left
- Odd-indexed entries: Date/time on left, content on right

This creates a visually appealing zig-zag pattern that makes it easy to scan through the timeline.

### Color Coding Logic
- **Positive points**: Green dots (`bg-emerald-500`) and green text (`text-emerald-600`)
- **Negative points**: Red dots (`bg-red-500`) and red text (`text-red-600`)
- **Admin entries**: Purple border outline (`border-purple-300`) on cards, regardless of point value

### Hover Interaction
Comments are hidden by default and revealed on hover:
- Comments are wrapped in a `div` with `opacity-0` and `max-h-0` classes
- On hover, the `group-hover` modifier changes these to `opacity-100` and `max-h-40`
- This creates a smooth transition effect when hovering over the card

### Points Badge
The points badge is positioned absolutely at the top-right corner of each card:
- Uses `absolute top-3 right-3` classes for positioning
- Shows the point value with a `+` or `-` prefix
- Color-coded based on point value (green for positive, red for negative)

### Admin Filter Toggle
Admin view includes a filter toggle to show/hide:
- Admin points only
- Teacher points only
- Both admin and teacher points

This allows admins to quickly filter the timeline to see only the entries they're interested in.

### Sort Toggle
Both teacher and admin views include a sort toggle to change the order:
- Newest First (default): Descending order by timestamp
- Oldest First: Ascending order by timestamp

This allows users to view the timeline in the order that makes the most sense for their needs.

### Show/Hide Details Toggle
Both teacher and admin views include a toggle to show/hide details:
- Show Details: Displays all timeline entry details
- Hide Details: Hides comments and other non-essential information

This allows users to focus on the most important information and reduce visual clutter.

## Styling Requirements

### Color Palette
- **Positive points**: Green (`text-emerald-600`, `bg-emerald-50`)
- **Negative points**: Red (`text-red-600`, `bg-red-50`)
- **Admin points**: Purple (`text-purple-600`, `bg-purple-50`, `border-purple-200`)
- **Separators**: Light gray (`border-gray-200`)

### Icons
- **Positive award**: `Award` or `PlusCircle`
- **Negative deduction**: `MinusCircle` or `XCircle`
- **Admin adjustment**: `Star` (star-shaped icon)

### Layout
- Compact inline student info at top
- Vertically scrollable timeline container
- Clear visual hierarchy with proper spacing

## Authentication & Authorization

### Route Protection
- Use existing `+layout.server.ts` pattern for SSR protection
- Check authentication before allowing access
- Redirect to `/login` if not authenticated

### Role-Based Access
- **Teachers**: Can only see their own evaluations for the student
- **Admins**: Can see all evaluations for the student
- **Students**: Not allowed to access this page (redirect to home)

## Testing Strategy

### Browser Unit Tests (`tests/routes/evaluations/student/[studentId]/+page.test.ts`)

**Test Scenarios:**
1. Page renders with loading state
2. Student info displays correctly
3. Timeline entries render with correct data
4. Teacher view shows only teacher's evaluations
5. Admin view shows all evaluations
6. Breadcrumb navigation works
7. Sorting toggle changes order
8. Admin filter toggle works correctly
9. Error handling for missing student
10. Error handling for failed data fetch

### E2E Tests (`e2e/student-timeline.spec.ts`)

**Test Scenarios:**
1. Navigation from eval card to student page
2. Role-based view validation (teacher vs admin)
3. Timeline entry rendering with accurate data
4. Admin filter toggle functionality
5. Correct styling and icons per point type
6. Sorting behavior (ascending/descending)
7. Breadcrumb navigation back to evaluations
8. Loading states for timeline data
9. Error handling for missing student records
10. Error handling for failed point history retrieval

## File Structure

```
src/
├── convex/
│   └── evaluations.ts          # Add new queries
├── lib/
│   └── components/
│       └── ui/
│           ├── breadcrumb/     # New breadcrumb component
│           └── timeline-entry/ # New timeline entry component
├── routes/
│   └── evaluations/
│       ├── +page.svelte        # Update: make cards clickable
│       └── student/
│           └── [studentId]/
│               ├── +page.svelte # New: student timeline page
│               └── +page.ts     # New: server-side auth check
tests/
└── routes/
    └── evaluations/
        └── student/
            └── [studentId]/
                └── +page.test.ts # New: browser unit tests
e2e/
└── student-timeline.spec.ts   # New: E2E tests
```

## Edge Cases & Error Handling

1. **Student not found**: Display error message with link back to evaluations
2. **No evaluations**: Show empty state message
3. **Network errors**: Display retry option
4. **Unauthorized access**: Redirect to login
5. **Invalid student ID**: Show 404-style error

## Performance Considerations

- Use Convex indexes for efficient queries
- Implement pagination if evaluation history is large
- Cache student details to avoid redundant queries
- Use Svelte 5 reactivity for efficient updates
