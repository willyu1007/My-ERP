# Stage A — Interview Notes (Temporary Workdir)

> This file MUST remain in the temporary agent-builder workdir and MUST NOT be committed to the repo.

## Agent identity
- Proposed `agent.id`:
- Proposed `agent.name`:
- Summary (1–3 sentences):

## Problem framing (Decision Checklist #1)
- Goal / user value:
- In-scope:
- Out-of-scope:
- Definition of Done (DoD):

## Embedding + integration (Decision Checklist #2)
- Primary embedding: API (HTTP)
- Attach types requested: worker / sdk / cron / pipeline (pick explicitly)
- Integration target (where this agent is embedded in production):
  - kind (service/repo_module/pipeline_step/queue/...):
  - name:
  - concrete embedding point (file/function/route/job/step):
- Trigger kind (sync_request/async_event/scheduled/manual/batch):

## Output + interaction (Decision Checklist #6)
For each interface (http/worker/sdk/cron/pipeline):
- response_mode: blocking / streaming / async
- intermediate output exposure: none / progress / debug
- If UI involved:
  - UI contract notes (fields, validations, callbacks)
- Streaming protocol for HTTP:
  - default: websocket
  - required event contract: `schemas.RunEvent`

## Conversation + state (Decision Checklist #5)
Decide the conversation/memory mode:
- mode: no-need | buffer | buffer_window | summary | summary_buffer
- scope: per_request | per_conversation | per_user | per_tenant
- conversation_id source:
  - header name OR request field name:
- storage:
  - kind: none | in_memory | file | kv_store | database
  - location (if persisted):
- retention:
  - ttl_seconds:
  - max_items:
- redaction:
  - mode: none | basic | strict

If summary / summary_buffer:
- summary update method (default): llm
- refresh policy (default): threshold
- update timing:
  - interactive streaming default: async_post_turn
  - blocking default: after_turn
- threshold preference default: token-first
  - max_tokens_since_update:
  - max_turns_since_update:
  - cooldown_seconds:
- summary_buffer window:
  - window_tokens:
  - window_turns:

## Tools + side effects (Decision Checklist #7)
List external calls and side effects:
- Tools list (each tool):
  - id:
  - kind: http_api/database/queue/filesystem/mcp_server/internal_service/other
  - side_effect_level: read_only / write / destructive
  - timeouts / retry / idempotency:
  - auth (env vars only; no values):
  - audit requirements:
- Side effect policy:
  - read_only_only | writes_require_approval | writes_allowed
- Required approvals (if any writes/destructive):

## Model + prompting (Decision Checklist #8)
- Primary model (provider, model name, reasoning profile):
- Fallback model strategy (if required):
- Summarizer model (if using summary modes):
- Prompt complexity tier: tier1 / tier2 / tier3
- Examples strategy (how many, which branches):

## Reliability + failure handling (Decision Checklist #9)
- failure_contract.mode: propagate_error / return_fallback / enqueue_retry
- rollback_or_disable.method: feature_flag / config_toggle / route_switch / deployment_rollback
- kill switch: AGENT_ENABLED required (must exist in env vars list)
- retries/backoff/idempotency by interface (esp. worker):

## Performance + cost budgets (Decision Checklist #10)
- latency budget (p50/p95/timeout):
- throughput budget (rps/concurrency):
- token budgets:
- max cost per task:

## Data handling + compliance (Decision Checklist #11)
- data classes: PII / confidential / internal / public / unknown
- LLM egress:
  - what is sent:
  - what is redacted:
  - is egress allowed:
- retention and storage notes:

## Observability + operations (Decision Checklist #12)
- required log fields:
- correlation id field:
- metrics/tracing:
- alert thresholds:
- on-call owner:

## Acceptance scenarios (Decision Checklist Verification)
Define at least 2 E2E scenarios (recommend including failure + kill-switch):
1)
2)

## Open questions / risks
- ...

