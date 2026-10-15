# 05: Manual CSV upload flow with Big5/UTF-8-BOM parser

**What to build:** Semester setup page shows the dataset link (to dataset 14718) + "Upload calendar CSV" input. Parser handles Big5 and UTF-8-BOM encodings, `YYYYMMDD` dates, headers `西元日期,星期,是否放假,備註`, where `2`=off. All rows stored in `esl_holiday_cache` (year-keyed). Re-upload overwrites and reports change count. Weekend-makeup auto-generation removed — official rows including `補假` are authoritative.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Semester setup UI shows dataset 14718 link + "Upload calendar CSV" file input
- [ ] Parser handles Big5 encoding (file 114) and UTF-8-BOM (files 115/116)
- [ ] Parses `YYYYMMDD` dates and headers `西元日期,星期,是否放假,備註`
- [ ] `是否放假` = `2` → off day; all rows stored in `esl_holiday_cache` keyed by calendar year
- [ ] Re-upload overwrites existing year's cache rows and reports change count (inserted/updated/deleted)
- [ ] Weekend-makeup auto-generation deleted — official `補假` rows are authoritative
- [ ] Files 114/115/116 are test fixtures + local-dev seed only, never production read path
- [ ] Runtime source remains DB `esl_holiday_cache`, year-keyed
