# 07: S1 end-date default from CNY − 14 days; S2 end-date default July 1

**What to build:** Semester creation for S1 resolves the `春節` isHoliday-run start in the second calendar year from cache (uploads if missing), proposes `start−14d` as editable end-date default. Admin can override freely. S2 creation proposes `YYYY-07-01` (July 1st of the second calendar year) as editable end-date default.

**Blocked by:** 06-translation-map

**Status:** ready-for-agent

- [ ] S1: resolve `春節` isHoliday-run start in second calendar year from `esl_holiday_cache`
- [ ] S1: if cache missing, trigger upload for that year, then compute
- [ ] S1: propose `cnyStart − 14 days` as editable `startDate` default for S1 end
- [ ] S2: propose `July 1` of the second calendar year as editable end-date default
- [ ] Both defaults are editable — admin overrides freely
- [ ] S1 end-date default revised from 3 days → 2 weeks (14 days) before CNY run start
