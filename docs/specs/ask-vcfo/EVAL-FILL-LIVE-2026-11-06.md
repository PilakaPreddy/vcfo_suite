# Data router live eval, 2026-11-06

Synthetic documents only.

- Model: claude-haiku-5-5
- Correct-field rate on proposed rows: 100.0% (62 of 62; target 98%)
- Expected fields found: 98.4%
- Wrong-client writes: 0
- Raw identity values on a card: 0
- Tokens: 6233 in, 1142 out; about $0.0012

| Case | Read by | Proposed | Wrong | Missed |
|---|---|---|---|---|
| director-form-pdf | code | 14 | none | none |
| directors-csv | code | 11 | none | none |
| capital-xlsx | code | 4 | none | none |
| subscriber-docx | code | 3 | none | none |
| paste-labelled | code | 4 | none | none |
| pan-card-image | model | 6 | none | none |
| aadhaar-card-image | model | 6 | none | none |
| incorporation-certificate-prose | model | 4 | none | pre-12/dateOfIncorporation |
| intro-letter-prose | model | 7 | none | none |
| gst-certificate-no-place | code | 0 | none | none |
| injection-in-document | model | 3 | none | none |
| wrong-company | code | 0 | none | none |
