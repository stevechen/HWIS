# CAS Dry Run — Session/Script Doc (Summer Pilot Test Sessions)

**App:** https://hwis.vercel.app · **Feedback form:** https://docs.google.com/forms/d/e/1FAIpQLSd9KPnE8FhFL_WdNKBSMOZC001gtFbSZdHJUIlIJPykLEpJSA/viewform
**Window:** Aug 10 – Aug 21, 2026 · **Cast:** 2 admins, 4–6 teachers, 2+ students
**Status:** Ready to run.

> This doc IS the training. Hand it to participants as-is. Teachers are busy with
> summer school + prep, so every session is short, scripted, and self-serve.

---

## 0. Prerequisites (before Aug 10)

1. **Restore last-year data, 0 evaluations** on production (backup exists; do not wipe).
   Teachers create all evals from scratch — that's the point.
2. **Create the Google Form** ("Pilot Feedback") feeding the log Sheet, per
   resolved design (#62). Put the form link everywhere the doc references it.
3. **Seed the doc with links** in the orientation (this doc URL + form URL).
4. Confirm the 4 test accounts work end-to-end (1 admin, 1 teacher, 1 student).

> **No build required for student login.** Students are identified purely by their
> Google email (`s####@std.hwhs.tc.edu.tw` → student record via
> `resolveStudentFromEmail`); they never need a user profile. After login the home
> route redirects students straight to their own evaluation page (server-side,
> `src/routes/+page.server.ts`), so no manual navigation is needed.

### Role → sign-in map

| Email domain          | Role                               |
| --------------------- | ---------------------------------- |
| `@hwhs.tc.edu.tw`     | Teacher (or admin, if allowlisted) |
| `@std.hwhs.tc.edu.tw` | Student                            |

---

## 1. The three sessions at a glance

| #   | Session         | When                       | Who                                  | ~Time     |
| --- | --------------- | -------------------------- | ------------------------------------ | --------- |
| 1   | **Teacher Day** | Mon Aug 10                 | Teachers (+ admin for account setup) | 60 min    |
| 2   | **Student Day** | Tue Aug 11                 | Students + facilitators + admin      | 30 min    |
| 3   | **Admin block** | Wed Aug 12 (or convenient) | Admins                               | 45–60 min |

Rough-edges recap at the top of Sessions 2 & 3 (5 min). Session 1's brief is the orientation.

---

## 2. Session 1 — Teacher Day (Mon Aug 10, ~60 min)

### Orientation (10–15 min)

1. Open https://hwis.vercel.app → **Sign in with Google**.
2. Email domain = role: `@hwhs.tc.edu.tw` → Teacher; students use `@std.hwhs.tc.edu.tw`.
3. Where things live: this session doc + the **feedback form** (link). Log everything.
4. Ground rules:
   - Real data — last-year students, **0 evals**. You create them all.
   - ~60 min today. Play, don't train — the doc is the training.
   - Anything that blocks you → **🔴 Blocker on the form / tell an admin immediately**.
5. **One live demo eval** so the pattern is clear before everyone plays.

### Tasks (all manual)

- [ ] Log in / log out
- [ ] Give an evaluation with a **preset category + criteria**
- [ ] Give an evaluation with a **preset category + custom criteria**
- [ ] Choose points with **keyboard shortcuts**
- [ ] Give an evaluation to **multiple students by name**
- [ ] **Edit / delete** a given evaluation _(still in-week → editable)_
- [ ] Understand the **weekly lock** _(explained verbally: evals lock Mon 00:00 of the week after)_
- [ ] View a student's evaluation history (timeline view)
- [ ] **Filter by student** in the evaluations timeline
- [ ] **Sort** existing evaluations
- [ ] **Show/hide comments**

After play: teachers have awarded real points → **student data now exists.**

---

## 3. Session 2 — Student Day (Tue Aug 11, ~30 min)

### Brief (5 min)

- Today's tasks (below) + known rough edges:
  1. `/houses/display` may error for non-admins despite being a "public" screen — known.
  2. Weekly lock: edits only within the Mon–Sun week.
  3. Category delete blocked when referenced by evals — expected.

### Tasks (facilitator-led; kids do NOT touch the form)

- [ ] Student **logs in / out** with `@std.hwhs.tc.edu.tw`
- [ ] Student **views their own evaluations** (scores exist from Session 1)

Facilitators log every student issue on the feedback form with **role = Student**.

---

## 4. Session 3 — Admin block (Wed Aug 12, ~45–60 min)

### Brief (5 min)

- Today's tasks (below) + the same known rough-edges list.
- **Deferred items are listed for awareness — do NOT test them:** restore backup ·
  advance year · clear-all data · large bulk moves. These get post-pilot admin training.

### Tasks — keep manual

- [ ] Approve / revoke an account
- [ ] Add / edit a student
- [ ] Import students (CSV)
- [ ] Assign a teacher to a class
- [ ] Move a student to a different class
- [ ] Move a student / multiple students to a different house
- [ ] Disable a student
- [ ] Add a category + criteria; remove a category (in use + not in use)
- [ ] Download a weekly report _(available now — reports don't wait for the lock)_
- [ ] View all teachers' evaluations
- [ ] Show/hide teachers' names in the evaluations timeline
- [ ] Show/hide Unenrolled students
- [ ] Sort the timeline
- [ ] Filter by teacher in the timeline view
- [ ] House display check (`/houses/display` renders)

### Tasks — feature tours (~30s each, auto-covered by e2e)

- [ ] Class CRUD + drag-and-drop
- [ ] Student CRUD + bulk moves
- [ ] Backup create / download
- [ ] Audit column toggle
- [ ] House events CRUD

---

## 5. Feedback form (how it works)

- **Google Form → Google Sheet.** Reporters fill the form; rows land in the log.
- **Anonymous** — no name/email captured.
- Fields: Who's reporting? (Teacher/Admin/Student) · Where were you? · What were you trying to do? · What happened? · What did you expect? · **How did it go?** (✅ Smooth / 🟢 Suggestion / 🟡 Bug / 🔴 Blocker)
- **Sheet columns (dev-owned):** Timestamp · Role · Where · Trying · Happened · Expected · Outcome · Status · Notes
- **Triage:** dev triages evenings. 🔴 → same-day critical-fix. Known rough edges → next brief, not the sheet.

---

## 6. Triage & daily cadence (dev)

- Daily evening triage of the log (Open / Investigating / Fixed / Won't-fix / Duplicate).
- 🔴 Blockers → same-day critical-fix flow.
- During the pilot: fix same-day critical bugs; everything else gets logged for the post-pilot rollout.

---

## 7. Out of scope

- Building/fixing product beyond same-day critical fixes.
- Permanent production data or the real school-year rollout — separate effort after the pilot.
- Deferred admin actions (restore/advance/clear-all/large bulk) — post-pilot admin training.
