# Example — React Native / Expo (Expo Go)

## When to use the example
Use the example when the user mentions:
- React Native
- Expo / Expo Go
- Metro bundler
- EAS builds
- iOS simulator / Android emulator issues

Example guide only. Prefer the project's own README/scripts when available.

## Where to look for logs

### 1) Metro bundler / dev server console
- The terminal running the dev server (often `npm start`, `yarn start`, or `npx expo start`) typically shows:
  - JavaScript stack traces
  - bundling errors
  - some runtime logs
- If this terminal is IDE-integrated, prefer auto-collection (reply `DONE` after repro; see `examples/ide-terminal-hook.md`).

If the project has a custom script, use that rather than guessing the command.

### 2) Expo DevTools / in-app log viewer
Depending on the setup, runtime logs may be visible in:
- a browser-based dev tools UI
- an in-app developer menu log viewer

Ask the user:
- which command they used to start the app,
- whether they are running in Expo Go vs a custom dev client,
- whether logs are visible in the terminal or on-device.

### 3) Device logs (when JS logs are insufficient)
Some crashes or native-layer issues require device logs:
- **Android:** `adb logcat` (see `android-logcat.md`)
- **iOS:** Xcode console / device logs (see `ios-xcode-console.md`)

## Recommended instrumentation style
- Prefer existing logging helpers (e.g., `console.*`, a project logger, or a wrapper).
- For debug-mode logs:
  - wrap any debug-only changes with `DEBUG-MODE: BEGIN/END <run_id>`
  - include `[DBG:<run_id>]` in every log line
- For async/lifecycle issues, log:
  - screen/component lifecycle transitions,
  - key async boundaries (request start/end),
  - state transitions (before/after setState, reducers, stores).

## Reproduction guidance (mobile-specific)
Ask for:
- device model and OS version
- app version/build (especially if using EAS)
- network conditions (Wi‑Fi vs cellular; slow network)
- whether the issue reproduces on simulator/emulator vs real device
- whether it reproduces in release builds (debug and release can differ)

## What to request back from the user
- logs filtered by `[DBG:<run_id>]` from:
  - Metro terminal, and/or
  - device logs (adb/Xcode)
- a short screen recording if it is UI/timing related
- confirmation of build mode (dev/prod; debug/release)
