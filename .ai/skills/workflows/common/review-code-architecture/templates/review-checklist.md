# Template: Architecture review checklist

## Must fix
- [ ] Incorrect auth/permission logic
- [ ] Inconsistent error mapping that breaks clients
- [ ] Unbounded queries or obvious performance hazards
- [ ] Security/privacy violations (secrets/PII exposure)

## Should fix
- [ ] Blurred boundaries (business logic in routes/components)
- [ ] Missing tests for business rules
- [ ] Excessively complex modules without decomposition

## May fix
- [ ] Minor naming/structure improvements
- [ ] Optional refactors for readability
