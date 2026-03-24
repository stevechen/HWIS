# Capability: Student Evaluation View

## Overview

Allow authenticated students to view their own evaluation records in a read-only timeline view. The view must hide teacher-identifying information to maintain evaluative anonymity.

## Requirements

### REQ-1: Enrollment Status Check

- The system SHALL check the student's enrollment status before displaying evaluations
- If `students.status === 'Not Enrolled'`, the system SHALL display an "Access Denied" message
- If `students.status === 'Enrolled'`, the system SHALL display the evaluation timeline

### REQ-2: Anonymous Evaluation Data

- The system SHALL NOT expose teacher names to students
- The system SHALL NOT expose teacher IDs to students
- Evaluation responses SHALL include: `_id`, `value`, `category`, `details`, `timestamp`

### REQ-3: Read-Only Access

- Students SHALL NOT be able to create evaluations
- Students SHALL NOT be able to edit evaluations
- Students SHALL NOT be able to delete evaluations
- The UI SHALL NOT show edit buttons, delete buttons, or creation forms

### REQ-4: Complete Evaluation History

- The system SHALL display ALL evaluations for the student, regardless of which teacher or admin created them
- The source of the evaluation (teacher vs admin) SHALL NOT be distinguishable by students
- No filtering by source SHALL be available to students

### REQ-5: Student-Only Access

- Students SHALL only be able to view their OWN evaluations
- The system SHALL use the linked `studentRecordId` from the user record to fetch evaluations
- Attempts to access other students' evaluations SHALL be blocked

### REQ-6: Student Record Link Assumption

- Student users ALWAYS have a linked `studentRecordId` (enforced at login)
- The system assumes the link exists and does not need to handle missing links
- If somehow a student user has no link, it's an error state that should be logged

## API Specification

### Query: `evaluations.getStudentEvaluationsAnonymous`

**Purpose**: Fetch all evaluations for a student without teacher-identifying information

**Arguments**:

```typescript
{
	// No arguments needed - uses authenticated user's studentRecordId
}
```

**Authentication**: Requires authenticated user with `role === 'student'`

**Response**:

```typescript
Array<{
	_id: Id<'evaluations'>;
	value: number;
	category: string;
	details: string;
	timestamp: number;
	// Note: teacherName, teacherId, and isAdmin are intentionally omitted
	// Students see anonymous evaluations without source identification
}>;
```

**Algorithm**:

1. Get authenticated user
2. Verify user.role === 'student'
3. Get user.studentRecordId
4. If no studentRecordId, return empty array (UI handles error display)
5. Query evaluations table by studentId
6. Join with point_categories to get category name
7. For each evaluation, return only non-identifying fields
8. Sort by timestamp descending

**Error Cases**:

- User not authenticated: Return authentication error
- User role !== 'student': Return permission denied
- Student record not found: Return empty array

## UI Specification

### Page: `/evaluations/student/[studentId]/+page.svelte`

**Student Role Detection**:

```typescript
const isStudent = $derived.by(() => {
	if (userQuery && !userQuery.isLoading && userQuery.data?.role) {
		return userQuery.data.role === 'student';
	}
	return false;
});
```

**Student-Specific Query**:

```typescript
const studentEvalsQuery = $derived.by(() => {
	if (isDemo) return undefined;
	if (!isStudent) return undefined;
	return useQuery(api.evaluations.getStudentEvaluationsAnonymous, () => ({}));
});
```

**Enrollment Status Check**:

```typescript
// Fetch student record to check enrollment status
const studentRecordQuery = $derived.by(() => {
	if (!isStudent || !userQuery?.data?.studentRecordId) return undefined;
	return useQuery(api.students.getById, () => ({
		id: userQuery.data.studentRecordId
	}));
});

const enrollmentStatus = $derived(studentRecordQuery?.data?.status);
const isEnrolled = $derived(enrollmentStatus === 'Enrolled');
```

**Component Props for Student View**:

```svelte
<EvaluationsTimeline
  evaluations={studentEvaluations}
  showStudentName={false}
  showTeacherName={false}  // Critical: hide teacher names
  sortAscending={displayState.sortAscending}
  showDetails={displayState.showDetails}
  enableLongPress={false}  // Disable editing
  canEditEntry={() => false}  // No editing allowed
  showControls={false}  // Hide filter controls
>
```

### Access Denied State

When `!isEnrolled`:

```svelte
<div class="access-denied">
	<h2>Access Denied</h2>
	<p>You are currently not enrolled. Please contact administration for assistance.</p>
</div>
```

### Empty State

When no evaluations exist:

```svelte
<div class="empty-state">
	<p>No evaluations found yet.</p>
</div>
```

### Student Record Link (Always Present)

Since students can only login if their record exists in the system, `studentRecordId` is always available for authenticated student users. The UI does not need to handle a missing link scenario.

## Data Flow

```
Student Login
    │
    ▼
Load /evaluations/student/[studentId]
    │
    ▼
Check user.role === 'student'
    │
    ▼
Get user.studentRecordId
    │
    ▼
Fetch student record (for enrollment status)
    │
    ▼
┌─────────────────┬─────────────────┐
│                 │                 │
▼                 ▼                 ▼
Not Enrolled   Enrolled        No Record
    │              │                 │
    ▼              ▼                 ▼
Access Denied  Fetch anonymous   Show Error
Message        evaluations       Message
                   │
                   ▼
            Render Timeline
            (no teacher names)
```

## Security Requirements

1. **Teacher Anonymity**: Teacher names and IDs must NEVER be exposed in student-facing queries
2. **Self-Access Only**: Students can only view their own evaluations
3. **Read-Only**: All mutations must reject requests from student users
4. **Enrollment Gate**: Not enrolled students cannot view any evaluation data

## Testing Requirements

### Unit Tests

1. **Anonymous Query**:
   - Returns evaluations without teacherName/teacherId
   - Returns empty array for student without link
   - Returns error for non-student users

2. **Enrollment Check**:
   - Returns evaluations only when status === 'Enrolled'
   - Returns access denied UI when status === 'Not Enrolled'

### E2E Tests

1. **Student View**:
   - Student sees evaluation timeline
   - Teacher names are not visible
   - Edit/delete buttons are not present
   - Long-press does not trigger edit dialog

2. **Access Control**:
   - Not enrolled student sees access denied
   - Student cannot access other students' evaluations
   - Student cannot edit evaluations
