# Demo Mode URLs

This document contains all available demo mode URLs for testing the HWIS Point Management System without authentication.

## How Demo Mode Works

Add `?demo={role}` to any URL to bypass authentication and view the application with demo data. Demo mode uses mock data and allows testing different user roles without logging in.

## Available Demo Roles

| Role | Parameter | Description |
|------|-----------|-------------|
| Teacher | `?demo=teacher` | View as a regular teacher (limited permissions) |
| Admin | `?demo=admin` | View as an admin (full management access) |
| Super | `?demo=super` | View as super user (system-wide access) |
| Student | `?demo=student` | View as a student (read-only access) |

## Common Demo URLs

### Student Evaluation Timeline

View a student's evaluation history and timeline:

```
http://localhost:5173/evaluations/student/STU001?demo=teacher
http://localhost:5173/evaluations/student/STU001?demo=admin
http://localhost:5173/evaluations/student/STU001?demo=super
http://localhost:5173/evaluations/student/STU001?demo=student
```

### Weekly Reports (Admin)

View weekly evaluation reports:

```
http://localhost:5173/admin/weekly-reports?demo=true
http://localhost:5173/admin/weekly-reports?demo=admin
```

### Admin Pages

```
# Student Management
http://localhost:5173/admin/students?demo=admin

# Teacher Management
http://localhost:5173/admin/teachers?demo=admin

# Category Management
http://localhost:5173/admin/categories?demo=admin

# Audit Trail
http://localhost:5173/admin/audit?demo=admin
```

### Teacher Pages

```
# Evaluations Dashboard
http://localhost:5173/evaluations?demo=teacher

# Student Search
http://localhost:5173/evaluations/student/STU001?demo=teacher
```

## Demo Data

When in demo mode, the application uses predefined mock data:

### Demo Student
- **Name:** John Smith (張約翰)
- **Student ID:** SE2024001
- **Grade:** 10
- **Class:** A

### Demo Evaluations
Sample evaluation entries are displayed with various categories:
- Creativity points (Leadership, Designing & Creating)
- Activity points (Dress code, Sports day)
- Service points (Campus maintenance, Respect manner)
- Admin Section points

## Feature Flags in Demo Mode

### Teacher Demo (`?demo=teacher`)
- Can view student evaluations
- Cannot see teacher names on evaluation cards
- Cannot filter by other teachers
- Can add/edit/delete their own evaluations

### Admin Demo (`?demo=admin`)
- Can view all evaluations (including admin-only)
- Can filter by teachers
- Can access admin pages
- Can view audit trails

### Super Demo (`?demo=super`)
- Same as admin with additional system-level access
- Can manage other admins

### Student Demo (`?demo=student`)
- Read-only view
- Can see their own evaluations (anonymized teacher names)
- Cannot add or edit evaluations

## Notes

- Demo mode bypasses all authentication checks
- All mutations (create/update/delete) are disabled in demo mode
- Demo mode is indicated by a visual badge on the page
- Data is not persisted - all changes are local to the session
- Use demo mode for presentations, testing, and development

## Development Server

Default local development URL:
```
http://localhost:5173
```

To start the development server:
```bash
bun run dev
```
