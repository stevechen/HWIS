# HWIS (Hong Wen International School) Point Management System

A comprehensive point management system for Hong Wen International School teachers to manage student evaluations.

## Purpose

For HWIS teachers to give/take away evaluation points to students.

## Roles & Authentication

Authentication is handled via Google Single Sign-On (SSO).

### Super User
- Full system access

### Admins (designated by super user)
- **Teacher Management:** CRUD operations, approve/activate/deactivate teachers
- **Student Management:**
  - Import students from Excel (duplicate Student IDs halt import with detailed error info)
  - Enable/disable students
  - CRUD operations with warnings for students with existing points records (suggest disabling instead)
  - Academic year migration:
    - Advance all grade levels by one year
    - Import new grade 7 students
    - Archive grade 12 students for 1 year (record graduation year), then export and delete after a year
- **Data Aggregation & Reports:**
  - Report:
    - All students' total points list:
      - This school year
      - Date range
      - Export to Excel
  - View:
    - All students' total points list:
      - This school year
      - Date range
      - Weekly trend
      - Monthly trend
    - Individual student's total point:
      - All
      - Date range
      - Weekly trend
      - Monthly trend
    - Individual student's points breakdown:
      - By teacher
      - By date
  - Separate viewing page for last-year archived students (view only, excluded from editing/searching)
- **Category Management:** Add/modify/archive categories and sub-categories (cannot removed if there are already point records with this category or if it's created before this school year for historical record compatibility). All categories default to +1 point.
- **Audit Trail:** Track all point changes with history of who changed what and when
- **Database Management:** Archive whole grade, export and delete whole grade, backup to file, delete
- **Note:** Admins can also be teachers

### Teachers (approved by an admin)
- **Student Search:** Fuzzy search by English name, filter by grade
- **Point Management:** Give points (-2, -1, 1, 2) with details, adjust their own points given
- **View Own Records:** Points given/taken, student's points trend (only their own records)

### Students
- No system access

## Point System - Category Structure

### Creativity
- Leadership
- Designing & Creating
- Self learning
- Self management

### Activity
- Dress code & shoes
- Sports day
- Game attendance
- English speaking vs. Chinese speaking

### Service
- Campus maintenance cleaning duty
- Respect manner (Language & Behaviors)
- Teacher supporting

### Admin Section
- Student council
- Others

### Parents' Day

### Other Issues

## Tech Stack

- **Framework:** Svelte/SvelteKit
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **UI Components:** Shadcn-svelte
- **Backend:** Convex
- **Version Control:** GitHub
- **Deployment:** Vercel

## Student Information

- English Name
- Chinese Name
- Student ID
- Grade (7-12)
- Graduation Year

## Design Considerations

- **Responsive Design:** Usable on both mobile and desktop (mobile-first approach with modern CSS media queries)
- **Extensibility:** Student, Teacher, and Admin roles are designed as the base for future systems
- **Point System:** This is the first module being developed for the platform
- **No Point Thresholds:** Points are purely for record-keeping; no automatic rewards or penalties based on point totals

## Getting Started

```sh
bun install
bun dev
```
