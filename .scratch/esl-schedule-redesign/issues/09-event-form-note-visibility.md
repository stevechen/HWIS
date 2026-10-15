# 09: Per-type note field visibility in EventForm

**What to build:** Banner-only types hide note field entirely in `EventForm` (ignored backend-side): Start of School, Quiz, Exam, Passport/Recording due, G9 Mock. Required+shown: No School (`Off`), No class, Partial. Optional+shown: Task. Backend ignores note for hidden types.

**Blocked by:** 08-event-types-schema

**Status:** ready-for-agent

- [ ] EventForm hides note field for: `start_school`, `quiz`, `exam`, `passport_due`, `recording_due`, `g9_mock`
- [ ] EventForm shows note field as required for: `no_school`, `no_class`, `partial`
- [ ] EventForm shows note field as optional for: `task`
- [ ] Backend (events.create/update) ignores `note` for hidden types
- [ ] Users never see a confusing dead note input for banner-only types
