# Convex SSOT Mechanism

## Source of truth

Convex mode defines two primary source files:

1. the configured schema source (default: `convex/schema.ts`) for the persistent data model
2. the sibling Convex source directory (default: `convex/**/*.ts`) for the callable backend function surface

These are transformed into two LLM-friendly contracts:

- `docs/context/db/schema.json`
- `docs/context/convex/functions.json`

## Transformation path

### 1. Schema contract

The configured Convex schema source is parsed into a normalized JSON structure that records:

- tables
- fields
- validator-derived types
- relation hints from `v.id("table")`
- indexes
- search indexes
- vector indexes
- Convex system fields such as `_id` and `_creationTime`

### 2. Function contract

The configured Convex source directory is scanned for exported Convex functions:

- `query`
- `mutation`
- `action`
- `httpAction`
- `internalQuery`
- `internalMutation`
- `internalAction`

For each function the generated contract records:

- file path
- module path
- export name
- function kind
- visibility
- runtime hint
- argument validator summary
- return validator summary
- basic auth signal
- lightweight usage hints such as DB reads/writes, fetch, scheduler, and internal calls

## Why two contracts

The database contract answers:

- what is stored
- which fields exist
- where references point
- which indexes support reads

The function contract answers:

- which backend entrypoints exist
- how they are called
- whether they are public or internal
- what auth and runtime shape they appear to use

An LLM typically needs both.
