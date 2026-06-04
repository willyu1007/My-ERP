import path from "node:path";
import { listFilesRecursively, readTextIfExists, toPosixPath } from "./file-utils.mjs";

function charAt(text, i) {
  return i >= 0 && i < text.length ? text[i] : "";
}

function isWhitespace(ch) {
  return ch === " " || ch === "\n" || ch === "\r" || ch === "\t";
}

function skipWhitespace(text, start = 0) {
  let i = start;
  while (i < text.length && isWhitespace(text[i])) i += 1;
  return i;
}

function findMatching(text, openIndex, openChar, closeChar) {
  let depth = 0;
  let quote = null;
  let templateDepth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : "";

    if (quote) {
      if (quote === "`" && ch === "$" && text[i + 1] === "{") {
        templateDepth += 1;
        i += 1;
        continue;
      }
      if (ch === quote && prev !== "\\") {
        if (quote === "`" && templateDepth > 0) {
          // inside template expression handling is approximate
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 1;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }

    if (ch === openChar) {
      depth += 1;
    } else if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findMethodCalls(text, methodName) {
  const results = [];
  let index = 0;
  const needle = `.${methodName}(`;
  while (index < text.length) {
    const found = text.indexOf(needle, index);
    if (found === -1) break;
    const openParen = found + needle.length - 1;
    const closeParen = findMatching(text, openParen, "(", ")");
    if (closeParen === -1) break;
    results.push(text.slice(openParen + 1, closeParen));
    index = closeParen + 1;
  }
  return results;
}

function splitTopLevel(text, delimiter = ",") {
  const out = [];
  let start = 0;
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let quote = null;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : "";

    if (quote) {
      if (ch === quote && prev !== "\\") {
        quote = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }

    if (ch === "(") depthParen += 1;
    else if (ch === ")") depthParen -= 1;
    else if (ch === "{") depthBrace += 1;
    else if (ch === "}") depthBrace -= 1;
    else if (ch === "[") depthBracket += 1;
    else if (ch === "]") depthBracket -= 1;
    else if (ch === delimiter && depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }

  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

function findTopLevelColon(entry) {
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let quote = null;
  for (let i = 0; i < entry.length; i += 1) {
    const ch = entry[i];
    const prev = i > 0 ? entry[i - 1] : "";
    if (quote) {
      if (ch === quote && prev !== "\\") quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") depthParen += 1;
    else if (ch === ")") depthParen -= 1;
    else if (ch === "{") depthBrace += 1;
    else if (ch === "}") depthBrace -= 1;
    else if (ch === "[") depthBracket += 1;
    else if (ch === "]") depthBracket -= 1;
    else if (ch === ":" && depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
      return i;
    }
  }
  return -1;
}

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith("`") && trimmed.endsWith("`"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function stripTrailingComma(value) {
  return String(value || "").trim().replace(/,+\s*$/, "");
}

function isIdentifier(value) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(value || "").trim());
}

function extractExpressionFromIndex(text, startIndex) {
  let i = skipWhitespace(text, startIndex);
  const start = i;
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let quote = null;

  for (; i < text.length; i += 1) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : "";

    if (quote) {
      if (ch === quote && prev !== "\\") quote = null;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }

    if (ch === "(") depthParen += 1;
    else if (ch === ")") depthParen -= 1;
    else if (ch === "{") depthBrace += 1;
    else if (ch === "}") depthBrace -= 1;
    else if (ch === "[") depthBracket += 1;
    else if (ch === "]") depthBracket -= 1;
    else if ((ch === ";" || ch === "\n") && depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
      break;
    }
  }

  return stripTrailingComma(text.slice(start, i));
}

function findVariableInitializer(text, identifier) {
  if (!isIdentifier(identifier)) return null;
  const pattern = new RegExp(`\\b(?:const|let|var)\\s+${identifier}\\s*=\\s*`, "g");
  const match = pattern.exec(text);
  if (!match) return null;
  return extractExpressionFromIndex(text, match.index + match[0].length);
}

function resolveReferencedExpression(text, expr, seen = new Set()) {
  let current = stripTrailingComma(expr);
  while (isIdentifier(current) && !seen.has(current)) {
    seen.add(current);
    const initializer = findVariableInitializer(text, current);
    if (!initializer) break;
    current = stripTrailingComma(initializer);
  }
  return current;
}

function resolveObjectLiteral(text, expr, seen = new Set()) {
  const resolved = resolveReferencedExpression(text, expr, seen);
  const trimmed = resolved.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  return null;
}

function parseObjectLiteralEntries(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return [];
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  const entries = splitTopLevel(inner, ",");
  return entries
    .map((entry) => {
      const rawEntry = entry.trim();
      if (!rawEntry) return null;
      const spreadMatch = rawEntry.match(/^\.\.\.\s*([A-Za-z_$][A-Za-z0-9_$]*)$/);
      if (spreadMatch) {
        return { key: null, rawValue: spreadMatch[1], spreadFrom: spreadMatch[1] };
      }
      const colon = findTopLevelColon(rawEntry);
      if (colon === -1) {
        if (isIdentifier(rawEntry)) {
          return { key: rawEntry, rawValue: rawEntry, shorthand: true };
        }
        return null;
      }
      const rawKey = rawEntry.slice(0, colon).trim();
      const rawValue = rawEntry.slice(colon + 1).trim();
      const key = unquote(rawKey);
      return { key, rawValue };
    })
    .filter(Boolean);
}

function expandObjectLiteralEntries(text, objectLiteral, seen = new Set()) {
  const expanded = [];
  for (const entry of parseObjectLiteralEntries(objectLiteral)) {
    if (entry.spreadFrom) {
      if (seen.has(entry.spreadFrom)) continue;
      const nextSeen = new Set(seen);
      nextSeen.add(entry.spreadFrom);
      const spreadObject = resolveObjectLiteral(text, entry.spreadFrom, nextSeen);
      if (spreadObject) {
        expanded.push(...expandObjectLiteralEntries(text, spreadObject, nextSeen));
      }
      continue;
    }
    expanded.push(entry);
  }
  return expanded;
}

function inferPrimitiveType(expr) {
  const trimmed = expr.trim();
  const simple = [
    "string",
    "boolean",
    "number",
    "float64",
    "int64",
    "bytes",
    "null",
    "any",
  ];
  for (const name of simple) {
    if (trimmed === `v.${name}()`) return name;
  }
  return null;
}

function parseValidator(expr) {
  const trimmed = stripTrailingComma(expr);
  const primitive = inferPrimitiveType(trimmed);
  if (primitive) {
    return {
      type: primitive,
      nullable: primitive === "null",
      list: false,
      raw: trimmed,
    };
  }

  if (trimmed.startsWith("v.optional(") && trimmed.endsWith(")")) {
    const inner = stripTrailingComma(trimmed.slice("v.optional(".length, -1));
    const parsed = parseValidator(inner);
    return {
      ...parsed,
      nullable: true,
      optional: true,
      raw: trimmed,
    };
  }

  if (trimmed.startsWith("v.array(") && trimmed.endsWith(")")) {
    const inner = trimmed.slice("v.array(".length, -1);
    const [itemRaw] = splitTopLevel(inner, ",");
    const parsed = parseValidator(stripTrailingComma(itemRaw || inner));
    const relation = parsed.relation
      ? { ...parsed.relation, list: true }
      : null;
    return {
      type: `array<${parsed.type}>`,
      nullable: false,
      list: true,
      items: parsed,
      relation,
      raw: trimmed,
    };
  }

  if (trimmed.startsWith("v.id(") && trimmed.endsWith(")")) {
    const target = unquote(trimmed.slice("v.id(".length, -1));
    return {
      type: `id<${target}>`,
      nullable: false,
      list: false,
      relation: {
        to: target,
        fields: [],
        references: ["_id"],
        relationName: null,
        list: false,
      },
      raw: trimmed,
    };
  }

  if (trimmed.startsWith("v.literal(") && trimmed.endsWith(")")) {
    const literal = stripTrailingComma(trimmed.slice("v.literal(".length, -1));
    return {
      type: `literal<${literal}>`,
      nullable: literal === "null",
      list: false,
      raw: trimmed,
    };
  }

  if (trimmed.startsWith("v.union(") && trimmed.endsWith(")")) {
    const inner = trimmed.slice("v.union(".length, -1);
    const options = splitTopLevel(inner, ",").map((option) => parseValidator(stripTrailingComma(option)));
    const nullable = options.some((option) => option.type === "null");
    return {
      type: `union<${options.map((option) => option.type).join(" | ")}>`,
      nullable,
      list: false,
      options,
      raw: trimmed,
    };
  }

  if (trimmed.startsWith("v.object(") && trimmed.endsWith(")")) {
    const inner = trimmed.slice("v.object(".length, -1).trim();
    const shapeEntries = parseObjectLiteralEntries(inner);
    const shape = shapeEntries.map(({ key, rawValue }) => ({
      name: key,
      ...validatorToColumn(rawValue, key),
    }));
    return {
      type: "object",
      nullable: false,
      list: false,
      shape,
      raw: trimmed,
    };
  }

  if (trimmed.startsWith("v.record(") && trimmed.endsWith(")")) {
    const inner = trimmed.slice("v.record(".length, -1);
    const [keyTypeRaw, valueTypeRaw] = splitTopLevel(inner, ",");
    const keyType = keyTypeRaw ? parseValidator(keyTypeRaw) : { type: "unknown" };
    const valueType = valueTypeRaw ? parseValidator(valueTypeRaw) : { type: "unknown" };
    return {
      type: `record<${keyType.type}, ${valueType.type}>`,
      nullable: false,
      list: false,
      keyType,
      valueType,
      raw: trimmed,
    };
  }

  return {
    type: "unknown",
    nullable: false,
    list: false,
    raw: trimmed,
  };
}

function validatorToColumn(expr, fieldName) {
  const parsed = parseValidator(expr);
  return {
    type: parsed.type,
    nullable: !!parsed.nullable,
    list: !!parsed.list,
    dbName: null,
    dbType: null,
    default: null,
    primaryKey: false,
    unique: false,
    constraints: [],
    rawValidator: parsed.raw,
    ...(parsed.shape ? { shape: parsed.shape } : {}),
    ...(parsed.items ? { items: parsed.items } : {}),
    ...(parsed.options ? { options: parsed.options } : {}),
    ...(parsed.keyType ? { keyType: parsed.keyType } : {}),
    ...(parsed.valueType ? { valueType: parsed.valueType } : {}),
  };
}

function extractFirstObjectInsideCall(callText) {
  const openBrace = callText.indexOf("{");
  if (openBrace === -1) return "{}";
  const closeBrace = findMatching(callText, openBrace, "{", "}");
  if (closeBrace === -1) return "{}";
  return callText.slice(openBrace, closeBrace + 1);
}

function extractFirstCall(text, name) {
  const idx = text.indexOf(`${name}(`);
  if (idx === -1) return null;
  const openParen = idx + name.length;
  const closeParen = findMatching(text, openParen, "(", ")");
  if (closeParen === -1) return null;
  return text.slice(openParen + 1, closeParen);
}

function parseIndexConfig(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    const inner = trimmed.slice(1, -1).trim();
    const fields = inner ? splitTopLevel(inner, ",").map(unquote) : [];
    return { fields };
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const out = {};
    for (const entry of parseObjectLiteralEntries(trimmed)) {
      if (entry.rawValue.trim().startsWith("[")) {
        const inner = entry.rawValue.trim().slice(1, -1);
        out[entry.key] = inner ? splitTopLevel(inner, ",").map(unquote) : [];
      } else if (/^\d+$/.test(entry.rawValue.trim())) {
        out[entry.key] = Number(entry.rawValue.trim());
      } else if (entry.rawValue.trim() === "true" || entry.rawValue.trim() === "false") {
        out[entry.key] = entry.rawValue.trim() === "true";
      } else {
        out[entry.key] = unquote(entry.rawValue);
      }
    }
    return out;
  }
  return { raw: trimmed };
}

function parseTableValue(schemaText, tableName, value) {
  const defineTableArgs = extractFirstCall(value, "defineTable") || "";
  const [shapeArgRaw] = splitTopLevel(defineTableArgs, ",");
  const resolvedShape = resolveObjectLiteral(schemaText, shapeArgRaw || "");
  const fieldsObject = resolvedShape || extractFirstObjectInsideCall(defineTableArgs);
  const fieldEntries = expandObjectLiteralEntries(schemaText, fieldsObject);
  const columns = [];
  const relations = [];

  for (const entry of fieldEntries) {
    const column = {
      name: entry.key,
      ...validatorToColumn(entry.rawValue, entry.key),
    };
    columns.push(column);
    const parsed = parseValidator(entry.rawValue);
    if (parsed.relation) {
      relations.push({
        field: entry.key,
        to: parsed.relation.to,
        optional: !!parsed.nullable,
        list: !!parsed.list,
        fields: [entry.key],
        references: ["_id"],
        relationName: null,
      });
    }
  }

  const indexes = [];
  for (const call of findMethodCalls(value, "index")) {
    const [nameRaw, configRaw] = splitTopLevel(call, ",");
    const name = unquote(nameRaw || "");
    const config = parseIndexConfig(configRaw || "[]");
    indexes.push({
      type: "index",
      name,
      fields: Array.isArray(config.fields) ? config.fields : config,
      staged: typeof config.staged === "boolean" ? config.staged : false,
    });
  }
  for (const call of findMethodCalls(value, "searchIndex")) {
    const [nameRaw, configRaw] = splitTopLevel(call, ",");
    const name = unquote(nameRaw || "");
    const config = parseIndexConfig(configRaw || "{}");
    indexes.push({
      type: "search",
      name,
      searchField: config.searchField || null,
      filterFields: Array.isArray(config.filterFields) ? config.filterFields : [],
      staged: typeof config.staged === "boolean" ? config.staged : false,
    });
  }
  for (const call of findMethodCalls(value, "vectorIndex")) {
    const [nameRaw, configRaw] = splitTopLevel(call, ",");
    const name = unquote(nameRaw || "");
    const config = parseIndexConfig(configRaw || "{}");
    indexes.push({
      type: "vector",
      name,
      vectorField: config.vectorField || null,
      dimensions: typeof config.dimensions === "number" ? config.dimensions : null,
      filterFields: Array.isArray(config.filterFields) ? config.filterFields : [],
      staged: typeof config.staged === "boolean" ? config.staged : false,
    });
  }

  columns.unshift({
    name: "_id",
    type: `id<${tableName}>`,
    nullable: false,
    list: false,
    dbName: null,
    dbType: null,
    default: "system",
    primaryKey: true,
    unique: true,
    constraints: ["system"],
    rawValidator: "system",
  });
  columns.unshift({
    name: "_creationTime",
    type: "float64",
    nullable: false,
    list: false,
    dbName: null,
    dbType: null,
    default: "system",
    primaryKey: false,
    unique: false,
    constraints: ["system"],
    rawValidator: "system",
  });

  return {
    name: tableName,
    dbName: null,
    schema: null,
    columns,
    relations,
    indexes,
  };
}

export function parseConvexSchema(schemaText, { sourcePath = "convex/schema.ts" } = {}) {
  const schemaCallArgs = extractFirstCall(schemaText, "defineSchema");
  if (!schemaCallArgs) {
    return {
      version: 2,
      updatedAt: new Date().toISOString(),
      ssot: {
        mode: "convex",
        source: { kind: "convex-schema", path: sourcePath },
      },
      database: {
        kind: "document-relational",
        dialect: "convex",
        name: "convex",
        schemas: [],
      },
      enums: [],
      tables: [],
      notes: "Could not locate defineSchema(...) in convex/schema.ts.",
    };
  }

  const [tablesArgRaw] = splitTopLevel(schemaCallArgs, ",");
  const resolvedTablesObject = resolveObjectLiteral(schemaText, tablesArgRaw || "");
  const openBrace = schemaCallArgs.indexOf("{");
  const closeBrace = openBrace === -1 ? -1 : findMatching(schemaCallArgs, openBrace, "{", "}");
  const fallbackSchemaObject = openBrace === -1 || closeBrace === -1 ? "{}" : schemaCallArgs.slice(openBrace, closeBrace + 1);
  const schemaObject = resolvedTablesObject || fallbackSchemaObject;
  const entries = expandObjectLiteralEntries(schemaText, schemaObject);

  const tables = [];
  for (const entry of entries) {
    const tableExpression = resolveReferencedExpression(schemaText, entry.rawValue);
    if (tableExpression.includes("defineTable(")) {
      tables.push(parseTableValue(schemaText, entry.key, tableExpression));
    }
  }

  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    ssot: {
      mode: "convex",
      source: { kind: "convex-schema", path: sourcePath },
    },
    database: {
      kind: "document-relational",
      dialect: "convex",
      name: "convex",
      schemas: [],
    },
    enums: [],
    tables,
    notes: "Generated from convex/schema.ts by convex-as-ssot.",
  };
}

function detectRuntime(fileText) {
  const trimmed = fileText.trimStart();
  if (trimmed.startsWith('"use node";') || trimmed.startsWith("'use node';") || trimmed.startsWith('"use node"') || trimmed.startsWith("'use node'")) {
    return "node";
  }
  return "convex";
}

function summarizeValidatorObject(rawObjectText) {
  const trimmed = rawObjectText.trim();
  const entries = expandObjectLiteralEntries(trimmed, trimmed);
  return {
    raw: trimmed,
    fields: entries.map((entry) => ({
      name: entry.key,
      ...validatorToColumn(entry.rawValue, entry.key),
    })),
  };
}

function summarizeValidatorExpression(raw) {
  const parsed = parseValidator(raw);
  return {
    raw: raw.trim(),
    inferredType: parsed.type,
    nullable: !!parsed.nullable,
    list: !!parsed.list,
    ...(parsed.shape ? { shape: parsed.shape } : {}),
    ...(parsed.items ? { items: parsed.items } : {}),
    ...(parsed.options ? { options: parsed.options } : {}),
  };
}

function extractObjectProperty(text, propertyName) {
  const regex = new RegExp(`${propertyName}\\s*:\\s*`, "g");
  const match = regex.exec(text);
  if (!match) return null;
  let i = match.index + match[0].length;
  i = skipWhitespace(text, i);
  const start = i;
  const ch = charAt(text, i);
  if (ch === "{") {
    const end = findMatching(text, i, "{", "}");
    return end === -1 ? null : text.slice(start, end + 1);
  }
  if (ch === "(") {
    const end = findMatching(text, i, "(", ")");
    return end === -1 ? null : text.slice(start, end + 1);
  }
  if (ch === "'" || ch === '"' || ch === "`") {
    const quote = ch;
    i += 1;
    while (i < text.length) {
      if (text[i] === quote && text[i - 1] !== "\\") break;
      i += 1;
    }
    return text.slice(start, i + 1);
  }

  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let quote = null;
  for (; i < text.length; i += 1) {
    const current = text[i];
    const prev = i > 0 ? text[i - 1] : "";
    if (quote) {
      if (current === quote && prev !== "\\") quote = null;
      continue;
    }
    if (current === "'" || current === '"' || current === "`") {
      quote = current;
      continue;
    }
    if (current === "(") depthParen += 1;
    else if (current === ")") depthParen -= 1;
    else if (current === "{") depthBrace += 1;
    else if (current === "}") depthBrace -= 1;
    else if (current === "[") depthBracket += 1;
    else if (current === "]") depthBracket -= 1;
    else if (current === "," && depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
      return text.slice(start, i).trim();
    }
  }
  return text.slice(start).trim();
}

const SUPPORTED_CONSTRUCTORS = new Set([
  "query",
  "mutation",
  "action",
  "httpAction",
  "internalQuery",
  "internalMutation",
  "internalAction",
]);

function buildConstructorAliases(fileText) {
  const aliases = new Map();
  const constAliasPairs = [];

  const importPattern = /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
  let importMatch;
  while ((importMatch = importPattern.exec(fileText))) {
    const source = importMatch[2];
    if (!isConvexConstructorImportSource(source)) continue;
    const specs = splitTopLevel(importMatch[1], ",");
    for (const spec of specs) {
      const trimmed = spec.trim();
      const aliasMatch = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);
      if (aliasMatch && SUPPORTED_CONSTRUCTORS.has(aliasMatch[1])) {
        aliases.set(aliasMatch[2], aliasMatch[1]);
        continue;
      }
      if (SUPPORTED_CONSTRUCTORS.has(trimmed)) {
        aliases.set(trimmed, trimmed);
      }
    }
  }

  const constAliasPattern = /\bconst\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*;/g;
  let constAliasMatch;
  while ((constAliasMatch = constAliasPattern.exec(fileText))) {
    constAliasPairs.push([constAliasMatch[1], constAliasMatch[2]]);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [aliasName, targetName] of constAliasPairs) {
      const resolvedTarget = resolveConstructorAlias(aliases, targetName);
      if (!SUPPORTED_CONSTRUCTORS.has(resolvedTarget)) continue;
      if (aliases.get(aliasName) === resolvedTarget) continue;
      aliases.set(aliasName, resolvedTarget);
      changed = true;
    }
  }

  return aliases;
}

