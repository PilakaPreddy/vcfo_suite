# AI provider terms: Anthropic API vs Amazon Bedrock for Ask VCFO and the VCFO Assist resolver (position as of 10 November 2026)

Scope: the contractual and data-handling terms that apply when an Indian CA/CS firm sends client personal data (company details, director names, PAN, addresses, documents) to Claude, through Anthropic's own API or through Amazon Bedrock, plus what the firm's code actually does today. All web sources were read on 10 November 2026. Several pages carry no visible "last updated" date; where a date is known it is given.

## 1. What the firm's code actually does (read-only review)

### Takeaway
Production calls the **Anthropic first-party API**, not Bedrock, and no region or `inference_geo` is set, so requests go to Anthropic's default "global" processing. Identity numbers (PAN, Aadhaar, passport, DIN) are masked or tokenised on the main paths, but names, addresses, emails, phone numbers and other document text are **not** masked before they reach the model. The browser-extension resolver sends labels only, and it refuses (does not mask) any payload that looks like personal data.

### Cited Findings
- **Default provider is Anthropic.** `askConfig()` picks `bedrock` only when `ASK_VCFO_LLM_PROVIDER === 'bedrock'`; otherwise it picks `anthropic` — [src/lib/ask/config.ts line 54](file:///home/user/vcfo_suite/src/lib/ask/config.ts). Terraform sets `ASK_VCFO_LLM_PROVIDER = "anthropic"` for App Runner, with the key read from Secrets Manager (`ANTHROPIC_API_KEY_SECRET_ID`) — [infra/app.tf lines 181-186](file:///home/user/vcfo_suite/infra/app.tf). `.env.example` line 210 has the same default.
- **The Bedrock region is not hard-coded.** It comes from `ASK_VCFO_BEDROCK_REGION`, which is empty in `.env.example` and not set in Terraform. Without it the Bedrock provider is null and Ask VCFO falls back to deterministic paths — [config.ts line 71](file:///home/user/vcfo_suite/src/lib/ask/config.ts); [provider/index.ts lines 110-114](file:///home/user/vcfo_suite/src/lib/ask/provider/index.ts).
- **The Bedrock adapter uses the Mantle endpoint** (`AnthropicBedrockMantle` from `@anthropic-ai/bedrock-sdk`). It sends model ids as `anthropic.<model>`, for example `anthropic.claude-haiku-5-5`, with no geographic prefix such as `in.` — [src/lib/ask/provider/bedrock.ts lines 3, 12-13](file:///home/user/vcfo_suite/src/lib/ask/provider/bedrock.ts).
- **The Anthropic adapter sends no `inference_geo`.** It calls `client.beta.messages.create` with the beta `server-side-fallback-2026-07-01` and `fallbacks: 'default'` on every non-Haiku model unless `ASK_VCFO_REFUSAL_FALLBACK=false`. That means a refused request can be answered by another model inside the same call — [anthropic.ts lines 44-58](file:///home/user/vcfo_suite/src/lib/ask/provider/anthropic.ts).
- **Default models**: `claude-haiku-5-5` for guard, answer, contextualizer, document, extract and watch; `claude-sonnet-5-5` for agent — [config.ts lines 60-66](file:///home/user/vcfo_suite/src/lib/ask/config.ts). Neither is an Anthropic "Covered Model" (Fable 5.x and Mythos 5.x). See section 2.
- **Embeddings** go to Bedrock Titan v2 only when `ASK_EMBEDDINGS_PROVIDER=bedrock` and `ASK_EMBEDDINGS_REGION` are set. The default is `none`, which means full-text search only — [config.ts lines 138-144](file:///home/user/vcfo_suite/src/lib/ask/config.ts).
- **What the masking covers (`mask.ts`).** Regexes match PAN (`[A-Z]{5}\d{4}[A-Z]`), Aadhaar (12 digits, first digit 2-9), passport (`[A-Z][1-9]\d{6}`) and DIN (only when written next to the word "DIN"). `maskIdentityNumbers` keeps the last 4 characters. `tokeniseIdentityNumbers` swaps each match for an `IDTOKEN<n>X` placeholder and restores the value afterwards. GSTIN and CIN are left readable on purpose — [src/lib/ask/mask.ts](file:///home/user/vcfo_suite/src/lib/ask/mask.ts).
- **Where the masking is applied.**
  - The chat message is masked before use and storage — [pipeline.ts line 185](file:///home/user/vcfo_suite/src/lib/ask/pipeline.ts).
  - Retrieved knowledge chunks are masked — [retrieve.ts line 75](file:///home/user/vcfo_suite/src/lib/ask/retrieve.ts).
  - Document text sent to the model for field extraction is tokenised — [data-router/read.ts line 237](file:///home/user/vcfo_suite/src/lib/ask/data-router/read.ts).
  - However, the "Do" data router receives the raw message (`request.message`), with this comment: "The raw message goes there because code needs the values; it is stored only in masked form" — [pipeline.ts lines 263-266](file:///home/user/vcfo_suite/src/lib/ask/pipeline.ts).
  - Identity-document reading is off by default (`ASK_ID_DOC_READING=false`) — [config.ts line 104](file:///home/user/vcfo_suite/src/lib/ask/config.ts).
- **The VCFO Assist resolver (`resolve.ts`, `pii.ts`) sends labels only.** It sends one field label and up to 40 candidate labels, names or aria labels (200 characters each). Before any model call, `looksLikePersonalData` checks every label. It refuses the payload (HTTP 422) if a label holds a PAN, Aadhaar, passport or DIN, an email, an Indian mobile number or any 8-digit run. The model output is limited by a JSON schema to an index from the list that was sent. With no provider, an exhausted budget or the `assist_resolve` kill switch, a deterministic fuzzy match answers instead — [src/lib/assist-agents/resolve.ts lines 69-72, 155-203](file:///home/user/vcfo_suite/src/lib/assist-agents/resolve.ts); [pii.ts](file:///home/user/vcfo_suite/src/lib/assist-agents/pii.ts).

### Inferences
- With today's configuration, all Ask VCFO prompts are processed by Anthropic PBC (US) under its Commercial Terms. Processing is not in India, and no residency control is applied.
- If a future change sets `ASK_VCFO_LLM_PROVIDER=bedrock` and `ASK_VCFO_BEDROCK_REGION=ap-south-1`, the call would still use the Mantle path with plain `anthropic.*` ids. According to Anthropic's Bedrock region table, Mantle in ap-south-1 offers only the **Global** endpoint type, so that call would probably route outside India (section 4).
- Director names, addresses, dates of birth, emails and phone numbers in typed messages or documents are not masked. Only the four identity-number patterns are. Under DPDP these are still personal data.
- The resolver's design (labels only, refuse rather than mask) makes it low-risk under any provider. The structured-output JSON schema contains only candidate indexes, so no personal data sits in a cached schema.

### Gaps
- I did not trace every model call site (for example `generate.ts`, `pdf-brief.ts`, `topic-review.ts`, the `watch/` paths) to confirm that each one masks first.
- I could not confirm whether App Runner has `ASK_VCFO_ENABLED=true` in production now (it depends on `var.ask_vcfo_enabled`).

## 2. Anthropic Commercial Terms and data retention: training, retention, ZDR

### Takeaway
Under the Commercial Terms, Anthropic may not train on API inputs or outputs. The standard API deletes inputs and outputs within 30 days, but flagged content can be kept for up to 2 years and classifier scores for up to 7 years. Zero data retention (ZDR) is a negotiated arrangement obtained through Anthropic sales, enabled per organization. Anthropic's own docs page now says conversation content is "not retained by default" except for Covered Models, which conflicts with the 30-day statement on the privacy center.

### Cited Findings
- **No training.** "Anthropic may not train models on Customer Content from Services"; Customer Content covers Inputs and Outputs. The customer keeps its rights to Inputs and owns Outputs — [Anthropic Commercial Terms](https://www.anthropic.com/legal/commercial-terms). The docs repeat: "Retained data is never used for model training without your express permission" — [API and data retention](https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention).
- **Contracting party and governing law.** Customers outside the EEA, Switzerland and the UK (which includes India) contract with Anthropic PBC under California law, with arbitration in San Francisco. The Commercial Terms have no India-specific clause — [Commercial Terms](https://www.anthropic.com/legal/commercial-terms).
- **Default retention (privacy center, stated as of 1 July 2026).** "We automatically delete inputs and outputs on our backend within 30 days of receipt or generation." The exceptions are:
  - services with longer retention under the customer's control, such as the Files API;
  - a ZDR or other agreement;
  - Usage Policy enforcement;
  - legal requirements.

  Source: [Privacy center: How long do you store commercial API data](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-commercial-api-data).
- **Trust and safety retention.** When automated trust and safety systems flag content, inputs and outputs are kept for up to 2 years and classification scores for up to 7 years. Feedback data (thumbs up/down, bug reports) is kept for 5 years — [privacy center](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-commercial-api-data). This applies "even with ZDR or HIPAA arrangements in place" — [API and data retention: Retention regardless of arrangement](https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention).
- **Conflicting statement in the docs.** "Conversation content (your prompts and Claude's outputs) is not retained by default; the exception is Covered Models, which require 30-day retention" — [API and data retention](https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention). The privacy center still says 30-day deletion. A third-party tracker also notes the mismatch — [developersdigest](https://www.developersdigest.tech/models/data-retention/anthropic). A claim that retention dropped to 7 days in September 2025 appears only on third-party blogs (for example [anarlog](https://anarlog.so/blog/anthropic-data-retention-policy)) and is not supported by Anthropic's pages.
- **Covered Models.** Claude Fable 5, 5.1 and 5.2 and Claude Mythos 5, 5.1 and 5.2 "require 30-day data retention and are not available under ZDR unless expressly authorized by Anthropic." This applies "wherever Covered Models are offered", including on Bedrock, where "retained data stays within your cloud provider's environment" — [API and data retention](https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention); [Covered models support article](https://support.claude.com/en/articles/15425996-data-retention-practices-for-covered-models). The app's default models (Haiku 5.5, Sonnet 5.5) are not on this list.
- **How ZDR works.**
  - Under ZDR, "Anthropic does not store customer prompts or responses at rest after the API response is returned."
  - To get it, "contact the Anthropic sales team". It is enabled per organization by the account team.
  - It covers the Messages and Token Counting APIs for eligible features.
  - ZDR organizations cannot call the API from a browser (CORS is rejected).

  Source: [API and data retention](https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention).
- **Feature eligibility under ZDR.**
  - Prompt caching is eligible (the KV cache is held in memory only for the cache TTL).
  - Structured outputs are "Yes (qualified)": the JSON schema is cached for up to 24 hours.
  - PDF support inline is eligible.
  - `inference_geo` data residency is eligible.
  - Batch processing is not eligible (29-day retention), and neither are the Files API and code execution.
  - Claude Console and playground use is never covered.

  Source: [API and data retention: feature eligibility table](https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention).

### Inferences
- The firm uses no Batch or Files API, and its default models are not Covered Models, so its traffic would be ZDR-eligible if it signs a ZDR arrangement. One exception is still open: I did not confirm ZDR eligibility for the server-side `fallbacks` beta the app sends. It should be raised with Anthropic or turned off (`ASK_VCFO_REFUSAL_FALLBACK=false`) under ZDR.
- Without ZDR, the safe working assumption is up to 30 days of retention at Anthropic in the US, plus up to 2 years for any flagged content.

### Gaps
- The exact date the docs began saying "not retained by default" is unknown. Both statements are live on 10 November 2026.
- No public ZDR price or minimum spend was found; it depends on the sales contract.
- The server-side fallback feature was not seen in the ZDR eligibility rows I read.

## 3. Anthropic Data Processing Addendum, sub-processors, residency and certifications

### Takeaway
The Data Processing Addendum (DPA, effective 24 February 2025) makes the firm the controller and Anthropic the processor. It is incorporated by reference into the Commercial Terms. Its transfer mechanisms cover only the EU, UK and Swiss transfer rules, it requires breach notice within 48 hours, and it does not mention India or DPDP. Anthropic's first-party data residency (`inference_geo`) offers only "global" and "us". There is no India option on the Anthropic API; India in-country processing exists only through Bedrock. Anthropic holds SOC 2 Type I and II and ISO/IEC 42001:2023, and very probably ISO 27001:2022.

### Cited Findings
- **DPA terms.** The DPA has been effective since 24 February 2025 — [Anthropic DPA](https://www.anthropic.com/legal/data-processing-addendum). Its main provisions:
  - "Customer is the controller and Anthropic is Customer's processor" (B.1).
  - Transfer mechanisms: the EU Standard Contractual Clauses (Modules 2 and 3, under Irish law), plus the UK Addendum and the Swiss Addendum. No other country mechanism is included.
  - Sub-processors: the list is at anthropic.com/subprocessors, which redirects to [trust.anthropic.com/subprocessors](https://trust.anthropic.com/subprocessors). Anthropic gives "reasonable notice" before adding one (no number of days is set), and the customer may object within 15 days (C.3).
  - Security breach notice "without undue delay, but in any event within 48 hours" (G.1).
  - Return and deletion of data within 30 days after the contract ends (H.1).
  - Annual external audits, with SOC 2 reports on request. Customer audits are limited to one per 12 months unless a regulator requires one (F.1-F.3).
  - The DPA prevails over the Agreement where they conflict. There is no mention of India or DPDP.
- **How the DPA is incorporated.** The Commercial Terms incorporate the DPA "by reference", so it applies without a separate signature; the page does not say "automatically" in those words — [Commercial Terms](https://www.anthropic.com/legal/commercial-terms); [DPA preamble](https://www.anthropic.com/legal/data-processing-addendum).
- **Residency on the Anthropic API.** `inference_geo` takes `"global"` (the default: "may run in any available geography") or `"us"`. "us" is the only workspace geo. No India geography is documented — [Data residency](https://platform.claude.com/docs/en/build-with-claude/data-residency).
- **Who is the processor.** The data retention docs say Anthropic is the data processor for the Claude API, for Claude Platform on AWS and for Claude in Microsoft Foundry. "On … Amazon Bedrock, the cloud provider is the data processor" — [API and data retention](https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention).
- **Certifications.** Anthropic's English support page lists ISO/IEC 42001:2023 and SOC 2 Type I and Type II, and points to the Trust Portal for documents — [What certifications has Anthropic obtained](https://support.anthropic.com/en/articles/10015870-what-certifications-has-anthropic-obtained). The localized versions also list ISO 27001:2022 — [German version](https://support.anthropic.com/de/articles/10015870-welche-zertifizierungen-hat-anthropic-erhalten). There is also HIPAA readiness with a self-serve BAA in the Console — [API and data retention](https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention).
- **India operations.** Anthropic has an India managing director (Irina Ghose), opened an India office in February 2026 and committed in August 2026 to "bringing Claude inference to India". That commitment was delivered through Bedrock, not the first-party API — [CRN Asia](https://www.crnasia.com/india/news/2026/anthropic-takes-claude-inference-live-in-india-opens-path-to-regulated-ai-deployments).

### Inferences
- An Indian firm's transfer of client data to Anthropic PBC in the US relies on DPDP section 16, which allows transfers abroad unless the government restricts a country. It does not rely on any DPA transfer clause, because the SCCs cover only EU, UK and Swiss data.
- The 48-hour breach notice is long enough for the firm to report to the Data Protection Board "without delay" under the DPDP Rules (published 13 November 2025, phased commencement), but the firm should write its own escalation plan for this.

### Gaps
- I could not render the sub-processor list (the trust portal page did not load).
- I found no Anthropic public statement on DPDP Act compliance.
- I could not access the full ISO 27001 certificate or the SOC 2 Type II report; they require a Trust Center request.

## 4. Amazon Bedrock: who sees the data, training, retention, and Claude in ap-south-1

### Takeaway
On Bedrock, AWS is the processor:
- Anthropic has no access to prompts or completions.
- Nothing is used for training.
- For non-Covered models, nothing is stored by default.
- The account's retention mode can be set to `none` and enforced with a service control policy (SCP).

For India, AWS launched an **India geographic cross-Region inference profile** on 29 September 2026. It keeps inference within ap-south-1 (Mumbai) and ap-south-2 (Hyderabad), but only for Claude Opus 5, Sonnet 5 and Haiku 4.5, and with `in.` model ids. Anthropic's Mantle-endpoint region table, which the firm's SDK uses, lists **Global only** for ap-south-1 and ap-south-2. A Global call can be processed in any commercial region outside India.

### Cited Findings
- **No provider access.** "Model providers don't have any access to those accounts … they don't have access to Amazon Bedrock logs or to customer prompts and completions" — [Bedrock data protection](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html). Anthropic's own docs say: "Anthropic personnel have no access to the inference infrastructure" — [Claude in Amazon Bedrock](https://platform.claude.com/docs/build-with-claude/claude-in-amazon-bedrock).
- **Retention modes.** The modes are `none` (zero retention; nothing written to durable storage or shared with the provider), `default`, `aws_review` (AWS staff do human review inside AWS) and legacy `provider_data_share` (which is not exercised). They are set per Region, at account or project level. An SCP using the `bedrock-mantle:DataRetentionMode` condition can force `none` across the organization. There is no console UI yet; the setting is made through the API — [Bedrock data retention](https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html).
- **Which models need retention.** Only Claude Fable 5, 5.1 and 5.2 require `aws_review`: up to 30 days of retention inside AWS, with possible human review by AWS. A model such as Opus 4.8 allows `none` and is "not retained whatever mode you set". "There is no data retention change to Claude models released before Claude Fable 5" — [Bedrock data retention](https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html). Anthropic's list of Covered Models also includes Mythos — [API and data retention](https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention).
- **The India geographic profile.** AWS announced on 29 September 2026: "requests route only between ap-south-1 and ap-south-2". The profile "keeps inference within India". Prompts and outputs "might move between those two Regions", data is not stored in the destination Region, and CloudWatch and CloudTrail logs stay in the source Region. The models are Claude Opus 5, Sonnet 5 and Haiku 4.5, with ids such as `in.anthropic.claude-opus-5`, `in.anthropic.claude-sonnet-5` and `in.anthropic.claude-haiku-4-5-20251001-v1:0`. The post does not mention DPDP — [AWS ML blog: Amazon Bedrock expands Claude model availability to India](https://aws.amazon.com/blogs/machine-learning/amazon-bedrock-expands-claude-model-availability-to-india-cross-region-inference/). Before this, India access was through **Global** cross-Region inference only, which can route to any commercial Region — [AWS ML blog: Global CRIS for India](https://aws.amazon.com/blogs/machine-learning/access-anthropic-claude-models-in-india-on-amazon-bedrock-with-global-cross-region-inference).
- **The Mantle region table.** Anthropic's Bedrock (Mantle, `/anthropic/v1/messages`) region table lists `ap-south-1` Mumbai and `ap-south-2` Hyderabad as "Global" only. The geographic profiles named there are US, EU, JP and AU, and "In-region only" appears for Tokyo, Melbourne, Stockholm, Ireland and the US regions, not for India. Regional endpoints carry a 10 percent price premium. Haiku 5.5 and Sonnet 5.5 have ids `anthropic.claude-haiku-5-5` and `anthropic.claude-sonnet-5-5`, and access to them is gated. The server-side `fallbacks` parameter is not supported on Bedrock — [Claude in Amazon Bedrock](https://platform.claude.com/docs/build-with-claude/claude-in-amazon-bedrock).
- **Where retained data sits under cross-region inference.** When cross-region inference is enabled for a model that requires retention, the retained inputs and outputs are stored in the destination Region — [Bedrock data retention](https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html). The India blog's statement that data is not stored in the destination Region applies to the non-retention case.
- **AWS contracting in India.** The AISPL Customer Agreement page (last updated 4 November 2022) sends Indian-address customers to the AWS Customer Agreement — [AISPL agreement](https://aws.amazon.com/aispl/agreement). Clauses for Amazon Web Services India Pvt Ltd as contracting party cover tax, governing law and venue — [AWS contracting party](https://aws.amazon.com/legal/aws-contracting-party/). Anthropic model terms on Bedrock are at [AWS third-party model terms](https://aws.amazon.com/legal/bedrock/third-party-models/).
- **AWS on DPDP.** AWS's India compliance page says only that DPDP "should also be considered" — [AWS Compliance Center: India](https://aws.amazon.com/financial-services/security-compliance/compliance-center/in). A third-party monitor says India-specific provisions were removed from the AWS Customer Agreement on 19 May 2026. I could not verify this — [conductatlas](https://conductatlas.com/change/2026-05-19-aws-aws-customer-agreement-2186/).

### Inferences
- **Code changes needed for in-India processing on Bedrock.** Ask VCFO would need to:
  - (a) use an India-profile model id (`in.anthropic.*`);
  - (b) use a model the India profile supports (Haiku 4.5, Sonnet 5 or Opus 5, not today's defaults Haiku 5.5 and Sonnet 5.5);
  - (c) probably use the bedrock-runtime path (InvokeModel or Converse, the "Opus 4.6 and earlier" style), or confirm that Mantle accepts `in.` ids, because Anthropic's Mantle table does not list an IN profile.

  This conflict between the AWS blog and Anthropic's Mantle table should be checked in the Mumbai console before relying on either.
- On Bedrock, setting the data retention mode to `none` in ap-south-1 (and ap-south-2), with an SCP to enforce it, gives contractual and technical zero retention without a sales negotiation, as long as no Fable or Mythos model is used.
- Bedrock removes Anthropic from the data path. The firm then deals with one processor, AWS (through AISPL or AWS), under the AWS DPA, which is part of the AWS Service Terms or Customer Agreement.

### Gaps
- I did not fetch the AWS DPA text itself (breach timing, sub-processors).
- I did not confirm the AWS certification list for Bedrock in ap-south-1. Bedrock is generally in scope of AWS SOC and ISO reports through AWS Artifact, but I did not verify that in this session.
- The Bedrock regional availability table for Claude Haiku 5.5 and Sonnet 5.5 in ap-south-1 through the IN profile was not confirmed; only Opus 5, Sonnet 5 and Haiku 4.5 are documented.
- I found no Bedrock "abuse detection" retention period for `default` mode models. That page was not fetched.

## 5. Usage Policy limits for legal, financial and professional services, and what the firm must sign or configure

### Takeaway
Anthropic's Usage Policy treats personalised legal advice, tax advice for an individual and credit or eligibility decisions as **high-risk**. These need meaningful review by a qualified person before the output reaches the individual or is acted on, and the affected person must be told that AI was used. The current Usage Policy text shows an effective date of **12 November 2026**, two days after this review, so it is a fresh revision.

### Cited Findings
- **High-risk use cases.** "A qualified person must meaningfully review a High-risk AI Recommendation" before it reaches the individual or is used. Affected individuals must be told that AI was involved. High-risk covers:
  - personalised investment advice;
  - advice on an individual's own taxes;
  - legal advice on rights, obligations or liability;
  - credit and loan decisions;
  - eligibility for benefits.

  General educational information is excluded. The policy also prohibits misusing or accessing private information without permission, and compiling profiles from multiple sources. Effective date shown: 12 November 2026 — [Anthropic Usage Policy](https://www.anthropic.com/legal/aup).
- **Customer responsibility.** The customer decides whether outputs suit its use case, including whether human review is needed. Factual assertions "should not be relied upon without independently checking their accuracy" — [Commercial Terms D.3](https://www.anthropic.com/legal/commercial-terms).
- **Usage Policy enforcement retention.** Flagged content is retained for up to 2 years (section 2) — [privacy center](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-commercial-api-data).

### Inferences
- Ask VCFO answers to clients about their own compliance or tax position, and any Do or Assist action that prepares an MCA filing, probably count as high-risk. They should keep a CA/CS review step (the app already gates the Assist handoff behind `ASK_ASSIST_HANDOFF_ENABLED`, off "until the written CS opinion exists") and carry an AI-involvement disclosure in the client portal.
- The resolver (form-label matching) is not a high-risk recommendation.
- **What the firm must sign or configure on the Anthropic API:**
  1. Accept the Commercial Terms, which bring in the DPA by reference.
  2. Request ZDR through sales if zero retention is wanted.
  3. Optionally set `inference_geo: "us"`; there is no India option.
  4. Turn off server-side fallback, or confirm with Anthropic that it is ZDR-eligible.
  5. Request the SOC 2 Type II report and ISO certificates from trust.anthropic.com.
- **What the firm must sign or configure on Bedrock:**
  1. Have the AWS or AISPL Customer Agreement and AWS DPA in place, and accept the Anthropic model terms on Bedrock.
  2. Enable model access.
  3. Set the data retention mode to `none` in ap-south-1 and ap-south-2, and enforce it with an SCP.
  4. Use `in.` India-profile model ids and models the profile supports.
  5. Set `ASK_VCFO_LLM_PROVIDER=bedrock` and `ASK_VCFO_BEDROCK_REGION=ap-south-1`, and give the App Runner role permission to call `bedrock-mantle:CreateInference` or `bedrock:InvokeModel`.

### Gaps
- The previous version of the Usage Policy and the exact changes in the 12 November 2026 revision were not compared.
- I found no Anthropic or AWS statement aimed specifically at Indian CA/CS firms or ICAI or ICSI confidentiality rules.
