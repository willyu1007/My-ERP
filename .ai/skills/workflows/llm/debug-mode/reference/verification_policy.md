# Debug Mode — Verification Policy

## Purpose
Define what “verified fixed” means, and prevent premature closure.

## Default verification thresholds
- **Deterministic issues (always reproducible):**
  - At least **1** full pass of the reproduction steps with the expected outcome.
- **Flaky / race / timing / intermittent issues:**
  - Default: **3 consecutive passes**.
  - Rationale: one pass is not strong evidence for intermittent failures.

## User control
- The user may decide to:
  - continue attempts to reach the threshold,
  - reduce the threshold (with an explicit risk acknowledgement),
  - terminate the session at any time ("STOP").

The assistant must respect the user’s decision and provide cleanup + handoff.

## Pass/fail recording
During verification, maintain:
- attempt count,
- pass count,
- notes on environment changes between attempts,
- any residual anomalies (even if “not the original bug”).

## What counts as a pass
A pass must satisfy the Definition of Done from Intake:
- expected behavior observed,
- no new critical regressions,
- relevant logs show the corrected path (if instrumentation is still present).

## What counts as a fail
A fail is any of:
- original symptom reproduced,
- new crash or functional regression,
- evidence indicates the root cause still occurs.

On fail:
- do not “try another fix” immediately,
- return to Hypothesize/Instrument with a new run_id and a refined plan.

## Post-verification
Only after the threshold is met:
- remove all debug-only instrumentation,
- provide final summary and regression protection suggestions.
