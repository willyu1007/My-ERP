# 00 — Overview: ERP multi-workflow compatibility

## Problem statement
The T-003 task kernel is designed to be module-agnostic, but every consumer so far is finance (voucher
review/confirm). **R4 of T-003** asks for proof that a *non-finance* module can register a workflow on the
kernel without finance-specific hacks leaking into platform code — plus module-isolation checks and a web
navigation pattern for multiple modules / workstreams. Spun out as its own task at the 2026-06-17 split.

## Status
- State: planned
- Created 2026-06-17 from T-003 R4. Intentionally **premature** until a second real module exists — building
  a generic abstraction before the second consumer risks overfitting (a stated T-003 risk). Revisit when a
  non-finance module (or M2 cashier as a distinct workstream) makes the second consumer concrete.

## Goal
- A worked example of a non-finance module registering a workflow (e.g. a generic approval, or 采购申请) via
  the existing module/workflow/role-queue contracts — no finance vocabulary in `packages/platform` task code.
- A module-isolation check (lint/test) that fails if platform task code references finance-only concepts.
- A web nav pattern for multiple modules and multiple workstreams (today the shell nav is finance-only).

## Non-goals
- Actually implementing a full non-finance ERP module (purchase/inventory/HR) — only the registration sketch
  needed to prove isolation.
- A heavyweight BPMN runtime.

## Pointers
- Kernel + R4 scope: `dev-docs/active/workflow-task-kernel-finance-pipeline/roadmap.md`.
- Module registry / contracts: `packages/platform/`, `packages/contracts/`.
- Shell nav: `apps/web/src/lib/finance/scene-config.tsx`, `@my-erp/ui` AppShell.