function isConvexConstructorImportSource(source) {
  const normalized = String(source || "").trim();
  if (!normalized) return false;
  return normalized === "convex/server" || normalized.endsWith("/_generated/server") || normalized === "./_generated/server";
}

function resolveConstructorAlias(aliases, name) {
  let current = name;
  const seen = new Set();
  while (aliases.has(current) && !seen.has(current)) {
    seen.add(current);
    current = aliases.get(current);
  }
  return current;
}

function inferConstructorMetadata(callee, aliases) {
  const rawConstructor = String(callee || "").trim();
  const resolvedConstructor = resolveConstructorAlias(aliases, rawConstructor);
  const candidate = SUPPORTED_CONSTRUCTORS.has(resolvedConstructor) ? resolvedConstructor : rawConstructor;

  const directKind = SUPPORTED_CONSTRUCTORS.has(candidate)
    ? candidate.replace(/^internal/, "").replace(/^./, (c) => c.toLowerCase())
    : null;
  if (directKind) {
    return {
      constructor: rawConstructor,
      resolvedConstructor: candidate,
      visibility: candidate.startsWith("internal") ? "internal" : "public",
      kind: directKind,
    };
  }

  return null;
}

function findExportedFunctions(fileText) {
  const pattern = /export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  const matches = [];
  const aliases = buildConstructorAliases(fileText);
  let match;
  while ((match = pattern.exec(fileText))) {
    const exportName = match[1];
    const callee = match[2];
    const constructorInfo = inferConstructorMetadata(callee, aliases);
    if (!constructorInfo) continue;
    const openParen = pattern.lastIndex - 1;
    const closeParen = findMatching(fileText, openParen, "(", ")");
    if (closeParen === -1) continue;
    matches.push({
      exportName,
      callee,
      ...constructorInfo,
      body: fileText.slice(openParen + 1, closeParen),
    });
    pattern.lastIndex = closeParen + 1;
  }
  return matches;
}

