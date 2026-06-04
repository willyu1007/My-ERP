# Procedure: Run Maestro flows (local/CI)

**Base (references):** `.ai/skills/testing/test-mobile-maestro/reference/`

## Goal
Run Maestro flows with:
- explicit device/app readiness
- reproducible commands
- artifacts collected for CI triage

## Inputs (collect before edits)
- Which flow(s) to run (smoke vs regression)
- Which device target (simulator/emulator/device farm)
- How app build is installed prior to running tests
- Any required env vars (auth, tenant)

## Steps
1) **Ensure device and app are ready**
   - Emulator/simulator running (or device connected).
   - App build installed.
   - If CI uses a clean environment, ensure install happens in the job.

2) **Run the smallest scope first**
   - Single flow:
     - `maestro test tests/mobile/maestro/flows/<flow>.yaml`
   - Folder (if your Maestro version supports it) or via shell:
     - run each flow file explicitly

3) **Inject environment variables**
   - Inject secrets via CI secrets / env vars.
   - Avoid printing secrets.

4) **Collect artifacts**
   - Ensure CI always uploads:
     - `artifacts/maestro/`
   - If Maestro produces artifacts elsewhere, copy them into `artifacts/maestro/` at the end of the job.

5) **Fail fast on infra**
   - If device/app install fails, stop and classify as infra (not a functional failure).

## Outputs
- Maestro execution logs
- Artifact directory: `artifacts/maestro/`

## Required verification
- Run the smoke flow:
  - `maestro test tests/mobile/maestro/flows/smoke.yaml`
- Confirm CI job fails correctly on assertion failures and uploads artifacts.

## Boundaries
- Do not run destructive flows in PR pipelines unless gated.
- Do not attempt to "fix" failures by disabling assertions.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Flow times out | Element never visible or app stuck | Add assertVisible for intermediate states |
| Works locally, fails CI | Different device/OS or app version | Match CI device configuration locally |
| Env var not substituted | Wrong syntax or not exported | Use `${VAR_NAME}` syntax, export vars |
| Artifacts not generated | Wrong path or Maestro version | Check output path, update Maestro |

### Common Issues

**1. CI device not ready**
- Add explicit wait for device boot
- For Android: `adb wait-for-device`
- For iOS: poll simulator state before running

**2. App crashes during flow**
- Check device/Maestro logs for crash reason
- May be memory issue or app bug
- Try with fresh app install: `clearState: true`

**3. Multiple devices confusion**
- Maestro picks first available device
- Use `--device` flag to specify: `maestro test --device <id> flow.yaml`
