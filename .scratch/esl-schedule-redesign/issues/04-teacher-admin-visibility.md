# 04: Hide Admin nav from ESL teachers

**What to build:** The `esl.nav.admin` link and `esl-dashboard.admin` section are only visible when `isEslAdmin` is true. The `/esl/admin` layout redirect remains the hard gate. Teachers see Schedule, Calendar, Slips, ZipGrade only — no Admin link in the ESL nav bar.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `esl.nav.admin` link hidden unless `isEslAdmin === true`
- [ ] `esl-dashboard.admin` section hidden unless `isEslAdmin === true`
- [ ] `/esl/admin` layout redirect (`esl/admin/+layout.svelte`) unchanged as hard gate
- [ ] ESL teachers see only: Schedule, Calendar, Slips, ZipGrade in nav
- [ ] ESL admins see all five: Schedule, Calendar, Slips, ZipGrade, Admin
