# 06: Translation map + verbatim fallback for unknown captions

**What to build:** Cleaned translation map (duplicate `端午節` merged) + `春節→Chinese New Year` kept as fallback. Unknown captions stored verbatim in `caption` field, flagged for manual translation. S1 setup uploads both Gregorian years the window spans (e.g., fall 2026 → years 115+116); missing year → admin-typed fallback flagged unverified.

**Blocked by:** 05-official-calendar-csv-upload

**Status:** ready-for-agent

- [ ] Translation map cleaned (dup `端午節` merged):
  - `開國紀念日→New Year's Day`
  - `補假→Compensatory day off`
  - `和平紀念日→Peace Memorial Day`
  - `兒童節及民族掃墓節→Children's Day and Tomb-Sweeping Day`
  - `兒童節→Children's Day`
  - `民族掃墓節→Tomb-Sweeping Day`
  - `清明節→Tomb-Sweeping Day`
  - `端午節→Dragon Boat Festival`
  - `中秋節→Moon Festival`
  - `國慶日→Double Tenth Day`
  - `勞動節→Labor Day`
  - `孔子誕辰紀念日/教師節→Teacher's Day`
  - `教師節→Teacher's Day`
  - `臺灣光復暨金門古寧頭大捷紀念日→Retrocession Day`
  - `行憲紀念日→Xmas`
  - `小年夜→Lunar New Year's Eve`
  - `農曆除夕→Lunar New Year's Eve`
  - `春節→Chinese New Year`
- [ ] Unknown caption → stored verbatim in `caption` field, flagged for manual translation
- [ ] S1 setup uploads both Gregorian years the window spans (e.g., fall 2026 → 115+116)
- [ ] Missing calendar year → admin-typed fallback date, flagged `unverified: true`
