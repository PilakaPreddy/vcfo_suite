# Indian payroll and labour-compliance products: statutory labour-register handling (as of November 2026)

**Methodological caveat up front (important for the report-writer).** In this session, direct
page fetching (WebFetch) was blocked by the sandbox network allowlist — `www.keka.com`,
`icm.simpliance.in` and `hrone.cloud` all failed DNS resolution. All findings below therefore
come from web-search results that quote and summarise those pages, not from a first-hand read of
the vendor HTML. Where a figure or a form list is only reported second-hand through a search
summary, it is flagged. Several named vendors (Paysquare, Kanteneo, Pocket HRMS, Deel,
Remote.com, Multiplier) returned no usable India-register material at all and are listed under
Gaps. Nothing here should be treated as a verified feature list; it is a benchmark of **public
claims**, and a number of the strongest-sounding claims are vendor marketing or competitor blogs.

A second structural caveat: **a large share of the "best labour law compliance software 2026"
pages that dominate these search results are published by competing vendors** — `hrone.cloud`
(HROne), `zinghr.com` (ZingHR), `darwinbox.com`, `greythr.com/blog`, `asanify.com`,
`trilliantsoftware.com`. Their rankings and their criticism of rivals are marketing, and are
labelled as such throughout.

---

## Q1. Do these products generate actual statutory register files (Form XXII, Form XXIII, muster rolls, Form III integrated register, Form D Equal Remuneration, Form X Minimum Wages) — or only compliance reports, challans and ECR files?

### Takeaway
There is a sharp split. Mainstream payroll/HRMS products (Zoho Payroll, RazorpayX Payroll, and to
a large extent Darwinbox) stop at **filing artefacts** — ECR, ESIC contribution file, Form 24Q,
Form 16, PT/PF/ESI challans — and otherwise expose generic "reports". Only the
**compliance-specialist** vendors (Simpliance/Aparajitha, TeamLease RegTech) make explicit,
unambiguous claims to auto-generate *state-wise statutory registers as printable form documents*.
greytHR, Keka, HROne and factoHR sit in between: they publish form-level content and claim some
register generation, but the public evidence is form-by-form rather than a complete register
engine.

### Cited findings

