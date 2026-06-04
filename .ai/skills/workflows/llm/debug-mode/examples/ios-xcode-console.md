# Example — iOS: Xcode Console / Device Logs

## When to use this example
Use when:
- the issue occurs on iOS,
- the app crashes or hangs,
- you suspect native-layer behavior, startup, permissions, or lifecycle issues.

## Where logs come from
Depending on the setup, logs may appear in:
- Xcode console (if running from Xcode)
- iOS device logs (if reproducing on a device)
- simulator console output

Ask the user:
- simulator vs real device,
- running from Xcode vs a dev client,
- debug vs release build.

## What to collect
Request:
- the crash/stack trace block (if any),
- a time window around the reproduction,
- app version/build, iOS version, device model.

## Filtering by debug-mode tag
Ask the user to search/filter for:
- `[DBG:<run_id>]`

## Common iOS-specific pitfalls (for hypotheses)
- background/foreground transitions
- permission prompts and lifecycle callbacks
- main-thread blocking leading to UI hangs
- network reachability changes

## Privacy note
Logs may contain device identifiers. Ask for redaction where appropriate.
