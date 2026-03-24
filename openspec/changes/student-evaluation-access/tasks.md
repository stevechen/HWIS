# Implementation Tasks: Student Evaluation Access

## Schema Changes

- [ ] **SCHEMA-1**: Add 'student' role to users table role union
  - File: `src/convex/schema.ts`
  - Add `v.literal('student')` to the role union type

- [ ] **SCHEMA-2**: Add studentRecordId field to users table
  - File: `src/convex/schema.ts`
  - Add `studentRecordId: v.optional(v.id('students'))` field
  - Add index `by_studentRecordId` for efficient lookups

## Authentication Changes

- [ ] **AUTH-1**: Add student domain constant and validation
  - File: `src/convex/auth.ts`
  - Add `STUDENT_DOMAIN = 'std.hwhs.tc.edu.tw'` constant
  - Add `isStudentEmail(email: string): boolean` helper function
  - Add `extractStudentIdFromEmail(email: string): string | null` function

- [ ] **AUTH-2**: Add student record lookup function
  - File: `src/convex/auth.ts`
  - Create `getStudentByStudentId(ctx, studentId: string)` query
  - Returns student record or null

- [ ] **AUTH-3**: Extend auth hook with pre-registration check
  - File: `src/convex/auth.ts`
  - In `after` hook, detect student emails
  - Extract studentId from email
  - Query students table for matching record
  - **If no match**: Reject authentication with "Email not in system" message
  - **If match found**: Create user record with role='student' and link to student record

## User Management Changes

- [ ] **USERS-1**: Update viewer query to include student link
  - File: `src/convex/users.ts`
  - Modify `viewer` query to return `studentRecordId` field
  - Join with `students` table to return `studentId` code

- [ ] **USERS-2**: Add student linking helper function
  - File: `src/convex/users.ts`
  - Create `linkStudentToUser(ctx, userId, studentId)` function
  - Query students table by studentId and update user record

- [ ] **USERS-3**: Filter students from user listing
  - File: `src/convex/users.ts`
  - Modify `list` query to exclude users with role='student'
  - Ensure students don't appear in admin user management UI

## Evaluation API Changes

- [ ] **EVAL-1**: Add anonymous evaluation query
  - File: `src/convex/evaluations.ts`
  - Create `getStudentEvaluationsAnonymous` query
  - Return evaluations without teacherName and teacherId fields
  - Use authenticated user's studentRecordId

- [ ] **EVAL-2**: Add enrollment check helper
  - File: `src/convex/evaluations.ts`
  - Create helper to verify enrollment status before returning data
  - Return appropriate error if not enrolled

## UI Changes - Evaluation Page

- [ ] **UI-1**: Add student role detection
  - File: `src/routes/evaluations/student/[studentId]/+page.svelte`
  - Add `isStudent` derived state based on user.role
  - Add `studentRecordId` from user query

- [ ] **UI-2**: Add student-specific evaluation query
  - File: `src/routes/evaluations/student/[studentId]/+page.svelte`
  - Add `studentEvalsQuery` using `getStudentEvaluationsAnonymous`
  - Separate from teacher/admin query logic

- [ ] **UI-3**: Add enrollment status check
  - File: `src/routes/evaluations/student/[studentId]/+page.svelte`
  - Fetch student record to check status
  - Show access denied UI if not enrolled
  - Show error UI if no student record linked

- [ ] **UI-4**: Configure EvaluationsTimeline for student view
  - File: `src/routes/evaluations/student/[studentId]/+page.svelte`
  - Set `showTeacherName={false}` (already supported)
  - Set `enableLongPress={false}` to disable editing
  - Set `canEditEntry={() => false}`
  - Hide filter controls for students

- [ ] **UI-5**: Add student-specific UI states
  - File: `src/routes/evaluations/student/[studentId]/+page.svelte`
  - Create "Access Denied" component for not enrolled students
  - Ensure proper styling with Tailwind CSS
  - (Note: "Student Record Not Found" state is not needed since login requires pre-existing record)

## Testing

- [ ] **TEST-1**: Unit test - student ID extraction from email
  - Test valid patterns: s1, s123, s9999
  - Test invalid patterns: student, s, abc, empty

- [ ] **TEST-2**: Unit test - student authentication flow
  - Test login rejected when student record doesn't exist
  - Test login succeeds when student record exists
  - Test auto-creation on first successful login
  - Test linking to existing student record

- [ ] **TEST-3**: Unit test - anonymous evaluation query
  - Test returns evaluations without teacher data
  - Test returns empty for unenrolled students
  - Test returns error for non-student users

- [ ] **TEST-4**: E2E test - student login flow
  - Test login with @std.hwhs.tc.edu.tw email
  - Test automatic student user creation
  - Test redirect to evaluation page

- [ ] **TEST-5**: E2E test - student evaluation view
  - Test evaluations are visible for enrolled students
  - Test teacher names are hidden
  - Test edit/delete buttons are not present
  - Test long-press doesn't trigger edit

- [ ] **TEST-6**: E2E test - enrollment access control
  - Test "Access Denied" message for not enrolled students
  - Test evaluations are hidden when not enrolled
  - Test error message when student record not found

## Verification Steps

Before marking complete:

1. [ ] Admin can import students via existing student management UI
2. [ ] Student with `s123@std.hwhs.tc.edu.tw` can log in (if studentId "123" exists)
3. [ ] Student with non-existent studentId gets "Email not in system" error
4. [ ] Student user is auto-created with role='student' on first login
5. [ ] Student is linked to correct student record
6. [ ] Enrolled student sees evaluation timeline
7. [ ] Teacher names are not visible in evaluations
8. [ ] Student cannot edit/delete evaluations
9. [ ] Not enrolled student sees "Access Denied"
10. [ ] Student doesn't appear in user management list
