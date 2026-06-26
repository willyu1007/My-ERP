# Pitfalls

## Do Not Repeat

- Do not treat `draft` as an accounting source.
- Do not persist incomplete rows directly into `journal_entry_line`; it requires account-bearing accounting lines.
- Do not apply DB migrations without explicit approval.

## Resolved Issues

### UI payload could become a second source after submit

- Symptom: `draftPayload` was stored during both stash and submit, and draft→pending only changed status.
- Root cause: the status patch API did not have an explicit way to clear UI-only recovery data.
- Tried: considered hiding payload from non-draft responses only, but that would still leave stale data in storage.
- Fix/workaround: added explicit `clearDraftPayload` support to voucher status patches and used it on submit.
- Prevention: any future UI-only draft recovery field must be cleared or ignored when the domain entity leaves draft status.

### Draft payload accepted arbitrary JSON

- Symptom: API accepted any object for `draftPayload`.
- Root cause: the initial implementation relied on the frontend payload shape and did not enforce a server-side schema.
- Tried: OpenAPI described it as free-form `additionalProperties`.
- Fix/workaround: added v1 payload parsing/sanitization and tightened OpenAPI.
- Prevention: do not persist UI recovery JSON without a bounded versioned schema.

### Browser smoke blocked by local Chrome launch failure

- Symptom: Playwright launched system Chrome, then the browser process was immediately closed/killed before navigation.
- Root cause: local desktop/headless Chrome process termination outside the app code path.
- Tried: retried with `--headless=new`, `--disable-gpu`, and `--no-sandbox`.
- Fix/workaround: rely on static type verification for this turn and record that manual browser verification remains recommended.
- Prevention: if repeated, install/use Playwright-managed browsers or attach to an already-running browser debug endpoint.
