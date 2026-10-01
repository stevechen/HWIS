## Destination

An ADR (plus implementation tickets) specifying how an ESL school year is archived: when a year is archived, a complete read-only JSON file for that year lands in the shared HWIS Google Drive folder, the year's ESL rows leave Convex, and an admin can browse the archived year in-app. Settled enough that a build session can execute it without re-deciding anything.

## Notes

- **Domain:** read `CONTEXT.md` and `UBIQUITOUS_LANGUAGE.md` before naming anything. Use their vocabulary.
- **Skills every session should consult:** `grilling` and `domain-modeling`.
- **ADRs that shape this work:** ADR-0006 (year-end migration — currently mandates destructive deletes), ADR-0012 (backup retention — records the Drive cold archive as _not functioning_), ADR-0013 (snapshot versioning), ADR-0022 (ESL year advancement).
- **Standing preference:** plan, don't build. Each ticket resolves a decision. Deliverables come after the map is clear.
- **Scope discipline:** ESL only. The CAS/HWIS year-end migration is a separate destination.
- **Key measured fact driving the effort:** `buildSnapshot` (`src/convex/shared/backup_snapshot.ts`) captures only `students`, `evaluations`, `users`, `point_categories`, `classes`, `houseEvents` — **no `esl_*` tables**. The ESL department is currently not backed up by any path.

## Decisions so far

<!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->

_None yet._

## Not yet specified

- **Interaction with `purgeOrphanedClasses`** (`src/convex/esl/cohorts.ts`) — it deletes `esl_classes` whose cohort is absent. Once archiving deletes cohorts, this mutation becomes a deletion mechanism we did not design. Its exact blast radius is only clear once the deletion set is settled.
- **The archive browser's read cost** — ADR-0021 is quota-first, and the browser fetches a whole year file. Whether that reads as a small indexed query or a large blob fetch depends on the file shape.
- **Whether archived years are ever needed before writing one** — the first real archive cannot happen until a year has ended, so the whole path stays untested against real data until roughly June. What stands in for that is a build-time question.

## Out of scope

- **HWIS CAS year-end archive** — CAS grade-12 graduation, CAS evaluations, house events. ADR-0006 deletes them and nothing here changes that. ESL has no evaluations table, so the three archived items are genuinely complete for ESL; the CAS counterpart is a different destination.
- **Adding `esl_*` tables to the daily HWIS backup snapshot** — the user asked for this once the archive works. It is a real gap (`buildSnapshot` omits them) but it is the _daily backup's_ completeness, not the _year archive_'s existence. Different destination, different failure mode (it fails continuously and silently, not once a year). Wants its own map.
- **Restoring an archived year over live data** — ruled out in grilling. The archive is read-only history. Nothing in this map makes a year live again.
