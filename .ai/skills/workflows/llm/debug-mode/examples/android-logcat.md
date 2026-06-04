# Example — Android: adb logcat

## When to use this example
Use when:
- the app crashes on Android,
- JavaScript logs are incomplete,
- the issue is native-layer, startup, permissions, or device-specific.

## Collecting logs (high level)
Typical steps:
1) Connect a device or start an emulator.
2) Reproduce the issue.
3) Capture the relevant log window and share it.

Because project setups differ, prefer the project’s documented scripts and Android tooling.

## Practical collection tips
- Ask the user to capture:
  - a small window *before* reproduction starts,
  - the reproduction moment,
  - a small window after failure.
- Ask them to include:
  - app package name (if known),
  - Android version and device model,
  - whether it’s debug or release build.

## Filtering by debug-mode tag
If the user can filter logs, instruct them to filter for:
- `[DBG:<run_id>]`

If they cannot filter easily, ask for a larger excerpt and you will locate `[DBG:<run_id>]` lines.

## Additional signals for crashes
Request:
- the exception/stack trace,
- the “FATAL EXCEPTION” block (if present),
- any ANR messages if the symptom is freezing/hanging.

## Privacy note
Device logs can contain identifiers. Ask the user to redact any sensitive content before sharing.
