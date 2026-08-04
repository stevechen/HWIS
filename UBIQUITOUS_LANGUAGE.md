# Ubiquitous Language — HWIS Point Management System

## People & Roles

| Term           | Definition                                                  | Aliases to avoid   |
| -------------- | ----------------------------------------------------------- | ------------------ |
| **User**       | An authentication identity in the system with a role        | Login, account     |
| **Student**    | A person enrolled at the school (grades 7–12) with a record | Pupil, learner     |
| **Teacher**    | A staff member who gives/takes evaluation points            | Staff, faculty     |
| **Admin**      | A staff member with elevated system management privileges   | Manager, moderator |
| **Super User** | A user with full system access, including admin promotion   | Root, owner        |

## Class & Academic Structure

| Term                 | Definition                                                    | Aliases to avoid       |
| -------------------- | ------------------------------------------------------------- | ---------------------- |
| **Class**            | A grouping of students by grade and class name (e.g., "10-1") | Section, homeroom      |
| **Grade**            | The year level (7–12) a student belongs to                    | Year, level            |
| **Semester**         | An academic term identifier attached to evaluations           | Term, period           |
| **Homeroom Teacher** | A teacher assigned to oversee a specific class                | Class teacher, advisor |

## Student Lifecycle

| Term                       | Definition                                                       | Aliases to avoid      |
| -------------------------- | ---------------------------------------------------------------- | --------------------- |
| **Enrolled**               | A student currently attending the school                         | Active, registered    |
| **Not Enrolled**           | A student no longer attending the school                         | Inactive, withdrawn   |
| **Student ID**             | A unique 6- or 7-digit identifier assigned to each student       | Student number, SID   |
| **House Assignment**       | The act of placing a student into one of the four houses         | House placement       |
| **Duplicate**              | A student record with a Student ID matching an existing record   | Conflict, collision   |
| **Import**                 | Bulk creation of student records from an external source (Excel) | Upload, batch create  |
| **Academic Year Rollover** | Year-end process that advances grades and archives graduates     | Promotion, graduation |

## Evaluation System

| Term                 | Definition                                                             | Aliases to avoid    |
| -------------------- | ---------------------------------------------------------------------- | ------------------- |
| **Evaluation**       | A point-based assessment given by a Teacher to a Student in a Category | Point, score, entry |
| **Point Category**   | A named category defining what behaviors are evaluated                 | Category, rubric    |
| **Merit Criteria**   | Positive behaviors for which points are awarded                        | Positive criteria   |
| **Demerit Criteria** | Negative behaviors for which points are deducted                       | Negative criteria   |
| **CAS Alignment**    | Alignment of a Point Category to Creativity, Activity, or Service      | IB alignment        |
| **Value**            | The numeric point adjustment (-2, -1, +1, +2) of an Evaluation         | Score, amount       |
| **Weekly Report**    | A summary of all Evaluations grouped by the Friday of each week        | Weekly summary      |

## House System

| Term             | Definition                                                                | Aliases to avoid      |
| ---------------- | ------------------------------------------------------------------------- | --------------------- |
| **House**        | One of four competitive student houses — Heracles, Wukong, Ixbalam, Setna | Team, group           |
| **House Event**  | A time-bound event that awards House Points across multiple Houses        | Competition, activity |
| **House Points** | Points awarded to a House through Events                                  | Points, score         |

## Operations & Audit

| Term          | Definition                                                          | Aliases to avoid       |
| ------------- | ------------------------------------------------------------------- | ---------------------- |
| **Audit Log** | A historical record of all data mutations with performer and values | Journal, trail         |
| **Backup**    | A JSON snapshot of the full database for restore purposes           | Dump, export, snapshot |

## Relationships

- A **User** has exactly one **Role** (super, admin, teacher, or student)
- A **Student** is identified from a student-domain Google email (`s{studentId}@std.hwhs.tc.edu.tw`); they have no **User** record
- A **Student** belongs to exactly one **Class**
- A **Class** has exactly one **Grade** and one **Class** name
- A **Class** may have at most one **Homeroom Teacher**
- A **Teacher** creates many **Evaluations**
- An **Evaluation** references exactly one **Student**, one **Teacher**, and one **Point Category**
- A **Point Category** contains many **Merit Criteria** and **Demerit Criteria**
- A **Point Category** may align to any subset of **CAS** (Creativity, Activity, Service)
- A **Student** belongs to exactly one **House** (optional)
- A **House Event** awards **House Points** to zero or more **Houses**
- An **Audit Log** entry records one **Action** by one **User** on one **Target**

## Example dialogue

> **Dev:** "When a **Teacher** creates an **Evaluation**, do we update the student's **House Points**?"

> **Domain expert:** "No — **Evaluations** and **House Points** are separate systems. A **Teacher** assigns a **Value** in a **Point Category** to a **Student**. That has no effect on the **House**.

> **Dev:** "So how do **House Points** get awarded?"

> **Domain expert:** "Through **House Events**. An **Admin** creates an **Event** with a date range and point awards per **House**. It's a competition, not a per-student calculation."

> **Dev:** "And when we run the **Academic Year Rollover**, what happens to **Evaluations** from the past year?"

> **Domain expert:** "They're cleared. The rollover advances **Grades**, moves **Students** to new **Classes**, and archives **Graduates**. But the **Audit Log** still preserves the full history."

> **Dev:** "What if an **Import** finds a **Duplicate** **Student ID**?"

> **Domain expert:** "The system supports three modes: halt (fail the whole import), skip (keep the existing record), or update (overwrite with the new data)."

## Resolved ambiguities

### "point" — ✅ Fixed in code

- **Issue:** Variable `points` in `students.ts:959` was used for house event points, shadowing the same name used for evaluation values in the same function.
- **Fix:** Renamed the loop variable to `housePoints` in `students.ts`.
- **Audit column:** Changed label from "Points" to "Eval Points" in audit table to distinguish evaluation values from house points.

### "account" — ✅ Fixed in code

- **Issue:** Comments and error messages in `onboarding.ts` and `resetDb.ts` used "account" colloquially to mean "user" or "user profile".
- **Fix:** Changed "owner accounts" → "owner users", "allowlisted account" → "allowlisted user", "real accounts" → "real users".

### "category" — ❓ Not fixed (deemed non-ambiguous)

- **Issue:** The Convex table is `point_categories` but the module file is `categories.ts`.
- **Assessment:** "Category" consistently refers to `point_categories` throughout the codebase. No other concept uses the term. No code change needed.
