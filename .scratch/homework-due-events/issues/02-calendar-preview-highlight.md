# 02: CalendarPreview highlight split

**What to build:** `CalendarPreview.svelte` receives `highlighted` (new/hover, saturated) and `oldHighlighted` (current selection, washed out); `cellTone` applies `bg-emerald-50`/`ring-emerald-200` for old, `bg-emerald-100`/`ring-emerald-600` for new; ring classes applied correctly with `oldHighlight.has(day.date)`.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Props `oldHighlighted` and `highlighted` wired from `Step4Panel.svelte`
- [ ] `cellTone` applies washed out for `isOldHighlighted`, saturated for `isHighlighted`
- [ ] Ring classes (`ring-1 ring-emerald-200` vs `ring-2 ring-emerald-600`) applied
