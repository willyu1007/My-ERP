# Procedure: Author a new Maestro flow

**Base (references):** `.ai/skills/testing/test-mobile-maestro/reference/`

## Goal
Create a Maestro flow that is:
- readable (short, focused, composable)
- stable (selectors + deterministic waits)
- safe for CI (no secrets, bounded timeouts)

## Inputs (collect before edits)
- The user journey to automate
- Key checkpoints (assertions) that prove success
- Required test data (seed vs create)
- Auth model and credentials strategy (secrets injection)

## Steps
1) **Scope the flow**
   - Prefer 1 journey per flow.
   - Define 1–3 key assertions (avoid over-asserting UI details).

2) **Use stable selectors**
   - Prefer accessibility ids/testIDs.
   - Use text-based matching only when text is stable and intended.

3) **Structure the flow**
   - Include:
     - `appId` (or equivalent)
     - `launchApp` / reset steps as needed
     - a small sequence of actions
     - explicit assertions for readiness and final success
   - Extract repeated sequences into `subflows/` if your repo adopts that pattern.

4) **Deterministic waiting**
   - Wait for a stable “ready” element after navigation.
   - Keep any waits bounded and condition-based.

5) **Parameterize environments**
   - Use variables for:
     - base URLs (if applicable)
     - test tenant IDs
     - test users (via injected env vars)
   - Do not store secrets in YAML.

6) **Make data deterministic**
   - Create unique entity names if creating data.
   - Clean up when possible (or use isolated tenant).

## Outputs
- New flow under `tests/mobile/maestro/flows/`
- Any reusable flow fragments under `tests/mobile/maestro/subflows/` (optional)
- Updated documentation of required testIDs/accessibility ids if app changes are needed

## Required verification
- Run the new flow locally:
  - `maestro test tests/mobile/maestro/flows/<flow>.yaml`
- Confirm it is stable across at least 2 consecutive runs.

## Boundaries
- Do not add long sleeps to hide flakiness.
- Do not include secrets in flows or logs.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Element not found by id | testID not set or wrong value | Verify ID in app code, use Maestro studio |
| Text assertion fails | Dynamic or localized text | Use regex or partial match if appropriate |
| Subflow not found | Wrong path or missing file | Check relative path from main flow |
| Flow stops without error | Implicit success (no assertions) | Add explicit `assertVisible` at end |

### Common Issues

**1. Element ID not working**
- Use Maestro Studio to inspect actual IDs: `maestro studio`
- iOS: Check `accessibilityIdentifier` is set
- Android: Check `testTag` (Compose) or `contentDescription`

**2. Keyboard covers input field**
- Add `hideKeyboard` after input
- Or scroll to element before asserting

**3. Timing issues with animations**
- Add `assertVisible` before interacting
- Use `waitForAnimationEnd` if supported
- Set `timeout` on assertions for slow transitions