function buildUsageHints(body) {
  const uses = {
    dbRead: /ctx\s*\.\s*db\s*\.\s*(query|get|system\s*\.\s*get)\s*\(/.test(body),
    dbWrite: /ctx\s*\.\s*db\s*\.\s*(insert|patch|replace|delete)\s*\(/.test(body),
    scheduler: /ctx\s*\.\s*scheduler\s*\./.test(body),
    storage: /ctx\s*\.\s*storage\s*\./.test(body),
    runQuery: /ctx\s*\.\s*runQuery\s*\(/.test(body),
    runMutation: /ctx\s*\.\s*runMutation\s*\(/.test(body),
    runAction: /ctx\s*\.\s*runAction\s*\(/.test(body),
    fetch: /\bfetch\s*\(/.test(body),
    vectorSearch: /ctx\s*\.\s*vectorSearch\s*\(/.test(body),
  };

  const tablesRead = [...new Set([...(body.matchAll(/ctx\s*\.\s*db\s*\.\s*query\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g))].map((m) => m[1]))].sort();
  const tablesWritten = [...new Set([...(body.matchAll(/ctx\s*\.\s*db\s*\.\s*insert\s*\(\s*["'`]([^"'`]+)["'`]\s*,/g))].map((m) => m[1]))].sort();

  return { uses, tablesRead, tablesWritten };
}

function detectAuth(body, visibility) {
  if (visibility === "internal") return { kind: "internal-only" };
  if (/ctx\.auth\.getUserIdentity\s*\(/.test(body)) {
    return { kind: "explicit-user-identity" };
  }
  return { kind: "not-detected" };
}

export function extractConvexFunctions({ repoRoot, convexDir = path.join(repoRoot, "convex") }) {
  const files = listFilesRecursively(convexDir, (full) => full.endsWith(".ts") || full.endsWith(".tsx"))
    .filter((full) => !full.includes(`${path.sep}_generated${path.sep}`))
    .filter((full) => !full.endsWith(`${path.sep}schema.ts`))
    .filter((full) => !full.endsWith(`${path.sep}dataModel.ts`))
    .filter((full) => !full.endsWith(`${path.sep}auth.config.ts`));

  const functions = [];

  for (const file of files) {
    const fileText = readTextIfExists(file);
    if (!fileText) continue;
    const runtime = detectRuntime(fileText);
    const relativeFile = toPosixPath(path.relative(repoRoot, file));
    const modulePath = toPosixPath(path.relative(convexDir, file)).replace(/\.(tsx?|jsx?)$/, "");

    for (const fn of findExportedFunctions(fileText)) {
      const visibility = fn.visibility;
      const kind = fn.kind;

      const argsRaw = extractObjectProperty(fn.body, "args");
      const returnsRaw = extractObjectProperty(fn.body, "returns");
      const { uses, tablesRead, tablesWritten } = buildUsageHints(fn.body);
      const auth = detectAuth(fn.body, visibility);

      functions.push({
        functionId: `${modulePath}:${fn.exportName}`,
        exportName: fn.exportName,
        kind,
        constructor: fn.constructor,
        ...(fn.resolvedConstructor && fn.resolvedConstructor !== fn.constructor ? { resolvedConstructor: fn.resolvedConstructor } : {}),
        visibility,
        file: relativeFile,
        modulePath,
        runtime,
        argsValidator: argsRaw
          ? (argsRaw.trim().startsWith("{")
              ? summarizeValidatorObject(argsRaw)
              : summarizeValidatorExpression(argsRaw))
          : null,
        returnsValidator: returnsRaw ? summarizeValidatorExpression(returnsRaw) : null,
        auth,
        uses,
        tablesRead,
        tablesWritten,
      });
    }
  }

  functions.sort((a, b) => a.functionId.localeCompare(b.functionId));

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    source: {
      kind: "convex-functions",
      path: `${toPosixPath(path.relative(repoRoot, convexDir))}/`,
    },
    functions,
  };
}
