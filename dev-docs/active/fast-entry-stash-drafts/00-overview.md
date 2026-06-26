# Fast Entry Stash Drafts

## Status

done

Implementation is complete and verified in code. Applying the generated DB migration to a target database remains a deployment step that requires explicit approval.

## Problem

The fast-entry draft action previously used wording that implied a normal draft save, but the implementation behaved like "save a valid unsubmitted voucher": it required a header summary and complete line/account/amount validation before saving. That did not match the user workflow for quick voucher creation, where users often need to temporarily store partial work and complete it later.

## Goal

Make fast-entry "暂存" user-friendly:

- Allow incomplete quick-entry content to be stashed.
- Preserve partial form content when reopening a draft.
- Keep "提交" strict: complete summary, valid lines, and 借贷必平 remain required before entering review.
- Keep v1 accounting safety boundaries: draft has no accounting effect; non-draft vouchers remain balance-checked.

## Non-Goals

- Do not change posting/review/SoD behavior.
- Do not allow incomplete vouchers to become pending or posted.
- Do not replace the voucher state machine.
- Do not build auto-save in this iteration.

## Acceptance Criteria

- The old draft-save action is renamed to "暂存".
- 暂存 is enabled when the form contains any meaningful draft content and no filled amount has an invalid format.
- 暂存 can preserve rows without selected accounts or amounts.
- Reopening a draft restores the quick-entry form draft content.
- 提交 still rejects incomplete or unbalanced vouchers.
- Typecheck and targeted smoke verification pass.

## Completion Notes

- `draftPayload` is cleared when a voucher leaves `draft` for `pending`.
- Server-side parsing now sanitizes the v1 draft payload shape instead of accepting arbitrary JSON.
- Targeted tests cover draft payload parsing and DB-level clearing on status transition.
