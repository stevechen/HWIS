# Capability: Student Authentication

## Overview

Enable students to authenticate using their school email addresses (`s[id number]@std.hwhs.tc.edu.tw`) and automatically link their user accounts to their student records.

## Use Cases

### UC-1: Enrolled Student Login

**Actor**: Enrolled student with email `s123@std.hwhs.tc.edu.tw`  
**Precondition**: Admin has imported student record with `studentId = "123"` and `status = "Enrolled"`  
**Flow**:

1. Student clicks "Sign in with Google" and selects their school email
2. System validates email domain (`@std.hwhs.tc.edu.tw`)
3. System extracts `studentId = "123"` from email
4. System finds matching student record in database
5. System creates user account with `role='student'` and links to student record
6. Student is logged in and redirected to evaluation page
7. Student sees their evaluation timeline

### UC-2: Not Enrolled Student Login

**Actor**: Student with email `s456@std.hwhs.tc.edu.tw`  
**Precondition**: Admin has imported student record with `studentId = "456"` but `status = "Not Enrolled"`  
**Flow**:

1. Student attempts login with school email
2. System validates email and finds matching student record
3. System creates user account and logs student in
4. Student is redirected to evaluation page
5. System checks enrollment status and shows "Access Denied" message
6. Student sees: "You are currently not enrolled. Please contact administration."

### UC-3: Student Not in System (Correct Domain, No Record)

**Actor**: Student with email `s789@std.hwhs.tc.edu.tw`  
**Precondition**: No student record with `studentId = "789"` exists in database  
**Flow**:

1. Student attempts login with school email
2. System validates email domain and format
3. System extracts `studentId = "789"` from email
4. System queries students table - **NO MATCH FOUND**
5. System **REJECTS** authentication
6. Student sees error: "This email is not registered in the system. Please contact administration."
7. **No user account is created**

### UC-4: Non-Student Email Attempt

**Actor**: User with email `hacker@gmail.com` or `teacher@hwhs.tc.edu.tw`  
**Flow**:

1. User attempts login
2. System checks email domain
3. If `@hwhs.tc.edu.tw`: treated as staff (separate flow)
4. If neither staff nor student domain: authentication rejected with domain error

## Requirements

### REQ-1: Student Email Domain Validation

- The system SHALL accept email addresses with the domain `@std.hwhs.tc.edu.tw`
- The system SHALL reject student domain emails that do not match the pattern `s[number]@std.hwhs.tc.edu.tw`
- Staff domain (`@hwhs.tc.edu.tw`) SHALL remain separate and restricted to staff roles only

### REQ-2: Pre-Registered Student Verification

- Before allowing student login, the system SHALL:
  - Extract the studentId from the email prefix (e.g., `s123` → `123`)
  - Query the `students` table for a record with matching `studentId`
  - If NO matching student record exists, reject authentication with "Email not in system" message
  - If a matching student record exists, proceed with user creation/login

### REQ-3: Automatic Student User Creation

- On first successful login with a verified student email, the system SHALL:
  - Create a new user record in the `users` table
  - Set `role` to `'student'`
  - Set `status` to `'active'`
  - Store the student record `_id` in `users.studentRecordId`

### REQ-4: Student ID Extraction Logic

- The system SHALL parse student emails using the pattern: `s` followed by one or more digits
- Valid examples: `s1@std.hwhs.tc.edu.tw`, `s123@std.hwhs.tc.edu.tw`, `s9999@std.hwhs.tc.edu.tw`
- Invalid examples (should be rejected): `student@std.hwhs.tc.edu.tw`, `s@std.hwhs.tc.edu.tw`, `abc@std.hwhs.tc.edu.tw`

### REQ-5: Non-Existent Student Record Handling

- If no student record exists with the extracted studentId:
  - Authentication SHALL be rejected
  - User SHALL see message: "This email is not registered in the system. Please contact administration."
  - No user account SHALL be created

### REQ-6: Existing Student User Handling

- If a student user already exists for the email:
  - The system SHALL NOT create a duplicate user
  - The existing user record SHALL be used
  - Normal login proceeds

## API Specification

### Queries/Mutations

#### `users.viewer` (Modified)

**Purpose**: Get current user with student link information

**Response**:

```typescript
{
  _id: Id<'users'>,
  authId: string,
  role: 'super' | 'admin' | 'teacher' | 'student',
  status: 'active' | 'pending',
  name?: string,
  studentRecordId?: Id<'students'>,  // NEW: Link to student record
  studentId?: string                 // NEW: The studentId code (e.g., "123")
}
```

### Helper Functions

#### `extractStudentId(email: string): string | null`

**Purpose**: Extract numeric studentId from student email

**Algorithm**:

1. Check if email ends with `@std.hwhs.tc.edu.tw`
2. Extract local part (before @)
3. Check if local part matches pattern `s` followed by one or more digits
4. Return the numeric portion (without the 's' prefix)
5. Return null if pattern doesn't match

#### `linkStudentToUser(ctx, userId: Id<'users'>, studentId: string): Promise<void>`

**Purpose**: Link a user record to a student record

**Algorithm**:

1. Query `students` table by `studentId` field
2. If found, update `users` record with `studentRecordId`
3. Log the link creation for audit purposes

## Data Model Changes

### `users` Table

```typescript
{
  authId: v.optional(v.string()),
  name: v.optional(v.string()),
  role: v.optional(v.union(
    v.literal('super'),
    v.literal('admin'),
    v.literal('teacher'),
    v.literal('student')  // NEW
  )),
  status: v.optional(v.union(v.literal('pending'), v.literal('active'))),
  studentRecordId: v.optional(v.id('students')),  // NEW: Link to student record
  e2eTag: v.optional(v.string())
}
```

## Error Handling

| Error                           | Handling                                                  |
| ------------------------------- | --------------------------------------------------------- |
| Invalid student email format    | Reject authentication with "Invalid student email format" |
| Student record not found        | Create user without link; show warning on evaluation page |
| Duplicate studentId in database | Log error; use first matching record                      |

## Security Considerations

1. **Domain Isolation**: Student domain (`@std.hwhs.tc.edu.tw`) is strictly separated from staff domain (`@hwhs.tc.edu.tw`)
2. **Auto-creation Only**: Student users can only be created through OAuth login, not manually
3. **Role Immutability**: Once set to 'student', role cannot be changed to staff roles through UI
4. **Link Verification**: Student link is verified on every evaluation page load to ensure enrollment status is current
