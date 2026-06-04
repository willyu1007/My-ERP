# Procedure: Add a new Detox E2E test

**Base (references):** `.ai/skills/testing/test-mobile-detox/reference/`

## Goal
Add a Detox test that is:
- deterministic and isolated
- readable and maintainable
- based on stable selectors (`testID` / accessibility id)

## Inputs (collect before edits)
- User journey (happy path + key assertions)
- Platforms affected (iOS/Android)
- Required test data and how to prepare the data
- Auth strategy (test user vs bypass)

## Steps
1) **Place the test correctly**
   - Add to `e2e/tests/` (or repo’s Detox test folder).
   - Name the test by feature/journey.
   - Keep the test scoped.

2) **Use stable identifiers**
   - Ensure the RN components have `testID`:
     - buttons, inputs, and key page markers
   - Avoid relying on visible text if localization/dynamic content exists.

3) **Write clear arrange/act/assert**
   - Arrange:
     - launch app in a known state (clean launch)
   - Act:
     - perform a small number of user actions
   - Assert:
     - verify key state changes with stable elements

4) **Avoid fixed sleeps**
   - Prefer Detox’s synchronization.
   - When waiting is required:
     - use explicit waits/expectations with bounded timeouts.

5) **Keep data deterministic**
   - Use a dedicated test tenant or seed path.
   - Generate unique entity names when creating data.

6) **Add targeted diagnostics**
   - Log only non-sensitive identifiers.
   - If a flow is complex, add intermediate assertions to isolate where the flow fails.

## Outputs
- New Detox test under `e2e/`
- Any required helper under `e2e/helpers/`
- Any required app changes (adding `testID`) tracked as part of the same PR

## Required verification
- Run only the new test file if supported by your runner:
  - `npx detox test -c <config> --testNamePattern "<pattern>"` (exact flags depend on runner setup)
- Then run the suite:
  - `npx detox test -c <config>`
- Confirm artifacts on failure land in `artifacts/detox/`

## Boundaries
- Do not weaken assertions to reduce failures.
- Do not make tests depend on the order of execution.
- Do not include secrets in test logs.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Element not found by testID | testID not set or wrong | Verify testID in component, check accessibility |
| Tap does nothing | Element not tappable or covered | Check element is enabled and visible |
| waitFor times out | Element never appears | Add intermediate checks, verify app state |
| Test passes locally, fails CI | Environment or timing difference | Match CI config locally, add explicit waits |

### Common Issues

**1. testID not working on Android**
- Ensure `accessible={true}` is set on the component
- Use `accessibilityLabel` as fallback if testID not supported

**2. Keyboard covers input**
- Dismiss keyboard after typing: `await element(by.id('input')).tapReturnKey()`
- Or scroll to element before interacting

**3. Animation causes flakiness**
- Disable animations in app for test builds
- Or wait for animation: `await waitFor(element).toBeVisible().withTimeout(5000)`
