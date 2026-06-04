# Stage A — Integration Decision (Temporary Workdir)

> This file MUST remain in the temporary agent-builder workdir and MUST NOT be committed to the repo.

This document is the **explicit user approval checkpoint** for embedding the generated agent into a real production workflow.

## 1) Embedding point (MUST be explicit)

- Integration target kind:
- Integration target name:
- Concrete embedding point (file/function/route/job/step):
- Primary embedding: API (HTTP)
- Attach types enabled:
  - worker:
  - sdk:
  - cron:
  - pipeline:

## 2) Invocation semantics

### HTTP
- base_path:
- run route (fixed name: run):
- health route (fixed name: health):
- auth kind:
- degradation mode:

### Worker (if enabled)
- source kind + name:
- retry/backoff + idempotency:
- dead-letter / replay strategy:

### Cron (if enabled)
- schedule:
- input:
- output:

### Pipeline (if enabled)
- context:
- input/output channels:

### SDK (if enabled)
- language + package name:
- exported API name(s):

## 3) Failure contract (no suppression allowed)

- mode: propagate_error / return_fallback / enqueue_retry
- how errors are surfaced to upstream:
- rollback/disable method:
- kill switch env var: AGENT_ENABLED (required)

## 4) Data flow and compliance

- data classification:
- what is sent to LLM:
- storage/retention:
- redaction:

## 5) Approval

I confirm the above embedding and operational choices are correct and should be encoded into the blueprint.

- Approved by:
- Date:

