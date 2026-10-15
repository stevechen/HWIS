# ESL holiday fixtures (dataset 14718 samples)

`114.csv` is Big5 with no BOM (ROC-114 style); `115.csv` and `116.csv`
are UTF-8 with BOM. Test and local-dev seed use only — production code
must never import or fetch these files; the runtime source is the
`esl_holiday_cache` Convex table, written via `esl/holidays.upload`.
