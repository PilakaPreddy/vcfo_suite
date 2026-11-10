# VCFO Assist Agents — research references

This file lists the outside references behind `PLAN.md`, what each one says, and what the design
took from it. The summaries come from the architecture review behind `PLAN.md` (November 2026).
Products change quickly, so re-read a page before relying on a detail it does not cover here.

## Inferred, not confirmed: MCA V3 is built on Adobe AEM Forms

> **Inference.** The design assumes that MCA V3 forms are Adobe AEM Adaptive Forms. The evidence
> is indirect: the existing `vcfo_assist` `mapping.js` and `extension/schemas/*.compact.json`
> target `.guideFieldNode` elements with semantic class names (`proposedname1`,
> `type-of-company`, `din7a`), and `.guideFieldNode` is the class AEM Adaptive Forms put on each
> field. No MCA document says the portal uses AEM.
>
> **Confirm with the recorder** (`tools/mca-recorder/`) before phase 1 ends: check that the page
> defines `window.guideBridge`, that `guideBridge.resolveNode(som)` returns the field for a SOM
> path taken from the capture, and that setting a value through it runs the portal's own rules.
> If any check fails, the filler uses the native-setter and input-event fallback only, and the
> recipes drop the `som` key.

## References

| Reference | What it says | What we took | Where it lands |
|---|---|---|---|
| [Stagehand: action caching](https://docs.stagehand.dev/v4/best-practices/caching) | An AI step that finds an element can be cached; later runs replay the cached action with no model call, and fall back to the AI only when the cached action no longer matches. | Recipes are the cache: versioned actions that code replays with 0 tokens. The AI runs only on a miss. | `PLAN.md` §1 Recipes, §3 heal ladder T0 |
| [UiPath Healing Agent](https://docs.uipath.com/agents/automation-cloud/latest/user-guide-ha/what-is-healing-agent) | When a UI change breaks an automation, the agent recovers or recommends a fix. Semantic matching is a fallback, fixes are logged, and what cannot be fixed goes to a person. | The heal ladder (T1 to T4) and the recipe patch review queue: every heal is logged and a person approves a fix before every user gets it. | `PLAN.md` §3; `ROADMAP.md` phase 2 |
| [How accessibility-tree formatting affects token cost in browser MCPs](https://dev.to/kuroko1t/how-accessibility-tree-formatting-affects-token-cost-in-browser-mcps-n2a) | The way a page is serialised for a model changes the token cost a great deal; compact accessibility-tree text is far cheaper than raw DOM or screenshots. | The T3 prompt is a compact numbered list of up to 40 labels, never the DOM and never a screenshot. | `PLAN.md` §3 T3; `ROADMAP.md` tokens metric |
| [Browser Use vs Stagehand vs Skyvern](https://www.joinmassive.com/blog/browser-use-vs-stagehand-vs-skyvern-choosing-an-agent-browser-framework) | Browser Use reads the DOM and accessibility tree, Stagehand mixes code with AI steps, and Skyvern works from screenshots; vision costs roughly ten times more tokens per step. | Text, not vision. We also note that Skyvern sells captcha solving, which the legal report rates Prohibited, so none of these frameworks is a dependency. | `PLAN.md` research table; `SAFETY.md` G2 |
| [Adobe AEM Forms GuideBridge API](https://developer.adobe.com/experience-manager/reference-materials/cloud-service/jsdoc/aem-forms-cloud-service-jsdoc/GuideBridge.html) | `guideBridge` is the public JavaScript API of an Adaptive Form. `resolveNode(somExpression)` returns a field, and setting its value or calling `setProperty` updates the form's own model, so its rules and validation run. | The filler sets values through `guideBridge` in the page's main world, and falls back to native-setter input events. Recipes carry a SOM path per field. Subject to the inference above. | `PLAN.md` §1 `fields[].som`, architecture "main-world filler" |
| [Claude for Chrome](https://www.anthropic.com/news/claude-for-chrome) | Browser agents face prompt injection from page content. Anthropic's defences are site-level permissions, confirmation before high-risk actions, and treating page text as untrusted. | The deny list, action-bound confirmations (one approval covers one diff table), and page text treated as data only. The AI picks from enumerated candidates and cannot act. | `SAFETY.md` G4, G10, G13 |
| [Chrome Prompt API](https://developer.chrome.com/docs/extensions/ai/prompt-api) | Extensions can call Gemini Nano on the device through the Prompt API, at no cost, when the hardware and Chrome version support it; the extension must check availability first. | An optional T2 tier for label matching. It returns an index from the same enumerated list as T3, and the ladder skips it when the model is unavailable. | `PLAN.md` §3 T2 |
| [WXT: comparison](https://wxt.dev/guide/compare) | WXT is a Vite-based framework for Manifest V3 extensions in TypeScript, with first-class side-panel support, compared against Plasmo and CRXJS. | WXT is the build tool for the `vcfo_assist` side panel (React). | `ROADMAP.md` phase 1 |

## Internal references

| Reference | What we took |
|---|---|
| `docs/specs/mca-connect/reports/MCA SPICe filing automation options.md` | The three rules, the eight legal anchors, the verdicts and the eleven CS questions. Source of every guard in `SAFETY.md` and of Part A of `CS-QUESTIONS.md`. |
| `docs/specs/assist-profile/` | The profile contract (`profile`, `missing[]`, `notes`), the vocabulary rule, and the same-origin fetch from a Suite tab (`06-no-cors.md`). |
| `tools/mca-recorder/` | Structure-only captures of real filings, used to build recipes and the mock portal, and to confirm the AEM inference. |
| `src/lib/ask/provider/`, `config.ts`, `mask.ts` | The model provider (Anthropic or Bedrock), the Haiku model choice, the budget cap, pricing for the cost meter, and masking as a second net on resolver input. |
