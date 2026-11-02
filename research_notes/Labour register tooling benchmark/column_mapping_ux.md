# Spreadsheet/CSV import and column-mapping user interfaces (best practice, Nov 2026)

**Research constraint to note up front:** in this session every `WebFetch` call failed DNS
resolution (`support.flatfile.com`, `flatfile.com`, `developer.dromo.io`, `docs.oneschema.co`,
`www.saasui.design` were all outside the session's allowed network domains). All findings below
therefore come from the search tool's retrieval of those same pages, including quoted passages,
rather than from a full page read. Where a page could only be seen in snippet/synthesis form I say
so. Those hosts would need to be allowed in the session's network settings to verify primary pages
line by line.

## Auto-matching algorithms, thresholds and claimed accuracy

### Takeaway
Every commercial importer uses the same three-tier cascade — **exact (case-insensitive) → historical
(remembered past mappings) → fuzzy string similarity**, now with an optional fourth LLM/semantic tier
bolted on top. The specific distance function is almost never published; what *is* published, and
directly copyable, is Flatfile's confidence vocabulary (`absolute` = 100%, `strong` = >90%) and the
all-or-nothing auto-apply gate built on it. The widely repeated "95% of columns matched
automatically" figure is vendor marketing with no published methodology.

### Cited Findings
- Flatfile's support docs state auto-matching runs three levels **in order: exact matching, historical
  matching, then fuzzy matching**; the exact step is **case-insensitive** and compares the source
  header against both the template field's **label and key** (a 100% match) — [Flatfile: Matching](https://support.flatfile.com/en/articles/7873666-matching)
- Flatfile's fuzzy step "compares the column header to the list of field labels and keys to find
  approximate matches" and **scores each candidate by text similarity** ("each match is given a score
  based on the similarity of the text and matched value"). **Portal 2.0 surfaced only the top
  suggestion; Portal 3.0 shows the top three.** — [Flatfile: Matching](https://support.flatfile.com/en/articles/7873666-matching)
- Flatfile's historical layer in Portal 2.0 stored prior mapping decisions in the **browser's
  localStorage** — i.e. per-device, not per-customer, memory — [Flatfile: Matching](https://support.flatfile.com/en/articles/7873666-matching)
- Flatfile's **Automap plugin exposes the confidence threshold as a first-class required parameter**:
  `accuracy` takes `'confident'` or `'exact'`. `'confident'` requires a **"strong" (over 90%) or
  "absolute" (100%)** match on **every** mapped field; `'exact'` requires absolute matches only. **If
  even one column fails the threshold the entire automatic mapping job is aborted** and an `onFailure`
  callback fires — [Flatfile Automap plugin docs](https://flatfile.com/docs/plugins/automap.md)
- Flatfile's mapping concept docs claim **"machine-learning models trained on millions of historical
  mappings"** that suggest **both field mappings and enum-value mappings** from "the column names and
  values in the source data", with user override — [Flatfile mapping concepts](https://flatfile.com/docs/legacy-docs/concepts/mapping.md)
- Flatfile explicitly **does not record** whether a given column was matched exactly or fuzzily ("we do
  not store information on which columns were linked to the headers in your file based on whether it
  was an exact match or a fuzzy match") — [Flatfile support](https://support.flatfile.com/en/articles/7873826-can-i-track-which-columns-were-exact-matches-and-which-were-fuzzy-matched)
- Flatfile applies the **same exact/historical/fuzzy cascade to enum ("category") option values**, and
  setting `matchStrategy: "exact"` on a field **disables the fuzzy and historical levels** for it —
  [Flatfile support](https://support.flatfile.com/en/articles/7873719-disable-fuzzy-and-historical-matching-for-category-fields-options)
- **Marketing, flagged as such:** third-party/press pages state Flatfile "automatically matches 95% of
  columns using machine-learning and fuzzy matching"; VentureBeat described it as "a combination of
  algorithms plus basic machine learning, plus then reinforcement and scoring". Neither gives a scoring
  method or test set — [VentureBeat](https://venturebeat.com/business/flatfile-pursues-intelligent-data-importing-with-2-million-round)
- **Dromo**: during column matching "Dromo will try to match column headers in the user data to a
  corresponding `label` or `key` within your fields", and matching is **case-sensitive** (a notable
  divergence from Flatfile). Developers add synonyms per field via **`alternateMatches`** —
  [Dromo field reference](https://developer.dromo.io/reference/fields/fields.md)
- **OneSchema**: template column mapping "will occur automatically based on your specified mapping
  strategy", combining **"exact", "fuzzy" and "historical"** strategies; it "will also remember
  historical mappings that your users may have successfully imported in the past" —
  [OneSchema templates](https://docs.oneschema.co/docs/templates); [OneSchema product update](https://oneschema.co/blog/product-update-september-22)
- **OneSchema's AI tier is a separate, opt-out-by-default product**: "OneSchema's AI product suite,
  powered by OpenAI's GPT-4, sends uploaded spreadsheet data to OpenAI in order to suggest mappings and
  transformations", and **it is turned off by default** — [OneSchema AI bundle](https://docs.oneschema.co/docs/ai-bundle)
- **nuvo** claims column matching "automatically maps imported columns to your data schema using an
  intelligent matching algorithm **that improves with every import**", plus "AI-powered column **and
  option** mapping" — [nuvo importer SDK](https://www.getnuvo.com/importer-sdk); [nuvo SDK settings](https://docs.getnuvo.com/sdk/settings)
- **Open source**: `react-spreadsheet-import` (MIT, Chakra UI) gives each field a `key` that "allows for
  better automatic column matching", exposes a `matchColumnsStepHook` that runs once after matching,
  and can be launched directly at the matching step via `initialStepState` —
  [react-spreadsheet-import](https://github.com/hiveteams/react-spreadsheet-import)
- A vendor (CSVbox) description of the current layered state of the art: exact → normalised → fuzzy →
  **semantic matching using embeddings or an LLM to compare meaning**, and argues "confidence scores
  matter more than the match itself — they decide what to auto-apply" —
  [CSVbox: AI column mapping](https://csvbox.io/resources/ai-column-mapping)
- A general explainer of the embedding approach: turn column names **and sample values** into vectors
  and "compare vectors by cosine similarity" — [AI schema matching](https://rss.boorghani.com/?p=421567)
- Prior art confirming the shape of the classical approach: a USPTO patent describes determining a
  mapping between columns of two data sources "by using a fuzzy match", scoring matches, applying a
  **threshold**, and consulting **synonym lists** —
  [US 8,874,613](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/8874613); a second
  patent, "Metadata based mapping assist", claims confidence scores from **cosine similarity between
  schema fields** — [US 12,411,814](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12411814)

### Inferences
- No vendor publishes its string-distance function. The named primitives (Levenshtein, Jaro-Winkler,
  token-set ratio) appear only in third-party/engineering commentary, not vendor docs — so a
  from-scratch implementation should pick on its own merits rather than "matching what Flatfile does".
  A defensible stack for our case: normalise (lowercase, strip punctuation/whitespace, expand common
  abbreviations) → exact on normalised form → per-field synonym/alias list (Dromo's `alternateMatches`
  is the pattern to copy, and is the cheapest high-yield feature) → token-set similarity → character
  similarity as last resort.
- Flatfile's `absolute`/`strong`(>90%) pair is the only published numeric threshold in the space and is
  a reasonable default to adopt: auto-apply silently at ~100%, auto-apply-but-flag above ~90%, suggest
  only below that.
- Flatfile's all-or-nothing abort is deliberately conservative and aimed at *headless* automation. For
  an interactive screen the right adaptation is per-column, not per-file: the file still opens, only
  the low-confidence rows demand attention.
- Because Flatfile does not even store exact-vs-fuzzy provenance, auditability of *how* a mapping was
  chosen is a genuine differentiator available to us — relevant for a statutory register.

### Gaps
- No head-to-head benchmark of mapping accuracy across Flatfile/OneSchema/Dromo exists in public; all
  comparison pages found were authored by one of the vendors (Dromo, OneSchema and CSVbox each publish
  their own). Treat every accuracy number as marketing.
- No vendor publishes its fuzzy threshold *value* other than Flatfile's >90% band, nor the normalisation
  rules applied before comparison.
- No published accuracy figure is tied to a disclosed test set.

## Confidence display: numeric score vs categorical label

### Takeaway
Shipped products overwhelmingly **hide the number** and show a categorical or binary marker instead
(OneSchema puts a **star** on AI-created mappings; Flatfile leaves low-confidence targets simply
**blank**). The practitioner literature is consistent in favouring 3-bucket categorical confidence with
the percentage on hover, but the only controlled study found does not actually test numeric-vs-
categorical, so this is strong design consensus rather than proven fact.

### Cited Findings
- **OneSchema's shipped pattern:** "A star will appear next to mappings created using AI so users can
  easily verify mappings" — a binary provenance marker, not a score — [OneSchema AI bundle](https://docs.oneschema.co/docs/ai-bundle)
- **Flatfile's shipped pattern:** "When we need input, the corresponding field in the destination fields
  will remain blank. Use the dropdown to select the relevant field" — confidence is expressed as
  *absence of a pre-filled value*, not as a score — [Flatfile mapping](https://support.flatfile.com/articles/8569925090-mapping-data)
- Flatfile's confidence vocabulary itself is categorical in the API: **"absolute" (100%) / "strong"
  (over 90%)** — [Flatfile Automap](https://flatfile.com/docs/plugins/automap.md)
- Practitioner guidance for a **3-bucket low/moderate/high scale calibrated against actual reliability**,
  because "the bucket is interpretable while the percentage is precise but uninterpretable", with the
  **bucket as the primary signal and the percentage available on hover** —
  [Uncertainty surfacing](https://tracker-7ex.pages.dev/01_ai_engineering/18_human_ai_product_experience/03-uncertainty-surfacing/)
- Argument for verbal states such as "confident" / "verify this" / "I'm not sure" over a percentage,
  on the grounds that a number invites over-interpretation —
  [Confidence strings, not scores](https://tianpan.co/blog/2026/04/28/confidence-strings-not-scores-uncertainty-narrative)
- Automation-bias concern: users treat a numeric confidence score "as a rubber stamp, accepting or
  rejecting based on what they already wanted to do" —
  [The confidence score your users learned to ignore](https://tianpan.co/blog/2026/05/22/the-confidence-score-your-users-learned-to-ignore)
- "A confidence score needs a business rule, not just a number": a raw `0.87` invites trust "like a test
  result", whereas a plain label such as **"needs review"** is more honest and more actionable —
  [AWS Builder Center](https://builder.aws.com/content/3KIaHtvpLGqg3uZa13hh25ONQKj/a-confidence-score-needs-a-business-rule-not-just-a-number)
- Research-methods guidance treats the format as **an open variable to test** (percentages vs verbal
  labels vs visual indicators), warning that users read "85% confidence" in different ways —
  [Dovetail: trust calibration and AI confidence scores](https://dovetail.com/research/research-trust-calibration-ai-confidence-scores-uncertainty/)
- **The one controlled study found does not settle the question.** An arXiv ablation showed the *same
  numeric score* under different labels (a named quality measure vs a generic "AI confidence");
  labelling made little difference to user accuracy or over-reliance, suggesting behaviour tracks the
  signal's distribution rather than its name. It compares *label wording*, not numeric vs categorical
  format — [arXiv 2509.25844](https://arxiv.org/pdf/2509.25844)
- Developer-tutorial material still mostly recommends percentages with colour or progress-bar cues, and
  offers no evidence for it — [Displaying model confidence in UI](https://rapidevelopers.com/web-to-ai-ml-integrations/display-model-confidence-scores-in-ui)

### Inferences
- The defensible design is three states tied to a *business rule*, not a number: **auto-mapped**
  (exact/remembered; quiet, no decoration), **suggested — confirm** (fuzzy above threshold; visually
  marked, e.g. OneSchema's star, and counted in a "needs attention" tally), **not mapped** (blank, and
  blocking if the target is required). Percentage, if exposed at all, belongs in a tooltip or an admin
  debug view.
- Because our users are project leads producing a statutory register, "needs review" framing beats a
  score: the label should say what to *do*, not how sure the machine is.

### Gaps
- No controlled experiment directly comparing numeric percentage, categorical bin and verbal label on
  the same suggestions, measuring both reliance and accuracy. The pro-categorical position rests on
  blogs and vendor guidance.
- Calibration figures (e.g. expected calibration error values) cited in some blogs are unverified.

## Layout patterns, and what survives a 70+ column file

### Takeaway
The dominant and best-evidenced pattern is **one row per field with a searchable dropdown, plus a
sample value from the file shown on the same row** — in other words a vertical reconciliation list, not
a horizontal grid. Drag-and-drop is the pattern that fails hardest, both on wide files and on
accessibility. For wide files the critical additions are **direction of iteration (iterate over *our*
target fields, not their 70 columns)**, column select/deselect with a header checkbox, grouping, and
showing only what needs mapping.

### Cited Findings
- **Dropdown-per-row plus a sample column is the long-standing concrete pattern.** Atlassian Crowd's CSV
  mapping screen has a **"Sample Row" column showing values from the file's second row**, present
  specifically "to help with the mapping process", and each row's control is "a drop-down list of the
  Crowd field names available for mapping" — [Atlassian Crowd: Mapping CSV fields](https://confluence.atlassian.com/display/CROWD/Mapping+CSV+Fields+to+Crowd+Fields)
- **Dropdown-per-target-field with an expandable preview above:** TIBCO EBX gives each *target* column a
  dropdown to choose its source, and lets the user expand a data-file sample at the top of the screen
  "to see a preview of how the current mapping would import" — [TIBCO EBX import options](https://docs.tibco.com/pub/ebx-addon/5.3.4/doc/html/adix/reference_guide/ref_import_csv.html)
- **Salesforce Data Import Wizard:** the mapping step pairs each file column with a Salesforce field,
  suggests matches automatically, and lets users change any automatic mapping by clicking **Change**
  beside the field; **unmapped fields appear in a separate list** where the user types a field name and
  picks it. Hard limit of 50,000 records, and the wizard is documented as offering "limited formatting
  and mapping flexibility" — [Salesforce Trailhead](https://trailhead.salesforce.com/projects/import-and-export-with-data-management-tools/steps/use-the-data-import-wizard); [Exploring the Data Import Wizard](https://trailblazingtips.substack.com/p/exploring-the-data-import-wizard)
- **Searchable dropdown is the recommended control when the field list is long** — let the user type
  "status" and pick — and transforms (e.g. trim) should sit next to the mapping with their effect shown
  in the preview (`" New York "` → `"New York"`) — [AppMaster: CSV import column mapping UI](https://appmaster.io/blog/csv-import-column-mapping-ui)
- **Explicit wide-file affordance:** GravityImport 2.8.0 added "the ability to select or deselect
  individual columns during mapping, with a header checkbox to select or deselect everything at once",
  stating this is for "large CSVs that have far more columns than needed" —
  [GravityImport 2.8.0](https://www.gravitykit.com/gravityimport-2-8-0-a-smarter-way-to-import-gravity-forms-data/)
- **Show only what matters:** Ingestro's importer setting shows "only the needed target mappings"
  when a file has many columns, "particularly useful when users upload files with many columns but only
  need to map a few target columns, reducing visual clutter and confusion in the mapping step" —
  [Ingestro importer configuration](https://docs.ingestro.com/sdk/settings)
- **Grouping:** EZ Importer groups Shopify fields "under their resource names" to keep the mapping
  section "clean, and easy to navigate especially as we add more resources" —
  [EZ Importer data mapping redesign](https://www.highviewapps.com/blog/ez-importer-data-mapping-tab-redesign/)
- **Drag-and-drop is the hard case:** the React CSV Importer author reports "it took a bit of
  head-scratching to adapt the drag-and-drop column mapping UI to screen-reader/keyboard-only
  interaction" — [React CSV Importer](https://www.indiehackers.com/product/react-csv-importer)
- **Airtable's variant — live sample panel beside the mapping:** "As you alter the field mappings, you
  can look at the right side of the extension, which shows samples of the records that will be created
  according to the specified mappings"; mapping is explicitly not one-to-one ("You don't have to import
  every field, and the order and names of CSV fields don't have to match"). Limits: 25,000 rows, 5MB —
  [Airtable CSV import extension](https://support.airtable.com/hc/en-us/articles/115013249187-CSV-import-extension)
- **Notion's variant — header picker in the preview itself:** the preview shows each column with a
  property-type dropdown next to the column name — [Mapping CSV to Airtable or Notion](https://dev.to/xxbricksquadxx/mapping-csv-airtable-or-notion-without-tears-template-inside-2lnd)
- A SaaS design survey (vendor-neutral-leaning but still a blog) names HubSpot and Stripe among products
  that treat import as a full flow with a mapping step, and recommends: **auto-match aggressively and
  transparently, show each proposed mapping side by side with a sample value, and let users fix wrong
  guesses via a dropdown per column.** Its named anti-patterns: a bare mapping table with no
  auto-matching, and **unmatched columns that disappear silently** —
  [SaaS data import mapping UX patterns](https://www.saasui.design/blog/saas-data-import-mapping-ux-patterns) (page could not be fetched; content via search synthesis)
- One design guideline recommends mapping selectors **above** a sample data table, with the preview
  reflecting the current mapping, and separating preview / field mapping / validation / final import
  into distinct steps — [Data import mapping design prompt](https://open-design.ai/prompts/data-import-mapping/)
- Mapping hygiene rule from a long-lived enterprise importer: **map each source column only once** —
  [iMIS iImport mapping](https://help.imis.com/enterprise/imis_power_suite/idms/mapping.htm)

### Inferences
- For 70+ columns the winning pattern is a **one-row-per-target-field vertical list** ("our columns" on
  the left, a searchable select of *their* columns on the right, their sample values beside it). This
  bounds the screen by *our* schema (fixed, ~20-40 statutory register columns) instead of by their file
  (unbounded). A true side-by-side two-column reconciliation of 70 source columns against 30 targets
  scales badly and has no clear winner for drag connections.
- A horizontal table-with-header-pickers (Notion's pattern) is the wrong choice for a wide file: it
  forces horizontal scrolling at exactly the moment the user needs to compare against a fixed target
  list.
- Drag-and-drop should be rejected outright given the accessibility cost and our selection-only
  constraint; it adds no capability that a searchable select lacks.
- "Each source column mapped at most once" should be enforced in the UI (used options greyed out or
  marked), since a wide payroll sheet invites accidental double-mapping.

### Gaps
- No usability study quantifying error rate or time-on-task across the four layout patterns. All
  layout guidance found is product documentation or design opinion.
- Stripe's actual import mapping screen is not documented in any source retrieved; the only reference to
  it is second-hand in a design blog. Any claim about Stripe's layout would need a direct look at the
  dashboard.
- HubSpot's mapping *UI* is undocumented in what was retrieved; only its API `columnMappings` array
  (one entry per file column, in spreadsheet header order) is public —
  [HubSpot CRM imports API](https://developers.hubspot.com/docs/api/crm/imports?lang=en-US)

## Data preview: sample values and how many rows

### Takeaway
Showing sample values from the file next to each mapping is near-universal across importers, and
multiple products state outright that it exists *to help the user map correctly*. Sample sizes cited
are small: the file's second row (Crowd), a few records (Airtable), or the first 20-50 rows for a fast
preview. **No study quantifying the error reduction was found** — the "it reduces mapping errors" claim
is consensus design practice, not a measured effect.

### Cited Findings
- Crowd's Sample Row column "shows text from the second row of the CSV file, which is done **to help
  with the mapping process**" — a single row, deliberately the second (i.e. not the header) —
  [Atlassian Crowd](https://confluence.atlassian.com/display/CROWD/Mapping+CSV+Fields+to+Crowd+Fields)
- Airtable's mapping panel shows **samples of the records that will be created** and updates live as
  mappings change — i.e. preview of the *output*, not just the input — [Airtable](https://support.airtable.com/hc/en-us/articles/115013249187-CSV-import-extension)
- Recommended sample size: "start with a small, fast sample preview (for example, the **first 20-50
  rows**) plus a simple count summary for the full file"; the preview should also show the **effect of
  transforms** — [AppMaster](https://appmaster.io/blog/csv-import-column-mapping-ui)
- Practical advice to run a **test import of 50-100 rows** before the full import —
  [Mapping CSV to Airtable or Notion](https://dev.to/xxbricksquadxx/mapping-csv-airtable-or-notion-without-tears-template-inside-2lnd)
- Blackbaud's Import Mapping Assistant likewise "recommends a small test import first" —
  [Blackbaud Import Mapping Assistant](https://webfiles-sc1.blackbaud.com/files/support/helpfiles/fe/testhelp/content/fe-smart-import-mapping.html)
- TIBCO EBX's preview is **expandable/collapsed by default**, i.e. preview as progressive disclosure
  rather than always-on — [TIBCO EBX](https://docs.tibco.com/pub/ebx-addon/5.3.4/doc/html/adix/reference_guide/ref_import_csv.html)
- Embedding-based matchers use **sample values as matching input**, not only headers ("turn column names
  and sample values into vectors") — [AI schema matching](https://rss.boorghani.com/?p=421567); Flatfile
  likewise suggests mappings "based on the column names **and values** in the source data" —
  [Flatfile mapping concepts](https://flatfile.com/docs/legacy-docs/concepts/mapping.md)

### Inferences
- Show **2-3 distinct non-empty sample values per source column**, inline on the mapping row, rather than
  a single fixed row — a single row from a payroll sheet is often blank or an outlier. Distinctness
  matters more than count.
- Sample values are also *matching signal*, not just display: a column of `M`/`F` or of `DD/MM/YYYY`
  strings should raise the confidence of the gender/date target even when the header is unhelpful (e.g.
  `Col12`). This is cheap to implement with type/pattern detectors and does not require embeddings.
- A live "this is what the register row will look like" preview (Airtable's approach) is the strongest
  error-catching device found and fits a statutory output well, since the user recognises the register
  format.

### Gaps
- **No measured evidence** that sample-value display reduces mapping errors. I found no A/B test, no
  NN/g study, no vendor-published error-rate comparison. This should be reported as an untested
  assumption rather than a finding.

## Remembered mappings and templates

### Takeaway
All four named vendors have a remembered-mapping feature, but they differ sharply on **scope**: Flatfile
Portal 2.0 kept it in browser localStorage (per device), CSVbox keys it to a **customer/user
identifier**, OneSchema has both developer-declared **"alternative mappings"** and user-level historical
mappings, and Dromo/OneSchema will **skip the mapping step entirely** when everything matches. The
documented behaviour when the file changes shape is: the step reappears, pre-filled where it can be, and
new columns land unmapped.

### Cited Findings
- **CSVbox — per-customer identifier scope:** "CSVbox will store the column-to-field mapping for that
  identifier and attempt to reapply it on future uploads from the same identifier" —
  [CSVbox: save CSV mappings](https://blog.csvbox.io/save-csv-mappings/) (marketing-style post; it does
  not say whether the mapping screen is hidden when a saved mapping applies)
- **Dromo — skip the step on a repeat shape:** "the same column mapping will be used, bypassing the
  column matching step" when headers match a previous upload; Dromo also ships explicit
  **step-skipping options in its Schema Builder** — [Dromo changelog: step skipping](https://changelog.dromo.io/new-step-skipping-options-in-schema-builder)
- **OneSchema — skip when fully matched:** mapping is skipped "if all template columns are matched
  (exact match)"; there is a dedicated **"skip mapping pane"** changelog entry —
  [OneSchema: skip mapping pane](https://docs.oneschema.co/changelog/skip-mapping-pane)
- **OneSchema — developer-declared aliases ("alternative mappings"):** "you can tell OneSchema which
  mappings you're expecting to see so that your user won't have to map them manually" —
  [OneSchema product update, Nov 22](https://www.oneschema.co/blog/product-update-november-22)
- **OneSchema — user-level history:** "OneSchema will also remember historical mappings that your users
  may have successfully imported in the past" — [OneSchema product update, Sept 22](https://oneschema.co/blog/product-update-september-22)
- **Flatfile — device-scoped history:** historical matching reuses previous decisions, stored in the
  **browser's localStorage** in Portal 2.0 — [Flatfile: Matching](https://support.flatfile.com/en/articles/7873666-matching)
- **Dromo — per-field aliases:** `alternateMatches` supplies extra accepted names per field —
  [Dromo field reference](https://developer.dromo.io/reference/fields/fields.md)
- **nuvo — matching that learns:** "an intelligent matching algorithm that improves with every import" —
  [nuvo importer SDK](https://www.getnuvo.com/importer-sdk)
- **Enterprise precedent for learning + test import:** Blackbaud's Import Mapping Assistant "suggests
  field matches automatically and learns from prior imports" —
  [Blackbaud](https://webfiles-sc1.blackbaud.com/files/support/helpfiles/fe/testhelp/content/fe-smart-import-mapping.html)
- **Portable mapping definitions as files** are a long-standing enterprise pattern: column mappings can
  be exported and imported between environments — [Software AG: importing and exporting column mappings](https://documentation.softwareag.com/adabas/cxx146/replicator/Importing_and_Exporting_Column_Mappings.htm)
- **Saved mappings named as a top design recommendation** in the SaaS design survey, alongside flagging
  bad rows without failing the whole import —
  [SaaS data import mapping UX patterns](https://www.saasui.design/blog/saas-data-import-mapping-ux-patterns) (via search synthesis)
- **Counter-evidence that remembering is fragile in practice:** multiple Airtable community threads
  report the CSV import app stopping remembering mappings, including for positionally named columns —
  [Airtable community](https://community.airtable.com/other-questions-13/csv-import-app-not-remembering-mapping-anymore-21836); [Airtable community](https://community.airtable.com/other-questions-13/csv-import-not-remembering-column-1-2-etc-mapping-18899)
- **Auditable record of the applied mapping:** OneSchema's importer webhook payload includes a
  `columns` array mapping each sheet column to a template column key — i.e. the resolved mapping is
  returned to the host app and can be stored — [OneSchema importer webhook](https://docs.oneschema.co/docs/importer-webhook)

### Inferences
- Scope the remembered mapping to **(client × register type)** — the analogue of CSVbox's identifier —
  not to the browser. Flatfile's localStorage approach is the wrong model for a multi-user firm where a
  different project lead may handle next month's upload.
- Keep both layers that OneSchema keeps: **firm-level aliases** curated by admins (a true synonym
  dictionary for Indian payroll headers: "Emp Code"/"EMP ID"/"Token No", "Basic"/"Basic Pay",
  "Gross Wages"/"Gross Earnings") *and* **per-client remembered mappings** learned from accepted
  imports. The alias layer is the one that generalises to a brand-new client.
- Do **not** silently skip the mapping screen even on a perfect remembered match, given this is statutory
  output: show it in a collapsed "all 31 columns mapped from last month's sheet — review" state with a
  single confirm, which is the auditable version of Dromo/OneSchema's skip.
- When the file changes shape, the honest presentation is a **diff**: "3 columns new since last month,
  2 columns from last month's mapping are missing". None of the vendors documents a diff view; this
  appears to be an open gap in the market and a plausible differentiator.
- Persist the resolved mapping with the import record (OneSchema's webhook `columns` array is the shape
  to copy) so a register can later be explained.

### Gaps
- Whether CSVbox hides the mapping screen when a saved mapping applies is not documented in any page
  retrieved.
- Nothing in any vendor's docs describes the UX for **overriding** a remembered mapping specifically
  (e.g. a "this is not last month's sheet / clear remembered mapping" affordance), nor for invalidating
  a stale saved mapping.
- No vendor documents a changed-shape diff view.

## Unmapped, missing and extra columns

### Takeaway
The settled vocabulary is three outcomes: **mapped**, **explicitly ignored** (user-chosen, deletes the
column from downstream), and **passed through unmapped** (carried along but **not validated**). The
strongest consensus rule is the negative one: columns must never disappear silently. Required-but-
missing target columns are where documentation is thinnest across every vendor.

### Cited Findings
- **OneSchema:** exact text matches are mapped automatically, and **columns with no data are detected
  automatically and skipped by default** — [OneSchema: map template columns](https://docs.oneschema.co/docs/3-map-template-columns)
- **OneSchema — pass-through, unvalidated:** with the "include unmapped columns" setting active,
  unmapped columns "are shown in the cleaning step and included in imports. **They aren't validated.**"
  Columns a user **deletes** in the mapping step "are dropped entirely. They don't show up in the
  cleaning step or in the imports." Webhook payloads flag them with `"is_unmapped": true` —
  [OneSchema: importing unmapped columns](https://docs.oneschema.co/docs/unmapped-columns)
- **Dromo:** `passThroughUnmappedColumns` "exposes unmapped source columns in the result data under a
  special key" — [Dromo field reference](https://developer.dromo.io/reference/fields/fields.md)
- **Flatfile:** "unmapped source fields are excluded from the import", and unmapped destination fields
  "remain blank" for the user to fill from a dropdown —
  [Flatfile mapping](https://support.flatfile.com/articles/8569925090-mapping-data)
- **CSVbox — an explicit "ignore" affordance:** users can mark columns as **Ignored**, via "the option to
  mark the columns as Ignored on the Column Mapping screen" — [CSVbox: ignored columns](https://help.csvbox.io/advanced-installation/ignored-columns)
- **GravityImport — bulk ignore:** per-column select/deselect with a header checkbox to
  select/deselect everything, specifically to exclude columns from a wide import —
  [GravityImport 2.8.0](https://www.gravitykit.com/gravityimport-2-8-0-a-smarter-way-to-import-gravity-forms-data/)
- **OneSchema — "expected but absent" has a name:** a column not in the template but needing a specific
  type is added as a **custom column**, and "these columns will show up as **Unmapped** during the
  mapping step of the import until you add one" — [OneSchema custom columns](https://docs.oneschema.co/docs/custom-columns)
- **Required-column declaration** exists in every schema language: OneSchema templates let you "specify
  which columns of data are required, whether all cells in a column must be filled in, and whether each
  value must be unique" — [OneSchema templates](https://docs.oneschema.co/docs/templates); Flatfile
  blueprints support `required`, `unique` and `computed` constraints —
  [Flatfile fields](https://flatfile.com/docs/core-concepts/fields.md)
- **Salesforce** keeps **unmapped fields in a separate list** below the mapped ones —
  [Salesforce Trailhead](https://trailhead.salesforce.com/projects/import-and-export-with-data-management-tools/steps/use-the-data-import-wizard)
- **Named anti-pattern:** "unmatched columns that disappear silently" —
  [SaaS data import mapping UX patterns](https://www.saasui.design/blog/saas-data-import-mapping-ux-patterns) (via search synthesis)

### Inferences
- Four buckets, each with its own section and count, is the implementable version of the above:
  **(1) required & mapped, (2) required & missing — blocks import, (3) optional & missing — informational,
  (4) their extra columns — one "ignore all remaining (N)" control.** Bucket 4 is where the wide payroll
  sheet's long tail goes, and a single bulk control there is what makes a 70-column file tractable.
- Because a statutory register has a fixed legal schema, pass-through of unmapped columns is probably
  *not* wanted in the register itself — but keeping them in an attached raw copy is the auditable
  equivalent of Dromo's `passThroughUnmappedColumns`, and worth doing.
- OneSchema's "skip empty columns automatically" is a free win: payroll exports are full of blank
  spacer columns, and auto-ignoring them with a visible count removes noise before the user looks.
- The required-but-missing case should make the *reason* visible (which statutory register column, under
  which rule) since the user may need to go back to the client for data rather than remap.

### Gaps
- No vendor documents precisely what happens when a **required** template column is left unmapped —
  whether import is blocked, warned, or silently permitted. OneSchema's docs were explicitly silent on
  this point in the pages retrieved.
- No vendor documents an "ignore the rest" single control by that name; GravityImport's header checkbox
  is the closest shipped equivalent found.

## Validation, repair, transformations and value-level (enum) mapping

### Takeaway
**Inline fix-in-grid is the modern default** — a spreadsheet-style review step with sort/filter/find-and-
replace (nuvo, OneSchema) — while download-fix-reupload survives only as a fallback for offline work.
**Value-level mapping (their "M/F" → our "Male/Female") is a distinct, first-class step** in the mature
products: Flatfile calls it **enum mapping** and runs the same exact/historical/fuzzy cascade over option
values, and nuvo calls it **option mapping**.

### Cited Findings
- **Enum/value mapping as a named feature:** Flatfile's ML models "suggest both field **and enum**
  mappings"; for an enum destination field "you could have an enum column of country codes, and you
  might need the source value 'United States' to map to the enum value 'US'" —
  [Flatfile mapping concepts](https://flatfile.com/docs/legacy-docs/concepts/mapping.md)
- Flatfile applies **exact → historical → fuzzy to category options** too, comparing "the record to the
  list of category options and labels to find and recommend approximate matches"; `matchStrategy:
  "exact"` turns the fuzzy/historical layers off per field —
  [Flatfile support](https://support.flatfile.com/en/articles/7873719-disable-fuzzy-and-historical-matching-for-category-fields-options)
- **nuvo** advertises "AI-powered column **and option** mapping" — [nuvo SDK settings](https://docs.getnuvo.com/sdk/settings)
- **Inline repair grid:** nuvo's review step is "a spreadsheet-style table where users can sort, filter,
  freeze, and hide columns, as well as **find and replace values**" —
  [nuvo importer SDK](https://www.getnuvo.com/importer-sdk)
- **Map once, apply to all rows** is the recommended value-mapping interaction: when the file has "NY"
  but the app stores "New York", "the user should be able to map once and apply it to all rows" —
  [AppMaster](https://appmaster.io/blog/csv-import-column-mapping-ui)
- **Mapping-set structure for enums** (the data model to copy): PrognoCIS keeps a **mapping set per
  field**, where users "enter the set of values in the external application, each mapped to the
  equivalent values in PrognoCIS"; its worked example is exactly a sex/gender mismatch — one system
  defaults to `M`, the other offers Unknown/Male/Female —
  [PrognoCIS data mapping](https://prognocishelp.prognocis.com/prognocis/V3B2/ENG/hlpDataMapping.html)
- **Normalise case before enum matching** — CiviCRM logged this as a bug: matches to gender values
  "should be case-insensitive", so "male" matches "Male" —
  [CiviCRM CRM-775](https://issues.civicrm.org/jira/browse/CRM-775)
- **Code-level fallback when there is no value-mapping UI:** a Mendix user whose data had "m" where the
  enum expected "Male" was told to "create a parse microflow to transform the string text to the enum" —
  evidence of what the absence of this feature costs — [Mendix community](https://community.mendix.com/link/space/connectors/questions/125993)
- **Transforms shown in the preview:** trim and similar transforms should sit next to the mapping with
  their effect visible in the preview — [AppMaster](https://appmaster.io/blog/csv-import-column-mapping-ui)
- **Derived/hardcoded values:** iMIS iImport offers "an option to hardcode values and a checkbox to mark
  match-on criteria" per mapping row — i.e. a mapping row can be a constant, not a source column —
  [iMIS iImport](https://help.imis.com/enterprise/imis_power_suite/idms/mapping.htm)
- **Transformations as code hooks** are the general escape hatch in these platforms —
  [OneSchema code hooks](https://www.oneschema.co/blog/code-hooks); OneSchema's no-code validation and
  transformation library is cited as a strength, with claimed handling of files up to 10M rows —
  [OneSchema](https://oneschema.co/blog/flatfile-competitors-alternatives) (vendor-authored)
- **Download-fix-reupload as fallback:** a tutorial flow of upload → parse → auto-map → preview →
  validate → import summary, with the suggestion to let users "download failed rows as CSV" for offline
  fixes — [C# Corner: universal data import wizard](https://www.c-sharpcorner.com/article/building-a-universal-data-import-wizard-mapping-columns-preview-validation)
- **Partial success over total failure:** flag bad rows without failing the whole import; run large
  imports in the background — [SaaS data import mapping UX patterns](https://www.saasui.design/blog/saas-data-import-mapping-ux-patterns) (via search synthesis)
- **Error-message specificity** matters more than error *presence*; vague upload errors are the common
  failure — [Designing an attractive, usable data importer](https://www.digitalthriveai.com/en-us/resources/web-design/designing-attractive-usable-data-importer-app/)

### Inferences
- Treat value mapping as a **second mapping pass on the same screen pattern**: for each mapped
  enum-typed target column, list the *distinct* source values found (which a wide payroll sheet makes
  cheap to compute) and give each a select of our allowed options. This satisfies the selection-only
  constraint perfectly — the user never types "Male", they pick it.
- Distinct-value enumeration also gives a free data-quality readout: "this column has 7 distinct values,
  2 unmapped" is more useful than row-level errors for a register.
- Normalise case and whitespace before enum matching (CiviCRM's bug is the warning), and remember
  accepted value mappings at the same (client × register) scope as column mappings.
- A "constant value for this column" option (iMIS's hardcode) is worth having: statutory registers often
  need a column the client's sheet simply does not carry (e.g. a fixed establishment code).

### Gaps
- No standard UI spec or published study for the enum value-mapping screen was found; the PrognoCIS
  mapping-set model is the clearest shipped example but is enterprise back-office, not modern SaaS.
- No measured comparison of inline fix-in-grid vs download-fix-reupload on completion rate or error
  rate.

## Progressive disclosure for long mapping lists

### Takeaway
The shipped techniques are: **auto-skip empty columns**, **show only the target fields that need
mapping**, **group fields by resource/section**, **bulk select/deselect with a header checkbox**, and
**skip the whole step when everything matched**. There is no published research on which of these works
best; all evidence is product documentation.

### Cited Findings
- Auto-detect and skip **columns with no data**, by default — [OneSchema](https://docs.oneschema.co/docs/3-map-template-columns)
- Show "only the needed target mappings" for files with many columns, to reduce "visual clutter and
  confusion in the mapping step" — [Ingestro](https://docs.ingestro.com/sdk/settings)
- **Group fields by resource** to keep the mapping section navigable as the field list grows —
  [EZ Importer](https://www.highviewapps.com/blog/ez-importer-data-mapping-tab-redesign/)
- **Bulk select/deselect with a header checkbox** for wide files —
  [GravityImport 2.8.0](https://www.gravitykit.com/gravityimport-2-8-0-a-smarter-way-to-import-gravity-forms-data/)
- **Skip the pane entirely** when all template columns match exactly —
  [OneSchema: skip mapping pane](https://docs.oneschema.co/changelog/skip-mapping-pane); Dromo bypasses
  the matching step on a repeat header set — [Dromo changelog](https://changelog.dromo.io/new-step-skipping-options-in-schema-builder)
- **Show the top three fuzzy candidates, not one** — Portal 3.0's change over 2.0 — so the common
  correction is a one-click pick rather than a dropdown hunt — [Flatfile: Matching](https://support.flatfile.com/en/articles/7873666-matching)
- **Separate the phases**: preview, field mapping, validation and final import as distinct steps —
  [Data import mapping design prompt](https://open-design.ai/prompts/data-import-mapping/)
- **Collapsed-by-default preview** as the disclosure mechanism for sample data —
  [TIBCO EBX](https://docs.tibco.com/pub/ebx-addon/5.3.4/doc/html/adix/reference_guide/ref_import_csv.html)

### Inferences
- The copyable composite: open the screen **collapsed to "N need your attention"**, with
  auto-mapped/remembered rows folded into a one-line summary that can be expanded; blank and ignored
  columns summarised with counts; one bulk "ignore remaining N columns" action; the three best
  candidates offered inline on each unresolved row. For a 70-column payroll sheet against ~30 register
  columns this typically reduces the interactive surface to single digits.
- Flatfile's "top three candidates" is the single highest-leverage detail here: it converts a dropdown
  search into a radio-style pick, which also helps keyboard-only and selection-only flows.

### Gaps
- No usability research quantifying any of these techniques; everything found is vendor documentation
  or changelog.

## Accessibility and keyboard flow

### Takeaway
This is the least-documented area of the whole topic. The only concrete shipped commitment found is
GravityImport's "full keyboard navigation using Tab, Enter and Escape, plus better screen reader
support". The clearest signal is negative: drag-and-drop mapping is reported as hard to make
keyboard/screen-reader usable, and tree-based mapping UIs have shipped with broken selection
announcements.

### Cited Findings
- **Shipped commitment:** "Improvements include: Full keyboard navigation using Tab, Enter, and Escape",
  plus improved screen reader support, in a mapping screen —
  [GravityImport 2.8.0](https://www.gravitykit.com/gravityimport-2-8-0-a-smarter-way-to-import-gravity-forms-data/)
- **Drag-and-drop is the problem pattern:** "It took a bit of head-scratching to adapt the drag-and-drop
  column mapping UI to screen-reader/keyboard-only interaction" —
  [React CSV Importer](https://www.indiehackers.com/product/react-csv-importer)
- **Real shipped defect in a tree-based mapping screen:** "If you use the Tab key to traverse through
  dimensions in the tree, the screen reader reads the selected tree elements as 'Not selected.'" —
  [Oracle EPMA: Map Dimensions screen](https://docs.oracle.com/cd/E36352_01/epm.1112/epma_admin/apes01s02s12.html)
- **Design-guideline level only:** "Use semantic structure, descriptive controls, visible keyboard focus
  and appropriate empty/error states" — [Data import mapping design prompt](https://open-design.ai/prompts/data-import-mapping/)

### Inferences
- A vertical list of rows, each containing a native-semantics searchable combobox, is both the best
  wide-file layout *and* the most accessible: it is a sequence of labelled form controls, and Tab order
  follows the visible order of our target fields. This is a case where the accessible choice and the
  scalable choice coincide.
- Each row needs a programmatic label naming the target field plus its state ("Gross wages — suggested
  from 'Gross Earnings', confirm"), because the visual grouping into attention buckets is otherwise lost
  to a screen reader. A live region announcing "4 of 31 still need attention" after each change replicates
  the visual counter.
- Avoid tree-structured target pickers given the Oracle defect pattern; flat grouped option lists are safer.

### Gaps
- **No WAI-ARIA, WCAG or design-system guidance specific to column-mapping screens was found.** The
  general ARIA grid/listbox/combobox patterns would have to be applied by analogy; the authoring
  practices themselves were not retrieved in this session.
- No accessibility audit or conformance statement from Flatfile, OneSchema, Dromo, CSVbox or nuvo was
  found in any search result.

## Wide sheets with repeating per-day / per-date column groups (attendance grids)

### Takeaway
**No embedded CSV-importer product documents a UI for detecting or mapping a repeating positional column
group.** The pattern is instead solved one layer earlier, in data-prep tools, by an explicit **unpivot /
melt step performed on the preview before field mapping** — multi-select the repeating columns, name the
resulting attribute and value columns, then convert the former headers to real dates. This is the single
biggest gap between our requirement and the off-the-shelf market.

### Cited Findings
- **TIBCO WebFOCUS** lets you preview a spreadsheet with repeating value columns and **pivot them into
  rows from the preview page**; date-style headers "are recognized as dates after pivoting", and the
  pivot **can be reverted** — [TIBCO WebFOCUS: Get Data Pivot](https://docs.tibco.com/webfocus/921/doc/html/topic/com.ibi.help.intro/source/Get_Data_Pivot_902.htm)
- **Excel Power Query** unpivots a selected range of date columns, then lets the user rename the generated
  attribute and value columns and convert text month headers into real dates in a follow-up step —
  [Excel University: Unpivot with Power Query](https://www.excel-university.com/unpivot-with-power-query/)
- **Altair Monarch** has an unpivot dialog where you pick the columns to unpivot, **designate the
  attribute columns**, and name the result — [Altair Monarch: Unpivoting columns](https://help.altair.com/monarch/help/Unpivoting_Columns.htm)
- **Savant** has an Unpivot Tool with separate settings for the **name field**, the **value field**, and
  which fields to keep versus unpivot — [Savant: Unpivot tool](https://help.savantlabs.io/en/articles/8173466-unpivot-tool)
- Concept reference for the operation and its vocabulary — [Tabula: what is unpivot](https://docs.tabula.io/tutorials/what-is-unpivot)

### Inferences
- The implementable design for an attendance grid, assembled from the above: on the preview step, detect
  a **run of adjacent columns whose headers parse as dates** (or as 1..31) and offer a single control —
  "columns 8-38 look like daily dates for Nov 2026; treat them as one group" — with the group then
  mapped **once** to a pair of register targets (date, day-status/hours) rather than 31 times. The user
  selects the group boundaries and the two target fields; no typing required. Monarch's three-part
  vocabulary (which columns to unpivot, which to keep as identity, what to name the outputs) is the right
  mental model, and Savant's separation of name-field and value-field is the right data model.
- Make the operation **reversible** (WebFOCUS reverts its pivot) and show the before/after in the preview,
  because mis-detecting the group boundary on a payroll sheet is the likely error.
- Header-to-date conversion must be explicit and previewed: Power Query needs a separate step for it, and
  Indian payroll sheets will carry `1`, `01`, `1-Nov`, `01/11/2026` and `Sun 1` as day headers. Offer the
  detected date format as a selection (not free text) with the parsed result shown.
- This group-mapping capability, plus the enum value mapping, is where our screen must exceed the
  commercial importers rather than imitate them — the market solves it with code hooks or by asking the
  user to reshape the file first.

### Gaps
- No embedded importer (Flatfile, OneSchema, Dromo, CSVbox, nuvo, Impler, UseCSV, Osmos) documents
  repeating-column-group or positional-group mapping in anything retrieved. The likely real answer in
  those products is a developer-written transform hook, but I found no page stating that for this case,
  so it is not asserted here.
- Nothing was found on how to display a mapped group in the confirmation/summary UI.

## Residual gaps across the whole topic

### Takeaway
Three things the report writer should treat as genuinely unavailable rather than merely unfound.

### Cited Findings
- **No NN/g material on data-import or column-mapping UX surfaced.** A search explicitly targeting it
  returned no nngroup.com result; the retrieved alternatives were vendor docs and blogs. No Baymard or
  Smashing Magazine primary article on import mapping was retrieved either (one blog credits Smashing
  for a point about error-message specificity, second-hand) —
  [Designing an attractive, usable data importer](https://www.digitalthriveai.com/en-us/resources/web-design/designing-attractive-usable-data-importer-app/)
- **Flatfile's product status is contested and matters for currency.** Flatfile pivoted in July 2023 from
  a ready-made CSV importer to an API-first "Data Exchange Platform"; a Dromo-authored post further
  reports Flatfile "rebranded to Obvious and shifted toward data orchestration". Both the pivot claim and
  the rebrand claim come from competitor-authored pages and should be verified before citing —
  [Dromo vs Flatfile vs OneSchema](https://dromo.io/blog/dromo-vs-flatfile-vs-oneschema-a-comprehensive-comparison); [Dromo: best Flatfile alternatives](https://dromo.io/blog/best-flatfile-alternatives-competitors-2026)
- **The build-vs-buy baseline:** with an open-source parser like Papa Parse "you are responsible for
  building and maintaining the column mapping UI, validation engine, error correction flow" —
  [CSVbox: Flatfile alternatives](https://dev.to/csvbox/flatfile-alternatives-best-tools-for-csv-import-e34) (vendor-authored)

### Inferences
- The entire public literature on this screen is vendor documentation, vendor blogs and changelogs. There
  is no academic or NN/g-grade usability evidence for any of the layout, confidence-display or preview
  decisions. Design decisions should be presented as reasoned convergence across shipped products, with
  the one measurable commitment available — Flatfile's >90% / 100% confidence bands — used as the
  numeric anchor.

### Gaps
- Impler, UseCSV and Osmos returned no substantive documentation in any search; nothing is reported about
  them. Stripe, Mailchimp, Shopify, QuickBooks, Xero, Looker Studio, Snowflake/Fivetran/Airbyte and dbt
  mapping UIs were not reached within the search budget and should be treated as uncovered, not absent.
- All `WebFetch` calls failed DNS resolution in this session, so no primary page was read in full;
  `support.flatfile.com`, `flatfile.com`, `developer.dromo.io`, `docs.oneschema.co` and
  `www.saasui.design` would need to be allowed in the session's network settings for verification.
