## Why

Currently, only teachers and administrators can view student evaluation records through the platform. Students have no visibility into their own evaluation history, which limits their ability to track their progress and understand feedback. Enrolled students should be able to access their own evaluation timeline in a read-only manner to promote transparency and student engagement.

## What Changes

- Add support for student email authentication using the format `s[id number]@std.hwhs.tc.edu.tw` (student domain)
- Introduce a new `student` role distinct from `teacher`, `admin`, and `super` roles
- Modify the authentication system to allow student domain emails (`@std.hwhs.tc.edu.tw`) ONLY if the email matches an existing student record in the database
- Create a student-specific view of the evaluation timeline page that:
  - Shows all evaluations for the logged-in student
  - Hides teacher names to maintain evaluative anonymity
  - Disables editing/deleting capabilities (read-only access)
- Add a new Convex query to fetch student evaluations without teacher-identifying information
- Update the existing `src/routes/evaluations/student/[studentId]/+page.svelte` to support student role viewing
- Link student user accounts to their student records via studentId matching (email prefix matches studentId)
- **Pre-registration required**: Students can only login if their student record was previously imported by an admin

## Capabilities

### New Capabilities

- `student-auth`: Handle student authentication with @std.hwhs.tc.edu.tw domain, map student emails to student records
- `student-evaluation-view`: Allow students to view their own evaluations anonymously (without teacher names), read-only access

### Modified Capabilities

- `evaluations`: Add query to fetch evaluations for a student without teacher name information
- `users`: Extend user role type to include 'student', add student-to-user linking logic

## Impact

**Affected Code:**

- `src/convex/auth.ts` - Add student domain support, modify email validation
- `src/convex/schema.ts` - Update user role enum to include 'student'
- `src/convex/users.ts` - Add student user handling and student record linking
- `src/convex/evaluations.ts` - Add query for student evaluation view (without teacher names)
- `src/routes/evaluations/student/[studentId]/+page.svelte` - Add student role detection and read-only mode
- `src/lib/components/timeline/EvaluationsTimeline.svelte` - Already supports `showTeacherName` prop

**APIs:**

- New query: `evaluations.getStudentEvaluationsForStudent` - Returns evaluations without teacher names

**Dependencies:**

- Better Auth for authentication flow
- Convex for data queries

**Systems:**

- Authentication system needs to recognize and handle student domain emails
- User management shouldn't show students at all
- Student access is controlled by the 'enrolled/not enrolled' status in the student management UI (link to users database targeting the student)
-
