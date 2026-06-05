# Codegen Outputs (`ui-specctl`)

## Purpose
This directory is generated from the UI contract by `ui-specctl`. Treat it as build output.

## Key files
- `contract-types.ts`: type unions for `data-ui` roles and role attribute values
- `tokens.d.ts` (optional): token key unions for UI tokens

## Rules (MUST)
- DO NOT hand-edit generated files.
- If the contract or tokens change, re-run codegen (source of truth: `ui/contract/`, `ui/tokens/`).

## Verification
- Re-run `ui-specctl` and confirm generated files match the current contract.