**Specialist vendors — explicit register generation**
- Simpliance Classic "instantly generates statutory registers", and a Simpliance-linked page says
  its **SEAL engine auto-generates state-wise statutory registers under all applicable laws,
  available in printable PDF format** — this is the single most on-point claim found for the
  pattern SBC is building — [Simpliance labour law compliance](https://icm.simpliance.in/labour-law-compliance) (read via search summary only; direct fetch blocked); also surfaced via [Aparajitha labour law compliance software](https://www.aparajitha.com/products/labour-law-compliance-software/)
- TeamLease RegTech (product brand **RegTrack**) says it maintains statutory registers and files
  returns across central and state acts, and publishes a counted obligation library: **1,536 Acts
  applicable across central, state and local levels; 69,233 distinct compliance obligations;
  6,618 filings, returns and registers**, stated "as of August 2026". Each compliance item carries
  frequency, penalty, **sample form**, notes and linked legal updates — [TeamLease RegTech statutory compliance software](https://teamleaseregtech.com/product-services/statutory-regulatory-compliance-management-software/)
- Komrisk (Lexplosion) is described as automating "statutory compliance management, regulatory
  updates, task management, alerts, customised reports" — note this list is **task/alert/report
  oriented and does not mention register document generation** — [Lexplosion compliance management software](https://lexplosion.in/compliance-management-software/)
- AscentHR (managed service, not self-serve software) says it manages "the entire spectrum of
  labour law compliance, from statutory remittances and **registers** to returns filing and
  authority liaison", and separately offers a records environment to "maintain compliance
  documents, **registers, acknowledgements**, filings, policies, and supporting records" — [AscentHR compliance management](https://ascent-hr.com/solutions/compliance-management/)

**greytHR — form-level content plus a reports gallery, not a stated register engine**
- greytHR maintains a large public **compliance wiki keyed to individual state forms**, which is
  the best open artefact found for form naming. Examples confirmed:
  Telangana Shops & Establishments **Form XXII – Register of Employment** (basis cited as Rule
  29(1) of the state rules) — [greytHR wiki: Telangana Form XXII](https://www.greythr.com/wiki/compliances/telangana-shops-and-establishments-act-form-xxii-register-of-employment/);
  Andhra Pradesh **Form XXII – Register of Employment**, with fields listed as employee name,
  gender, age, and start/end times of employment — [greytHR wiki: AP Form XXII](https://www.greythr.com/wiki/compliances/andhra-pradesh-form-xxii-register-of-employment/);
  Karnataka **Form XXII – Register of Advances** under contract labour, kept "contract-wise,
  principal-employer-wise and establishment-wise" — [greytHR wiki: Karnataka Form XXII](https://www.greythr.com/wiki/compliances/karnataka-form-xxii-register-advances/);
  Goa **Form XXII – Register of hours of work commencing** (start, interval, end times) — [greytHR wiki: Goa Form XXII](https://www.greythr.com/wiki/compliances/goa-form-xxii-register-of-hours-of-work-commencing/)
- greytHR also publishes an act-level page for the **Contract Labour (Regulation & Abolition) Act,
  1970** listing Form XXII as Register of Advances — [greytHR wiki: CLRA 1970](https://www.greythr.com/wiki/acts/contract-labour-regulation-abolition-act-1970/)
- greytHR's **statutory compliance reports** are described as including ESI and labour reports —
  specifically **Form 7, Form V, Form X and Form II** — plus custom reports via Reports Gallery and
  Query Builder. greytHR ties **Form X to the Andhra Pradesh minimum wage rules as a register of
  wages** — surfaced via search of greytHR admin help; see [greytHR admin help](https://admin-help.greythr.com/admin/answers/U7JZwB8zQ2WGslCliNdbFw)
- greytHR's own blog on the 2017 Gazette "Ease of Compliance" changes discusses the modified
  register set, referring to Form XXII as a Register of Overtime **or** Advances in different
  replaced-form sets — [greytHR blog: labour law registers & forms modified](https://www.greythr.com/blog/labour-law-registers-and-forms-modified-easier-compliance/)
- A greytHR Community thread shows users **sharing Form D (Equal Remuneration Act) and Form X
  (Tamil Nadu S&E Act) PDFs with each other** rather than generating them in-product — a useful
  negative signal — [greytHR Community: statutory records](https://community.greythr.com/t/statutory-records/7558)

**Keka — per-form marketing pages with auto-fill claims**
- Keka publishes dedicated per-form pages. **Form XIII – Register of Contract Labour**: Keka says
  it "auto-populates worker details, employment dates, and termination records directly from
  contractor onboarding systems", with automatic updates as workers join, transfer or leave;
  threshold stated as contractors employing 20+ workers on any day in the preceding 12 months
  (Central Rule) — [Keka: Register of Contract Labour (Form XIII)](https://www.keka.com/compliance/forms/register-of-contract-labour) (summary only; keka.com unreachable from this session)
- **Wages Register** (Payment of Wages Act, 1936): Keka says PF, ESI, PT and LWF deductions are
  pulled in automatically, and that you can "download ready-to-file statutory returns in prescribed
  formats for EPFO, ESIC, PT, and TDS filings" — note the register itself and the *returns* are
  described in the same breath — [Keka: Wages Register](https://www.keka.com/compliance/forms/wages-register)
- **Form XXIII – Overtime Register**: Keka says it captures overtime from attendance or biometric
  systems and flags overtime exceeding statutory limits. Keka's own FAQ states that an **electronic
  overtime register requires prior approval from the Chief Labour Commissioner (Central)** — a
  legally material constraint for any digital-register product, SBC's included — [Keka: Overtime Register (Form XXIII)](https://www.keka.com/compliance/forms/overtime-register)
- Keka publishes a **free Excel template** alongside the Wages Register and Overtime Register
  pages — i.e. part of the "deliverable" is a downloadable blank template, SEO-led rather than
  generated — [Keka compliance hub](https://www.keka.com/compliance)

**Zoho — filing artefacts only, no register claim found**
- Zoho's own academy page says the system produces "the documents you need to file": the **EPF ECR
  report, the ESIC contribution report, the quarterly Form 24Q text file, and Form 16 at
  year-end**. It states Zoho generates **Form 16 Part B and merges it with Part A downloaded from
  TRACES** — [Zoho Payroll: automating statutory compliance](https://www.zoho.com/in/payroll/academy/taxes-and-compliance/automating-statutory-compliance.html)
- A third-party glossary claims Zoho generates **both** Form 16 Part A and Part B, which
  contradicts Zoho's own page on the TRACES dependency — [aaxonix glossary](https://aaxonix.com/glossary/zoho-payroll-india) vs the Zoho academy page above
- Zoho's India payroll FAQ raises Form 12BA (styled there as "Form 123 under the Income Tax Act,
  2025") and "statutory compliance reports", but the answers were not retrievable — [Zoho Payroll India FAQ](https://www.zoho.com/in/payroll/payroll-faq/)
- **No Zoho source found claiming any labour register (muster roll, Form III, Form D, Form X).**

**RazorpayX Payroll — challans only**
- Razorpay's official FAQ locates PF, ESIC and PT **challans** under Reports → Admin Options →
  "Provident Fund, ESI & Professional Tax", stating challans for all compliance payments are
  available by the 28th of the current month — [RazorpayX Payroll FAQs](https://razorpay.com/docs/payroll/faqs/?preferred-country=IN)
- Razorpay's FAQ also states Payroll **does not provide Form 16A by default** — you must contact
  Payroll Support, and only if you used Payroll to pay contractors and file 26Q — same source
- A 2022 Freshteam integration page says RazorpayX "takes care of all compliance payments and
  filings like TDS, PF, PT, ESI, and also generates 24Q and 26Q challans" — **dated 2022, treat as
  stale** — [Freshteam × RazorpayX integration](https://support.freshteam.com/support/solutions/articles/19000134212-integrating-razorpayx-payroll-with-freshteam)
- **No labour-register feature documentation was found for RazorpayX Payroll.**

**Darwinbox / HROne / Zimyo / factoHR — all claims routed through competitor blogs**
- Darwinbox: a comparison states that for Darwinbox "digital register generation and OSH Code
  compliance mapping remain in early development stages", and that "PoSH and CLRA compliance depth
  is limited" so organisations with large contract-labour populations need supplementary tools.
  **This is a competitor (HROne) publishing about Darwinbox — marketing** — [HROne: switching from Darwinbox](https://hrone.cloud/blog/switching-from-darwinbox-india/)
- HROne says (on its own blog) that it maintains **statutory registers, returns and challans inside
  the payroll module with role-scoped audit logs** — vendor self-claim, but it is the only
  mainstream HRMS found making an explicit *register + audit log* claim — [HROne: best labour law compliance software](https://hrone.cloud/blog/best-labour-law-compliance-software/)
- Zimyo: described as covering EPF, ESI, PT, TDS and the Labour Codes with Form 16 and challans
  from the same run; labour-law depth rated "Moderate (value-tier depth)" and "deeper compliance
  config still maturing" — third-party/competitor assessment — [ZingHR: labour law compliance software](https://www.zinghr.com/blogs/best-labour-law-compliance-software-india)
- factoHR: claims its engine suits CLRA, Shops & Establishments and Factories Act employers and
  "generates statutory registers"; a counter-review says **"register output not documented, so ask
  for samples"** — [ZingHR comparison](https://www.zinghr.com/blogs/best-labour-law-compliance-software-india)
- One source lists, under the Social Security rules, **Form I (employee register), Form IX
  (attendance register cum muster roll), Form XXII (register of women employees)** and asserts that
  physical wage registers no longer satisfy the OSH Code. This form mapping was **not confirmable
  against an official government source** in this research — [ZingHR / HROne labour code checklist](https://hrone.cloud/blog/hrms-requirements-under-new-labour-codes/)

### Inferences
- **The "form number" is not a stable key.** Form XXII alone maps to Register of Employment
  (Telangana, AP), Register of Advances (Karnataka CLRA, central CLRA), Register of hours of work
  commencing (Goa), and — per one source — Register of Women Employees under the Social Security
  rules. The same ambiguity appears for Form X (AP minimum-wage wage register per greytHR vs Tamil
  Nadu CLRA temporary licence application per a third-party hub) and Form D (attendance register
  under the central Ease of Compliance rules vs an Equal Remuneration Act form). **SBC's data model
  must key registers on (state, act, rule, form number, form title) — never on form number alone.**
  This is probably the single most actionable finding in this research.
- greytHR's wiki is effectively a **free, structured, state-by-state register taxonomy** that SBC
  can use as a cross-check for its own form catalogue, even though greytHR does not appear to
  generate most of those forms as documents.
- The Keka FAQ point about the Chief Labour Commissioner's prior approval for electronic overtime
  registers suggests the safest product posture for SBC is **generate the prescribed-format
  document for the client to print/retain**, not "be the register of record".

### Gaps
- No vendor published a **complete enumerated list** of registers it generates. Not one source gave
  a list of the form IDs a product outputs end-to-end. Every list found was partial and
  marketing-framed.
- **Form III integrated register** (Ease of Compliance Rules 2017) was not matched to any vendor's
  generation claim. The 2017 consolidated five-register set (Forms A–E under the Ease of Compliance
  to Maintain Registers Rules) is referenced by Simpliance's legal database — [Simpliance: Ease of Compliance Rules 2017](https://www.simpliance.in/India/LEI/govt_notification/Central/ease-of-compliance-to-maintain-registers-under-various-labour-law-rules-2017-92) — but no product was found claiming to emit it.
- **Form D (Equal Remuneration Act)** generation: no vendor claim found; the only trace is users
  swapping PDFs on the greytHR community forum.

---

## Q2. State coverage — what is claimed, and in what units ("all 29 states", "500+ forms")?

### Takeaway
Coverage is advertised in three incompatible units — **states/UTs**, **Acts**, and
**obligations/forms/registers** — which makes cross-vendor comparison impossible without
normalising. The highest-credibility counted claim is TeamLease RegTech's (Acts + obligations +
filings/returns/registers, dated). The "500+ forms" figure in the brief was **not found**; the
nearest real numbers are Aparajitha's 181 forms / 84 registers *under the new labour codes*.

### Cited findings
- **Keka: "coverage across all 28 states and 8 union territories"** (i.e. the full set, advertised
  as a unit count) — [Keka payroll compliance](https://www.keka.com/payroll-compliance) (via search summary; page unreachable from this session)
- **TeamLease RegTech: 1,536 Acts / 69,233 distinct compliance obligations / 6,618 filings, returns
  and registers**, stated as of **August 2026**; scope stated as statutory, labour, secretarial,
  EHS, finance and industry-specific compliances across Central, State and Local laws — [TeamLease RegTech](https://teamleaseregtech.com/product-services/statutory-regulatory-compliance-management-software/)
- **Aparajitha/Simpliance: "presence in 25 Indian States, with over 1,750 clients"** (2022 press
  release) versus a more recent company page citing **"national presence covering 28 states"** —
  the 25 figure should be marked as 2022 — [Aparajitha press release](https://www.aparajitha.com/media-press-releases/aparajitha-is-set-for-its-acquisition-journey-of-consolidating-robust-compliance-platforms/); [Aparajitha labour codes consulting](https://www.aparajitha.com/services/labour-codes-consulting/)
- **Aparajitha labour-codes page: 181 forms and 84 registers under the new codes.** Same page states
  that **central rules for the Code on Wages, Industrial Relations Code, Code on Social Security and
  OSH Code were notified on 8 May 2026, while state-specific rules are still being notified** — [Aparajitha labour codes consulting](https://www.aparajitha.com/services/labour-codes-consulting/)
- **Komrisk: "600-plus companies across India and globally"** (client count, not coverage count) —
  third-party guide — [Trilliant: top 10 compliance management software 2026](https://www.trilliantsoftware.com/top-10-compliance-management-software-in-india-2026-the-complete-buyers-guide/)
- A buyer's guide notes TeamLease "says its product can track compliance globally but its **legal
  updates cover India only**" — [Trilliant guide](https://www.trilliantsoftware.com/top-10-compliance-management-software-in-india-2026-the-complete-buyers-guide/)
- Simpliance's own claim is scoped by **applicability rather than a state count**: registers "under
  all applicable laws", state-wise — [Simpliance](https://icm.simpliance.in/labour-law-compliance)

### Inferences
- The **8 May 2026 notification of central rules under all four labour codes, with state rules still
  rolling out**, is the dominant market fact for November 2026. It means (a) every vendor's register
  catalogue is mid-migration, (b) "labour codes ready" is currently a claim nobody can fully
  substantiate, and (c) SBC entering now is not entering a settled market — the incumbents'
  catalogues are as unstable as a new entrant's. Competitor blogs describing rivals' labour-code
  readiness as "in early development stages" / "in progress" are consistent with this.
- A defensible SBC claim unit would be **(act × state × form) tuples generated**, with a notified-on
  date per form — more honest and more checkable than any competitor's number.

### Gaps
- **"500+ forms" could not be sourced to any vendor.** If the brief's author saw it, it may be from
  a brochure or a sales deck not indexed.
- No vendor publishes a **machine-readable or even downloadable list** of covered states × forms, so
  all coverage claims are unfalsifiable as published.

---

## Q3. How are registers produced — templated Excel/PDF download, e-sign, filed on a state portal, or delivered by a service team?

### Takeaway
Three delivery models are visible: **printable PDF from a rules engine** (Simpliance), **reports
gallery export in PDF/XLS/Doc** (greytHR), and **managed service / human-delivered** (AscentHR,
Aparajitha services, TeamLease). No vendor was found advertising **e-signature or attestation on a
register**, and no vendor was found filing a *register* on a state portal — portal filing in all
sources relates to returns and challans, not registers.

### Cited findings
- Simpliance: registers "available in **printable PDF format**", auto-generated state-wise — [Simpliance](https://icm.simpliance.in/labour-law-compliance)
- greytHR: "The Reports Gallery page in the greytHR Admin portal allows you to view and generate
  reports under various categories. You can download the reports in formats such as **PDF, XLS, or
  Doc**" — plus a **Query Builder** for custom reports — [greytHR admin help](https://admin-help.greythr.com/admin/answers/U7JZwB8zQ2WGslCliNdbFw)
- Keka: ships **free Excel templates** next to its form explainers, and claims "download ready-to-file
  statutory returns in prescribed formats" — [Keka: Wages Register](https://www.keka.com/compliance/forms/wages-register)
- Razorpay: challans are **downloaded from the Payroll Dashboard**, Reports → Admin Options, with a
  28th-of-month availability SLA — [RazorpayX Payroll FAQs](https://razorpay.com/docs/payroll/faqs/?preferred-country=IN)
- AscentHR (managed): "statutory remittances and registers to returns filing and **authority
  liaison**" — i.e. a service team interfaces with the authority, with an "organised environment" to
  hold registers and **acknowledgements** — [AscentHR](https://ascent-hr.com/solutions/compliance-management/); [AscentHR payroll services](https://ascent-hr.com/service/payroll-services)
- Aparajitha sells distinct **managed service lines**: Payroll Compliance Services, Factory
  Compliance Services, Vendor Compliance Services, Labour Codes Consulting — i.e. the register work
  is packaged as a service alongside the software — [Aparajitha payroll compliance](https://www.aparajitha.com/services/payroll-compliance-services/); [factory compliance](https://www.aparajitha.com/services/factory-compliance-services/); [vendor compliance](https://www.aparajitha.com/services/vendor-compliance-services/)
- TeamLease RegTech positions itself as both software and service: "track, automate **and service**"
  statutory compliances — [TeamLease RegTech](https://teamleaseregtech.com/product-services/statutory-regulatory-compliance-management-software/)
- Legal constraint on the digital-register route: an electronic overtime register needs **prior
  approval from the Chief Labour Commissioner (Central)** — [Keka: Overtime Register](https://www.keka.com/compliance/forms/overtime-register)

### Inferences
- The specialist market is really a **services market with a software front end**. For SBC (a CA/CS
  firm), this is favourable positioning: SBC is already the service team, and the software is the
  margin lever — the same shape as Aparajitha and AscentHR, at a smaller scale.
- **E-sign / attestation on registers is an open gap in the whole market** as far as public material
  shows. An inspection-ready bundle with captured signatory details would be a differentiator, not
  parity.

### Gaps
- Nothing found on whether any product writes a register to a state labour-department portal.
- No product demo or webinar transcript was retrievable in this session (fetch blocked), so the
  brief's request to "describe what a demo shows" could not be fulfilled.

---

## Q4. How do they get the inputs — native payroll, file upload, API? What does the import/mapping flow look like? Does anyone do explicit column mapping of a client's payroll sheet into statutory formats?

### Takeaway
The HRMS vendors derive registers from **native payroll and attendance data** (their advantage and
their lock-in). **Explicit column mapping of an arbitrary client payroll sheet into statutory
formats does exist, but only among small/niche Indian payroll vendors**, not among the six priority
products — and the pattern found is "map once, save as a reusable template", which is almost exactly
the flow SBC is proposing.

### Cited findings
- **The closest competitor pattern found.** A vendor describes import mapping in these terms: "It's
  not enough to upload a file – **every column in your Excel sheet needs a matching field in the
  payroll system, and every mismatch needs a decision, not a guess**", with validation before data
  is accepted — [indpayroll: payroll import from Excel](https://www.indpayroll.com/blog/payroll-import-from-excel-complete-guide-for-indian-businesses)
- **Saved mapping templates:** "Save the mapping as a template and every future import is a single
  file upload" — [The Payrollers](https://the-payrollers.in/)
- A small vendor positions the output explicitly as CA-shaped: "Payroll **registers and compliance
  reports export to Excel in the shape your CA needs** for ECR, ESIC, and Form 24Q filings" — the
  nearest thing found to SBC's own value proposition, stated by a competitor — [snapHRM payroll India](https://www.snaphrm.com/payroll-software-india)
- A register workbook product is sold as a **"Monthly muster workbook (XLSX + signed PDF)"** — i.e.
  XLSX plus a signed PDF deliverable, the closest found to attestation capture — [fyboard payroll register](https://www.fyboard.com/tools/fypayrun/payroll-register)
- A register template is described as carrying **BANK / IFSC / NET columns** ready for NEFT/RTGS
  upload — i.e. the register doubles as the bank file source — [calcguru payroll register Excel](https://calcguru.in/excel-downloads/payroll-register-excel/)
- **Native-data derivation (the HRMS model):** Keka claims Form XIII auto-populates from contractor
  onboarding and updates as workers join/transfer/leave; Form XXIII pulls overtime from
  **attendance or biometric systems** — [Keka Form XIII](https://www.keka.com/compliance/forms/register-of-contract-labour); [Keka Form XXIII](https://www.keka.com/compliance/forms/overtime-register)
- Keka's Wages Register pulls **PF, ESI, PT and LWF deductions** in automatically from the payroll
  run — [Keka Wages Register](https://www.keka.com/compliance/forms/wages-register)
- Integration-based input exists at the payroll layer rather than the register layer, e.g.
  Freshteam → RazorpayX Payroll — [Freshteam integration](https://support.freshteam.com/support/solutions/articles/19000134212-integrating-razorpayx-payroll-with-freshteam)

### Inferences
- **The structural gap SBC is aiming at is real.** The products with the best register content
  (Keka, greytHR) require you to run payroll *in them*; the products with the best register
  *engines* (Simpliance, TeamLease) are enterprise/managed-service. Nobody in the priority six was
  found offering "bring your own payroll sheet → mapped → state-wise statutory registers out",
  which is a CA/CS-firm-shaped workflow rather than an employer-shaped one.
- The "save the mapping as a reusable template" idiom is the right UX target: it is what the niche
  vendors converged on, and for SBC it maps naturally onto per-client persisted column mappings.
- One nuance worth building for: the same uploaded sheet feeds registers *and* ECR/ESIC/24Q
  derivatives *and* a bank file. Vendors treat these as one pipeline, not separate features.

### Gaps
- No documentation found on whether greytHR, Keka, Zoho or Razorpay accept a **third-party payroll
  sheet** as the basis for register generation (as opposed to seeding their own payroll).
- No public API documentation found for register generation at any vendor.
- The indpayroll / the-payrollers / snapHRM / fyboard / calcguru sources are **small, low-authority
  vendor sites**; their flows are credible as patterns but their market significance is likely
  negligible. Do not present them as major competitors.

---

## Q5. What does the client-facing deliverable look like? Audit trail, version history, signatory/attestation capture, retention?

### Takeaway
Thin evidence across the board. The only explicit audit-trail claim found is **HROne's "role-scoped
audit logs"** (self-published), and the only attestation-adjacent artefacts are **AscentHR's
"registers and acknowledgements" records store** and a niche vendor's "XLSX + signed PDF". No
vendor was found publishing a **register-level version history or a retention policy**.

### Cited findings
- HROne: statutory registers, returns and challans inside the payroll module **with role-scoped
  audit logs** — vendor self-claim — [HROne](https://hrone.cloud/blog/best-labour-law-compliance-software/)
- AscentHR: "Maintain compliance documents, **registers, acknowledgements**, filings, policies, and
  supporting records in an organised environment"; plus "Auto-tracks deadlines, updates, and
  tasks—reducing manual effort and boosting compliance accuracy" — [AscentHR compliance management](https://ascent-hr.com/solutions/compliance-management/)
- TeamLease RegTech: each compliance obligation carries **frequency, penalty, sample form, notes and
  linked legal updates** — a compliance-item audit surface, not a register-document one — [TeamLease RegTech](https://teamleaseregtech.com/product-services/statutory-regulatory-compliance-management-software/)
- Komrisk: "regulatory updates, task management, **alerts**, customised reports", marketed for
  multi-location businesses, blending statutory with internal compliance workflows — [Lexplosion](https://lexplosion.in/compliance-management-software/)
- Niche vendor deliverable shape: **"XLSX + signed PDF"** monthly muster workbook — [fyboard](https://www.fyboard.com/tools/fypayrun/payroll-register)
- greytHR's client-facing surface for these artefacts is the **Reports Gallery** download (PDF/XLS/
  Doc), not a document vault — [greytHR admin help](https://admin-help.greythr.com/admin/answers/U7JZwB8zQ2WGslCliNdbFw)

### Inferences
- **"Inspection-ready bundle" appears to be an unclaimed position.** No vendor in this research
  advertised a packaged, dated, signed, per-establishment bundle of all applicable registers for an
  inspector visit. Given that the entire legal purpose of these registers is to be produced on
  inspection, this is a conspicuous market gap and the strongest differentiation hypothesis for SBC.
- Register-level versioning matters more under the new codes than before, because the forms
  themselves are changing during 2026 — a register generated in March 2026 and one generated in
  November 2026 may be on different prescribed formats. A product that stamps **which rule version
  a register was generated under** would be ahead of everything found here.

### Gaps
- **No retention-policy statement found for any vendor.** Statutory retention periods for labour
  registers were not covered by any vendor page retrieved.
- No evidence found of signatory/attestation capture (name, designation, date of the authorised
  signatory) in any mainstream product.
- No version-history feature found for registers anywhere.

---

## Q6. Pricing — and is labour-register generation a separate SKU?

### Takeaway
For the HRMS products, **register/compliance functionality is bundled into a plan tier, not sold as
a register SKU** — greytHR's official pricing page lists add-ons and compliance is not among them.
The specialist vendors publish **no pricing at all** (enterprise quote). Published third-party
greytHR prices conflict badly with greytHR's own page.

### Cited findings
- **greytHR official pricing:** Essential **₹2,495/month** and Growth **₹4,495/month**, each covering
  50 employees; additional employees **₹45** (Essential) or **₹85** (Growth) per month. Add-ons listed
  are **Expense Management, SSO & API, greytHR Recruit, Alumni Portal — compliance is NOT listed as
  an add-on** — [greytHR pricing](https://www.greythr.com/pricing/)
- Conflicting third-party greytHR figures, all from 2026 pages: ₹2,495 + ₹45/employee with Premium
  custom-quoted and effective ₹70–95 per employee at 25–100 headcount — [HROne: greytHR pricing](https://hrone.cloud/blog/greythr-pricing-india/);
  ₹3,495 (Essential) / ₹5,495 (Growth), 50 employees included, ₹35 and ₹60 per additional employee,
  dated May 2026 — [Asanify vs greytHR](https://asanify.com/blog/competition/asanify-vs-greythr/);
  and others quoting a ₹2,988 base + ₹40/employee, or ₹3,495/₹4,995 flat with a ₹149/employee
  option — [appadvisor greytHR](https://appadvisor.in/software/greythr). **Treat only the official page as authoritative; the
  spread suggests stale third-party pages and/or regional discounting.**
- greytHR plan positioning: Growth is described as the tier for SMBs needing "payroll processing,
  attendance, and statutory compliance", and a paid plan is required for full payroll/compliance —
  but **no compliance line item is priced** — [HROne greytHR pricing analysis](https://hrone.cloud/blog/greythr-pricing-india/)
- greytHR publishes a **Starter/Essential feature-comparison page**, confirming compliance features
  are gated by tier rather than sold separately — [greytHR feature comparison](https://www.greythr.com/help-admin/know-more-greythr/feature-comparison-starter-essential/)
- **No published pricing found** for Simpliance, Aparajitha, TeamLease RegTech, Komrisk or AscentHR —
  all enterprise/quote-based. (Verified by absence across all searches in this session.)
- RazorpayX Payroll pricing is listed only on third-party aggregators, not resolved here — [SoftwareSuggest RazorpayX](https://www.softwaresuggest.com/razorpayx-payroll); [SaaSworthy RazorpayX](https://www.saasworthy.com/product/razorpayx-payroll)

### Inferences
- Because registers are bundled, **there is no observable market price for "statutory register
  generation" as a standalone unit.** SBC therefore has pricing freedom — but also no anchor, and
  prospective clients will mentally compare against the ~₹45–85/employee/month HRMS bundle that
  appears to include "compliance".
- The specialist vendors' refusal to publish pricing implies enterprise-sized deals, which supports
  the view that the **SME / CA-firm-client segment is under-served** at a self-serve price point.

### Gaps
- Keka pricing was not retrievable (keka.com unreachable in this session).
- Zoho Payroll India pricing not retrieved this session.
- No pricing at all for the six compliance specialists.

---

## Q7. What do users complain about — registers, state coverage, data upload, accuracy?

### Takeaway
The dominant complaint across both greytHR and Keka is **report inflexibility — users fall back to
Excel for anything non-standard**, which is precisely the pain a register generator addresses.
Review-site evidence is, however, almost entirely about payroll and UI; **no review was found that
complains specifically about labour registers or state coverage**, which is itself a signal (either
the feature is unused, or users don't expect it from these products).

### Cited findings
- **Keka reviewers on reports:** "some reports and workflows are hard to tweak the way they'd like",
  and **"anything beyond the standard reports usually means exporting data and building it in
  spreadsheets"** — [G2 Keka reviews](https://www.g2.com/products/keka/reviews?page=2); [G2 Keka pros and cons](https://www.g2.com/products/keka/reviews?qs=pros-and-cons)
- **greytHR complaints:** interface described as dated; "simple customisations require tickets";
  payroll errors reported, including a reviewer writing **"A lot of errors while running payroll"** —
  surfaced via [SoftwareSuggest greytHR vs Keka](https://www.softwaresuggest.com/compare/greythr-vs-keka) and [Software Advice greytHR vs Keka](https://www.softwareadvice.com/hr/greythr-profile/vs/keka/)
- **Keka complaints:** glitches during peak payroll days, slow support in some reviews (though G2
  summaries also rate Keka's support highly); one reviewer noted Keka **does not support
  multi-country payroll and compliance** — [G2 Keka vs greytHR](https://www.g2.com/compare/keka-vs-greythr)
- **Ratings (snapshot-dependent):** SoftwareSuggest shows greytHR **4.6** (103 reviews) and Keka
  **4.7** (173 reviews); G2 showed both at **4.4/5**, with Keka at 4.4 across **2,221** reviews in one
  August 2026 snapshot and **2,456** reviews in another — counts move, check live — [SoftwareSuggest comparison](https://www.softwaresuggest.com/compare/greythr-vs-keka); [G2 comparison](https://www.g2.com/compare/keka-vs-greythr)
- **RazorpayX:** third-party reviews say "report generation and compliance updates could be
  improved", implying custom reports need manual work — [SoftwareSuggest RazorpayX](https://www.softwaresuggest.com/razorpayx-payroll); [Slashdot RazorpayX reviews](https://slashdot.org/software/p/RazorpayX-Payroll/)
- **Positioning consensus from comparisons:** Keka generally wins on ease of use, modern UI and
  review volume; greytHR is generally seen as **stronger on India-specific statutory compliance**;
  Keka is described as "slightly newer to the compliance-vendor space" — [greytHR vs Keka (greytHR's own blog — marketing)](https://www.greythr.com/blog/greythr-vs-keka/); [peopleHum comparison](https://www.peoplehum.com/blog/greythr-vs-keka-vs-peoplehum-best-indian-hr-software); [HROne Keka vs greytHR](https://hrone.cloud/blog/keka-vs-greythr-india/)

### Inferences
- "Everything beyond standard reports goes to Excel" is the **single most quotable user-side
  justification** for a dedicated register generator, and it comes from G2 reviews of the market
  leader rather than from a vendor.
- The absence of register-specific complaints most likely means **employers currently maintain these
  registers manually or through a consultant**, and never attempt it in their HRMS — consistent with
  the greytHR community thread where users trade blank Form D / Form X PDFs.

### Gaps
- **Reddit r/india, LinkedIn posts by HR/compliance practitioners, and Trustpilot were not reached**
  in this session (no usable results surfaced within the tool budget, and direct fetching was
  blocked). The brief's request for community-sourced complaints is therefore unmet.
- No Capterra data retrieved.
- No review found that mentions labour registers, state coverage gaps, or register import/mapping
  accuracy by name — an evidential gap, not evidence of absence.

---

## Cross-cutting notes the report-writer should carry forward

### Market structure, and corporate lineage (useful, and easy to get wrong)
- **Simpliance was acquired by Aparajitha Corporate Services (dated 07 Oct 2022), not by Zoho.** The
  brief's "now part of Zoho?" is **unsupported** — Zoho appears in these search results only inside
  third-party product comparisons. Quess Corp's exit was reported at an enterprise value of
  **₹120 crore**, while another report puts the founder-side stake sale at **₹28 crore**; the two
  figures do not reconcile, so the valuation should be marked unconfirmed — [CB Insights: Simpliance](https://www.cbinsights.com/company/simpliance); [Tracxn: Simpliance](https://tracxn.com/d/companies/simpliance/__Ux2bLMqbCGPPaqLT3Lh4J1L7xiqZn_4q-HqE2BH8DdY); [Aparajitha press release](https://www.aparajitha.com/media-press-releases/aparajitha-is-set-for-its-acquisition-journey-of-consolidating-robust-compliance-platforms/)
- **Aparajitha's platform was rebranded from Compfie to "Simpliance GRC"**, per a partner quoted in
  the 2022 press release; a Compfie-branded ESS portal is still live at
  [compfiepay.compfie.com](https://compfiepay.compfie.com/) — [Aparajitha press release](https://www.aparajitha.com/media-press-releases/aparajitha-is-set-for-its-acquisition-journey-of-consolidating-robust-compliance-platforms/)
- **TeamLease RegTech is the renamed Avantis RegTech** — TeamLease Services raised its stake in
  Avantis to **61.5%** and renamed the company (press release dated October 2021). Product brand:
  **RegTrack**. So "Avantis RegTech" and "TeamLease RegTech" in the brief are the **same company**,
  not two comparators — [TeamLease RegTech press releases](https://teamleaseregtech.com/press-release/); [Avantis](https://avantis.co.in/); [TeamLease Services (Wikipedia)](https://en.wikipedia.org/wiki/TeamLease_Services)
- Tracxn classifies Avantis as "Acquired" and TeamLease RegTech as "Unfunded" (third-party
  classification) — [Tracxn: TeamLease RegTech](https://tracxn.com/d/legal-entities/india/teamlease-regtech-private-limited/__MYWDwFOVudmqk0hkypaRQgx6-pm6SSR7ftLjk0Cw39Q). A Zauba corporate record gives an older registered address than the
  TeamLease site — [Zaubacorp](https://www.zaubacorp.com/company/TEAMLEASE-REGTECH-PRIVATE-LIMITED/U74999PN2018PTC179553)
- A 2026 buyer's guide places **TeamLease RegTech, Simpliance and Komrisk** as the leaders for large
  enterprises and multi-state employers — third-party, but an independent-ish grouping — [Trilliant guide](https://www.trilliantsoftware.com/top-10-compliance-management-software-in-india-2026-the-complete-buyers-guide/)

### A dated fact to verify before use
- One low-authority vendor template page states the **PF statutory wage ceiling rose from ₹15,000 to
  ₹25,000 effective 17 September 2026**. This is a **single unverified vendor source** and conflicts
  with the long-standing ₹15,000 ceiling. **Do not use without an EPFO or gazette confirmation** —
  [calcguru](https://calcguru.in/excel-downloads/payroll-register-excel/). Flagged because if true it changes every wage register SBC generates.

### Overall gaps in this research
- **Direct vendor-page reading was impossible** (network allowlist). Every vendor claim above is
  mediated by a search engine's reading of the page. The highest-value next step is to re-run this
  with `www.keka.com`, `icm.simpliance.in`, `hrone.cloud`, `www.greythr.com`, `teamleaseregtech.com`
  and `www.zoho.com` allowlisted, and to read Keka's full `/compliance/forms/` index — that index
  appears to be the **largest public form-by-form catalogue** of any vendor and is the best single
  source for exact form names and numbers.
- **No vendor PDF brochures or demo videos were retrievable**, so the brief's "describe what a demo
  shows" is unmet.
- **Zero coverage obtained** for: Paysquare, Kanteneo, Pocket HRMS, Deel (India register specifics),
  Remote.com, Multiplier. For the global comparators, searches returned only generic EOR comparison
  content; **nothing on statutory registers or muster rolls for Rippling, Papaya or Deel in India**
  was found. The one directly relevant (but competitor-published) claim is that "neither platform
  delivers deep India-specific compliance for PF, ESI, professional tax, and gratuity at the state
  level" — [Wisemonk: Papaya vs Rippling](https://www.wisemonk.io/blogs/papaya-global-vs-rippling). Conflicting claims exist on Rippling's India entity model: a
  Rippling blog says it owns Indian entities and runs payroll on native software, while a
  competitor's comparison says every one of Rippling's 80 EOR countries runs through a third-party
  partner — [Rippling: EOR India](https://www.rippling.com/blog/employer-of-record-guide-india); contradicted by [eorhq comparison](https://eorhq.com/compare/rippling-vs-papaya-global/)
