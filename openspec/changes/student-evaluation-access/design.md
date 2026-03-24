## Architecture Overview

This feature enables enrolled students to log in and view their evaluation records anonymously (without teacher names). The system needs to:

1. Accept student domain emails (`@std.hwhs.tc.edu.tw`)
2. Auto-create student users linked to their student records
3. Allow login for all students, but show "access denied" if not enrolled
4. Provide a read-only evaluation timeline view without teacher names

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Authentication Flow                       │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────┐    ┌─────────────┐    ┌─────────────────────┐
│ Student Login   │───▶│  Auth Hook  │───▶│ Domain Validation   │
│ (Google OAuth)  │    │  (Better    │    │ @std.hwhs.tc.edu.tw │
└─────────────────┘    │   Auth)     │    └─────────────────────┘
                       └─────────────┘              │
                                                    ▼
                                          ┌─────────────────────┐
                                          │ Extract studentId   │
                                          │ from email prefix   │
                                          └─────────────────────┘
                                                    │
                                                    ▼
                                          ┌─────────────────────┐
                                          │ Check if student    │
                                          │ record exists in DB │
                                          └─────────────────────┘
                                                    │
                              ┌─────────────────────┴─────────────────────┐
                              │ No match                                  │ Match found
                              ▼                                           ▼
                    ┌──────────────────┐                      ┌─────────────────────┐
                    │ Reject login     │                      │ Auto-create User    │
                    │ "Email not in    │                      │ role='student'      │
                    │ system"          │                      └─────────────────────┘
                    └──────────────────┘                                │
                                                                          ▼
                                                               ┌─────────────────────┐
                                                               │ Link to Student     │
                                                               │ Record              │
                                                               └─────────────────────┘
                                                                          │
                                                                          ▼
                                                               ┌─────────────────────┐
                                                               │ Enrollment Check    │
                                                               │ (on evaluation page)│
                                                               └─────────────────────┘
```

## Data Flow: Student Evaluation Access

```
┌────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Student User  │────▶│  +page.svelte    │────▶│  viewer query    │
│  (role=student)│     │  (detects role)  │     │  (gets user)     │
└────────────────┘     └──────────────────┘     └──────────────────┘
                                                          │
                                                          ▼
                                               ┌──────────────────┐
                                               │  Check student   │
                                               │  record link     │
                                               └──────────────────┘
                                                          │
                                                          ▼
                                               ┌──────────────────┐
                                               │  Enrollment      │
                                               │  Status Check    │
                                               │  (Enrolled/Not)  │
                                               └──────────────────┘
                                                          │
                              ┌───────────────────────────┴───────────────────────────┐
                              │ Not Enrolled                                          │ Enrolled
                              ▼                                                       ▼
                    ┌──────────────────┐                                 ┌──────────────────┐
                    │ Show "Access     │                                 │ Fetch evaluations│
                    │ Denied" message  │                                 │ (without teacher │
                    └──────────────────┘                                 │ names)           │
                                                                         └──────────────────┘
                                                                                  │
                                                                                  ▼
                                                                       ┌──────────────────┐
                                                                       │ Render timeline  │
                                                                       │ read-only mode   │
                                                                       └──────────────────┘
```

## Key Technical Decisions

### 1. Student Email Format & Domain

- **Email format**: `s[id number]@std.hwhs.tc.edu.tw`
- **Domain restriction**: Only `@std.hwhs.tc.edu.tw` allowed for students
- **ID extraction**: Parse email prefix `s123` → extract numeric portion `123` → match to `studentId`

### 2. Pre-Registration Model

- Students MUST be imported into the `students` table BEFORE they can login
- Admin batch imports students at the beginning of each academic year
- Students can be added or un-enrolled sporadically throughout the year
- Only ~200 specific students out of 2000 total belong to this system
- On login attempt: if studentId from email is not found in students table → reject with "Email not in system"

### 3. User Record Structure

Student users in the `users` table will have:

```typescript
{
  authId: string,           // From Better Auth
  role: 'student',          // New role type
  status: 'active',         // Always active (enrollment status tracked separately)
  studentRecordId: Id<'students'>,  // Reference to students table (always set)
  name?: string             // Optional, from OAuth profile
}
```

### 3. Student Record Linking

The `users` table needs a new optional field `studentRecordId` (Id<'students'>) to link to the student record:

- On first login, extract studentId from email (e.g., `s123` → `123`)
- Query `students` table by `studentId` field
- Store the `_id` of the matching student record in `users.studentRecordId`

### 4. Enrollment Status Check

Enrollment status is stored in the `students` table (`status: 'Enrolled' | 'Not Enrolled'`):

- This check happens AFTER login (not during authentication)
- On the evaluation page, fetch the linked student record
- If `status !== 'Enrolled'`, show "access denied" UI instead of evaluations

### 5. Anonymous Evaluation View

A new Convex query `getStudentEvaluationsAnonymous` will:

- Accept the student's user ID
- Look up linked student record
- Return all evaluations for that student
- Exclude `teacherName`, `teacherId`, and `isAdmin` from the response
- Students cannot distinguish between teacher and admin evaluations

### 6. Page Behavior for Students

The existing `src/routes/evaluations/student/[studentId]/+page.svelte` will be modified:

- Detect `role === 'student'` from user query
- When student role detected:
  - Ignore URL `studentId` parameter (always use linked student)
  - Call new `getStudentEvaluationsAnonymous` query
  - Set `showTeacherName={false}` on EvaluationsTimeline
  - Disable `enableLongPress` (no editing)
  - Hide filter controls (students don't need filters)

## Files to Modify

### Schema Changes

- `src/convex/schema.ts`: Add 'student' to role union type, add `studentRecordId` field to users table

### Authentication Changes

- `src/convex/auth.ts`: Add `@std.hwhs.tc.edu.tw` to allowed domains, add student auto-creation logic in auth hook

### API Changes

- `src/convex/users.ts`: Add student linking logic, update viewer query to include student link
- `src/convex/evaluations.ts`: Add `getStudentEvaluationsAnonymous` query

### UI Changes

- `src/routes/evaluations/student/[studentId]/+page.svelte`: Add student role detection, use anonymous query, read-only mode

## Security Considerations

1. **Email Domain Validation**: Strict check for `@std.hwhs.tc.edu.tw` prevents staff from accidentally getting student access
2. **Student ID Matching**: Only links if the extracted studentId exists in the database (prevents orphaned users)
3. **Enrollment Gate**: Enrollment check on evaluation page prevents unauthorized access even if authenticated
4. **Data Anonymization**: Teacher names explicitly excluded from student-facing queries
5. **Read-Only Access**: Students cannot edit/delete evaluations (no mutation permissions)

## Error Handling

| Scenario                                        | Behavior                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Student email with no matching student record   | **Login rejected** - Show "This email is not registered in the system. Please contact administration." |
| Enrolled status = 'Not Enrolled'                | Show "Access Denied - Please contact administration" message                                           |
| No evaluations found                            | Show empty state "No evaluations yet"                                                                  |
| Student record exists but marked 'Not Enrolled' | Can login but sees "Access Denied" on evaluation page                                                  |

## Testing Strategy

1. **Unit Tests**:
   - Email parsing logic (extract studentId from email)
   - Student user auto-creation
   - Enrollment status check
   - Anonymous evaluation query (no teacher names)

2. **E2E Tests**:
   - Student login flow with @std.hwhs.tc.edu.tw
   - Access denied for not enrolled students
   - Evaluation view without teacher names
   - Attempted edit/delete actions blocked
