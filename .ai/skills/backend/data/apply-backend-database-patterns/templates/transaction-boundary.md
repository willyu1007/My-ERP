# Template: Transaction boundary checklist

Use this checklist when deciding whether to wrap a workflow in a transaction.

- [ ] Multiple writes must succeed or fail together.
- [ ] Reads must be consistent with writes in the same operation.
- [ ] The workflow does not call external network dependencies inside the transaction (or the design explicitly tolerates it).
- [ ] The transaction scope is small (minimal I/O, minimal time).
