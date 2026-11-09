# VCFO Assist Agents

This folder specifies VCFO Assist Agents: the firm's Chrome extension turned into a team of
agents in the browser side panel. Each agent (Incorporation, Post-incorporation, Registration,
Compliance) has sub-agents for single forms, such as SPICe+ Part A or GST REG-01. An agent pulls
the client's data from VCFO Suite and fills the government portal from a fixed field map, using AI
only when the portal has changed. A person always logs in, types the captcha and OTP, signs with
their own DSC, submits and pays.

## Files

| File | What it holds | Read it when |
|---|---|---|
| `PLAN.md` | The approved architecture: recipes, run engine, heal ladder, safety by construction, side-panel UX, build plan, reuse and verification. | You start any work on the agents. |
| `SAFETY.md` | The hard guards (G1 to G15), each with its source in the legal report, the threat it stops, how the code enforces it, and its test. | You touch the filler, the engine, the resolver or the live-portal switch. |
| `CS-QUESTIONS.md` | The ready-to-send letter to the company secretary: eleven questions from the legal report plus eight on this design. | Phase 0, and when the reply arrives. |
| `ROADMAP.md` | Phases 0 to 5 with exit criteria, the run metrics, and the sub-agent backlog with each portal host. | You plan or close a phase. |
| `RESEARCH.md` | The outside references and what we took from each, and the unconfirmed AEM inference. | You question a design choice. |
| `API.md` | The contract between the extension and Suite (routes and payloads). | You build either side of a route. |

## Status

Phase 0. Live portals stay switched off until the CS opinion is recorded; until then all runs go
against the local mock.

## Related

- `docs/specs/mca-connect/reports/MCA SPICe filing automation options.md` — the legal report.
- `docs/specs/assist-profile/` — the profile the agents fill from.
- `tools/mca-recorder/` — the recorder that captures form structure.
