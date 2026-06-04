# Debug Mode — Intake Checklist

## Purpose
Prevent “debugging the wrong problem” by locking down a minimal but sufficient problem statement.

## Required inputs (ask once)
1) **Expected vs actual**
   - What did you expect to happen?
   - What actually happened?
   - What would count as “fixed”?

2) **Reproduction steps**
   - Exact commands (preferred) OR UI path (tap/click sequence)
   - Test data / account state
   - Any toggles / feature flags / configuration

3) **Frequency**
   - Always / intermittent / flaky (% if known)
   - Any timing sensitivity (e.g., “only after 10–30 seconds”, “only on slow network”)

4) **Environment**
   - OS + version
   - App/runtime version(s)
   - Build mode: dev/prod, debug/release, simulator/device
   - Device model (mobile) or browser version (web)
   - Recent changes: PR, deploy, dependency upgrade, config change

5) **Existing evidence**
   - stack traces
   - crash reports
   - current logs
   - screenshots/recording (UI)

## Output requirement (after Intake)
Restate:
- the issue,
- success criteria,
- the shortest known reproduction recipe,
- the environment matrix (what is confirmed vs unknown).

If the reproduction is unclear, propose a minimal experiment to clarify it before instrumenting.
