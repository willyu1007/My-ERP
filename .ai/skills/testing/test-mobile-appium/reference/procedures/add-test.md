# Procedure: Add a new Appium test

**Base (references):** `.ai/skills/testing/test-mobile-appium/reference/`

## Goal
Add an Appium test that is:
- stable (accessibility id selectors + explicit waits)
- isolated and reproducible
- triage-friendly (screenshots/logs on failure)

## Inputs (collect before edits)
- User journey to automate
- Key assertions that prove success
- Required test data and how it is prepared
- Platform differences (Android vs iOS UI variations)

## Steps
1) **Place the spec correctly**
   - Under `tests/mobile/appium/specs/` (or repo’s chosen layout).
   - Keep the test scoped to one journey.

2) **Use stable selectors**
   - Prefer accessibility id selectors (and ensure app developers expose them).
   - Avoid XPath and class chains unless there is no alternative.

3) **Use explicit waits**
   - Wait for element existence/visibility/clickability with bounded timeouts.
   - Avoid unconditional sleeps.

4) **Handle platform differences deliberately**
   - Use small abstraction helpers:
     - `selectors.android.*` vs `selectors.ios.*`
   - Keep differences minimal and documented.

5) **Make data deterministic**
   - Unique entity naming for created content.
   - Clean up in shared environments when permitted.

6) **Capture diagnostics on failure**
   - On assertion failure:
     - screenshot
     - relevant page source (if feasible)
     - device logs snippet

## Outputs
- New spec under `tests/mobile/appium/specs/`
- Any helper utilities under `tests/mobile/appium/utils/`

## Required verification
- Run the single spec on one device config.
- Re-run at least once to confirm determinism.

## Boundaries
- Do not loosen assertions excessively to avoid failures.
- Do not build tests that require manual setup steps.

## Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|----------------|----------|
| Element not found | Wrong selector or not visible | Use Appium Inspector to verify selector |
| Stale element reference | Page changed after find | Re-find element before interaction |
| Click does nothing | Element not clickable | Wait for clickable, check not covered |
| Different behavior iOS vs Android | Platform-specific UI | Use platform-specific selectors |

### Common Issues

**1. Accessibility ID not working**
- iOS: Ensure `accessibilityIdentifier` is set in code
- Android: Check `content-desc` attribute exists
- Use Appium Inspector to verify attribute names

**2. Scroll not finding element**
- Use platform-specific scroll: UiScrollable (Android) vs swipe (iOS)
- Set scroll timeout/attempts limits

**3. Keyboard issues**
- Keyboard may cover elements
- Hide keyboard: `driver.hideKeyboard()`
- Or tap outside keyboard area
