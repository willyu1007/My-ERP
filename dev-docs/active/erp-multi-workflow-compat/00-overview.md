# 00 — Overview: ERP multi-workflow compatibility

## Problem statement
The T-003 task kernel is designed to be module-agnostic, but every consumer so far is finance (voucher
review/confirm). **R4 of T-003** asks for proof that a *non-finance* module can register a workflow on the
kernel without finance-specific hacks leaking into platform code — plus module-isolation checks and a web
navigation pattern for multiple modules / workstreams. Spun out as its own task at the 2026-06-17 split.

## Status
- State: done
- Closed 2026-06-18 at **isolation-verified scope**. R4's durable, buildable-now core is delivered: the
  WorkItem task kernel is **proven module-agnostic** — `packages/db/src/work-item-kernel-generic.integration.test`
  registers + claims a non-finance (`procurement`) work item through the same generic repos, asserting the
  kernel stores the module's own `moduleKey/workItemType/sourceType` verbatim with **no finance vocabulary in
  the kernel** (finance specifics live in `apps/api` adapters — `voucher-workflow.ts`/`payment-workflow.ts` —
  never in `packages/*` kernel code). That test is also the worked **registration example** R4 asked for.
- **Deferred until a real second module exists** (building them now would overfit — the stated T-003 risk):
  a concrete non-finance ERP module and the **multi-module / multi-workstream nav**. When a real module
  arrives, spin a fresh task that consumes this verified kernel.

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
