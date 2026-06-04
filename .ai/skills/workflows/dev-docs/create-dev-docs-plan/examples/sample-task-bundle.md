# Example: Minimal dev-docs task bundle

## Directory structure

```
dev/
  active/
    add-export-endpoint/
      00-overview.md
      01-plan.md
      02-architecture.md
      03-implementation-notes.md
      04-verification.md
      05-pitfalls.md
```

## Notes
- `00-overview.md` states goal, non-goals, and acceptance criteria.
- `01-plan.md` lists milestones and step order.
- `02-architecture.md` captures boundaries, contracts, and any migration.
- `03-implementation-notes.md` is updated as work proceeds.
- `04-verification.md` is concrete (commands/checks + expected results).
- `05-pitfalls.md` records bugs/dead ends and `do-not-repeat` notes (append-only).
