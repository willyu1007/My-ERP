# 05 - Pitfalls

## Do-not-repeat summary
- Do not model accounting daily work as one hard-coded linear pipeline.
- Do not let platform task concepts depend on voucher/accounting-specific fields.
- Do not make task state the accounting source of truth.
- Do not send financial details to My-Chat notification or approval surfaces.
- Do not add schema/API changes before roadmap decisions are confirmed.

## Append-only log

### 2026-06-12 - Initial planning guardrails
- Symptom: The product goal uses "pipeline", but repo constraints require role-based workflows.
- Root cause: User-facing workflow language can be mistaken for a single hard-coded runtime pipeline.
- What was tried: Repository docs and current implementation were reviewed before creating the task package.
- Fix/workaround: The roadmap uses "pipeline-like UX" over a reusable task/workflow kernel.
- Prevention: Re-check DP26 and root `AGENTS.md` before implementation work.
