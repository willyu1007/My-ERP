# Template: Common TypeScript fix patterns

This reference lists common TypeScript compile errors and safe, minimal fix strategies.

**Principle:** prefer **root-cause** fixes (types, exports, contracts) over downstream suppression.

---

## 1) Missing exports / wrong imports

**Common errors**
- `TS2305: Module 'x' has no exported member 'Y'.`
- `TS2307: Cannot find module 'x' or its corresponding type declarations.`

**Fix patterns**
- Confirm the symbol exists and is exported from the intended module.
- If the file moved/renamed: update import paths and any barrel (`index.ts`) exports.
- If a dependency upgraded: check release notes for renamed exports.
- If the module is JS-only: add types (`@types/...`) or a local `d.ts` shim.

**Avoid**
- Adding `any` exports to “make it compile”.

---

## 2) Signature/assignment incompatibilities

**Common errors**
- `TS2322: Type 'A' is not assignable to type 'B'.`
- `TS2345: Argument of type 'A' is not assignable to parameter of type 'B'.`

**Fix patterns**
- Identify where the contract changed (interface/type alias) and update callers.
- If the contract is shared across modules, fix the shared type first.
- If the mismatch is intentional (e.g., narrower type at a boundary):
  - introduce a mapping function that converts `A -> B` explicitly.
  - add a runtime validation step if external input is involved.

**Avoid**
- `as any` to force the assignment.

---

## 3) Property does not exist / shape mismatch

**Common errors**
- `TS2339: Property 'x' does not exist on type 'Y'.`

**Fix patterns**
- Confirm the runtime shape (API response, DB row, form state).
- Update the type to match reality **only if** the runtime shape is correct.
- Otherwise, update the code to use the correct field, or map/transform the object.
- For optional fields: use optional chaining + defaults (`obj?.x ?? default`).

---

## 4) `undefined` / `null` strictness issues

**Common errors**
- `TS2532: Object is possibly 'undefined'.`
- `TS18047: 'x' is possibly 'null'.`

**Fix patterns**
- Add a guard clause before access.
- Use narrowing (`if (!x) return ...`) or early returns.
- Prefer explicit defaults rather than non-null assertions.

**Avoid**
- Using `!` (non-null assertion) unless you can prove the invariant and the invariant is local.

---

## 5) `unknown` flows

**Common errors**
- `TS18046: 'e' is of type 'unknown'.`

**Fix patterns**
- Narrow via type guards (`instanceof`, `typeof`, custom predicate).
- For error objects: normalize to a safe shape before logging/returning.

---

## 6) Generic constraint failures

**Common errors**
- `TS2344: Type 'X' does not satisfy the constraint 'Y'.`

**Fix patterns**
- Tighten or correct the generic constraint to match actual usage.
- Add explicit generic parameters at call sites when inference fails.
- Avoid widening generics to `any` just to satisfy constraints.

---

## 7) Dependency type changes after upgrade

**Fix patterns**
- Compare old vs new type definitions and migrate usage.
- Prefer adapting your code rather than pinning to old versions, unless upgrade is accidental.
- If a library changed runtime behavior, add tests around the integration points.

---

## 8) TSConfig / module resolution issues

**Fix patterns**
- Confirm `tsconfig.json` extends/paths settings are correct for the build target.
- Validate `moduleResolution` / `baseUrl` / `paths` after moving files.
- If you have multiple build targets, reproduce against the correct one.

---

## Last resort (must be justified)

- `@ts-expect-error` with a comment explaining why and linking to a tracking item.
- A narrow cast at a boundary (`as SpecificType`) *only* after runtime validation.

If you use any suppression, record the suppression in the triage worksheet and plan a follow-up cleanup.
