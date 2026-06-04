import fs from 'node:fs';
import path from 'node:path';

export const NORMALIZED_DB_SCHEMA_VERSION = 2;

const SCALAR_TYPES = new Set([
  'String',
  'Boolean',
  'Int',
  'BigInt',
  'Float',
  'Decimal',
  'DateTime',
  'Json',
  'Bytes'
]);

function stripBlockComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '');
}

function stripLineComments(s) {
  return s.replace(/(^|\s)\/\/.*$/gm, '$1');
}

export function stripPrismaComments(schemaText) {
  if (typeof schemaText !== 'string') return '';
  return stripLineComments(stripBlockComments(schemaText));
}

function toIsoNow() {
  return new Date().toISOString();
}

function safeReadText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function readTextIfExists(filePath) {
  return safeReadText(filePath);
}

export function readJsonIfExists(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function stableSortBy(arr, keyFn) {
  return [...arr].sort((a, b) => {
    const ka = String(keyFn(a) ?? '');
    const kb = String(keyFn(b) ?? '');
    return ka.localeCompare(kb);
  });
}

function inferDialectFromProvider(providerRaw) {
  const p = String(providerRaw || '').toLowerCase();
  if (p.includes('postgres')) return 'postgresql';
  if (p.includes('mysql')) return 'mysql';
  if (p.includes('sqlite')) return 'sqlite';
  if (p.includes('sqlserver')) return 'sqlserver';
  if (p.includes('mongodb')) return 'mongodb';
  return p || 'generic';
}

function parseStringArrayLiteral(raw) {
  // Raw might be: '"public", "tenant"'
  if (!raw) return [];
  const matches = raw.match(/"([^"]+)"/g) || [];
  return matches.map((m) => m.replace(/"/g, '')).filter(Boolean);
}

function parseDatasource(schemaText) {
  const out = { provider: null, schemas: [] };
  const m = schemaText.match(/datasource\s+\w+\s*\{([\s\S]*?)\}/);
  if (!m) return out;
  const body = m[1] || '';
  const prov = body.match(/provider\s*=\s*"([^"]+)"/);
  if (prov) out.provider = prov[1];
  const schemas = body.match(/schemas\s*=\s*\[([^\]]*)\]/);
  if (schemas) out.schemas = parseStringArrayLiteral(schemas[1]);
  return out;
}

function tokenizeAttributes(rest) {
  const s = String(rest || '').trim();
  if (!s) return [];

  const tokens = [];
  let i = 0;
  while (i < s.length) {
    // Skip whitespace
    while (i < s.length && /\s/.test(s[i])) i += 1;
    if (i >= s.length) break;
    if (s[i] !== '@') {
      // Not an attribute token; stop.
      break;
    }
    let start = i;
    i += 1;
    let depth = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '(') depth += 1;
      if (ch === ')') depth = Math.max(0, depth - 1);
      if (depth === 0 && /\s/.test(ch)) break;
      i += 1;
    }
    tokens.push(s.slice(start, i));
  }
  return tokens;
}

function parseMapAttr(attrToken) {
  const m = String(attrToken || '').match(/@map\(\s*"([^"]+)"\s*\)/);
  return m ? m[1] : null;
}

function parseDbTypeAttr(attrToken) {
  const m = String(attrToken || '').match(/@db\.([A-Za-z0-9_]+)/);
  return m ? m[1] : null;
}

function parseDefaultAttr(attrToken) {
  const m = String(attrToken || '').match(/@default\((.*)\)/);
  return m ? m[1].trim() : null;
}

function parseRelationAttr(attrToken) {
  const raw = String(attrToken || '');
  if (!raw.startsWith('@relation')) return null;

  const inside = raw.match(/@relation\((.*)\)/);
  const args = inside ? inside[1] : '';

  const out = {
    name: null,
    fields: [],
    references: []
  };

  // name: "RelName" or "RelName" as first positional string
  const nameKeyed = args.match(/name\s*:\s*"([^"]+)"/);
  if (nameKeyed) out.name = nameKeyed[1];
  if (!out.name) {
    const namePos = args.match(/^\s*"([^"]+)"\s*,?/);
    if (namePos) out.name = namePos[1];
  }

  const fields = args.match(/fields\s*:\s*\[([^\]]*)\]/);
  if (fields) {
    out.fields = fields[1]
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  }

  const refs = args.match(/references\s*:\s*\[([^\]]*)\]/);
  if (refs) {
    out.references = refs[1]
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  }

  return out;
}

function parseModelLevelAttributes(lines) {
  const attrs = {
    dbName: null,
    schema: null,
    indexes: []
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('@@')) continue;

    const map = line.match(/@@map\(\s*"([^"]+)"\s*\)/);
    if (map) attrs.dbName = map[1];

    const schema = line.match(/@@schema\(\s*"([^"]+)"\s*\)/);
    if (schema) attrs.schema = schema[1];

    const idx = line.match(/^@@(id|unique|index)\s*\(\s*\[([^\]]*)\]/);
    if (idx) {
      const kind = idx[1];
      const fieldsRaw = idx[2];
      const fields = fieldsRaw
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => x.split('(')[0].trim());

      const name = (line.match(/name\s*:\s*"([^"]+)"/) || [])[1] || null;
      const mapName = (line.match(/map\s*:\s*"([^"]+)"/) || [])[1] || null;

      attrs.indexes.push({
        type: kind === 'id' ? 'primary' : kind,
        fields,
        name,
        map: mapName
      });
    }
  }

  attrs.indexes = stableSortBy(attrs.indexes, (x) => `${x.type}:${(x.fields || []).join(',')}:${x.name || ''}:${x.map || ''}`);
  return attrs;
}

function parseEnumBlocks(schemaText) {
  const enums = [];
  const re = /enum\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let m;
  while ((m = re.exec(schemaText)) !== null) {
    const name = m[1];
    const body = m[2] || '';
    const values = [];
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('//')) continue;
      if (line.startsWith('@@')) continue;
      const token = (line.match(/^(\w+)/) || [])[1];
      if (token) values.push(token);
    }
    enums.push({ name, values: uniq(values) });
  }
  return stableSortBy(enums, (e) => e.name);
}

function parseModelBlocks(schemaText) {
  const models = [];
  const re = /model\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let m;
  while ((m = re.exec(schemaText)) !== null) {
    const name = m[1];
    const body = m[2] || '';

    const fieldLines = [];
    const modelAttrLines = [];

    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('//')) continue;
      if (line.startsWith('@@')) {
        modelAttrLines.push(line);
        continue;
      }
      fieldLines.push(line);
    }

    models.push({ name, fieldLines, modelAttrLines });
  }
  return models;
}

export function parsePrismaSchema(schemaTextRaw) {
  const schemaText = stripPrismaComments(String(schemaTextRaw || ''));

  const datasource = parseDatasource(schemaText);
  const enums = parseEnumBlocks(schemaText);
  const modelsRaw = parseModelBlocks(schemaText);

  const modelNames = new Set(modelsRaw.map((m) => m.name));
  const enumNames = new Set(enums.map((e) => e.name));

  const tables = [];

  for (const model of modelsRaw) {
    const modelAttrs = parseModelLevelAttributes(model.modelAttrLines);

    const columns = [];
    const relations = [];

    for (const rawLine of model.fieldLines) {
      const m = rawLine.match(/^(\w+)\s+([^\s]+)\s*(.*)$/);
      if (!m) continue;

      const fieldName = m[1];
      const typeToken = m[2];
      const rest = m[3] || '';

      const attrTokens = tokenizeAttributes(rest);

      let isList = false;
      let nullable = false;
      let baseType = typeToken;

      if (baseType.endsWith('[]')) {
        isList = true;
        baseType = baseType.slice(0, -2);
      }
      if (baseType.endsWith('?')) {
        nullable = true;
        baseType = baseType.slice(0, -1);
      }

      const isRelationField =
        attrTokens.some((t) => String(t).startsWith('@relation')) ||
        (modelNames.has(baseType) && !SCALAR_TYPES.has(baseType) && !enumNames.has(baseType));

      const mappedName = attrTokens.map(parseMapAttr).find(Boolean) || null;
      const dbType = attrTokens.map(parseDbTypeAttr).find(Boolean) || null;
      const def = attrTokens.map(parseDefaultAttr).find(Boolean) || null;
      const rel = attrTokens.map(parseRelationAttr).find(Boolean) || null;

      const isPrimaryKey = attrTokens.includes('@id');
      const isUnique = attrTokens.includes('@unique');

      if (isRelationField) {
        relations.push({
          field: fieldName,
          to: baseType,
          optional: nullable,
          list: isList,
          relationName: rel?.name || null,
          fields: rel?.fields || [],
          references: rel?.references || []
        });
      } else {
        columns.push({
          name: fieldName,
          type: baseType,
          nullable,
          list: isList,
          dbName: mappedName,
          dbType,
          default: def,
          primaryKey: isPrimaryKey,
          unique: isUnique
        });
      }
    }

    // Promote model-level indexes
    const indexes = modelAttrs.indexes || [];

    tables.push({
      name: model.name,
      dbName: modelAttrs.dbName,
      schema: modelAttrs.schema,
      columns: stableSortBy(columns, (c) => c.name),
      relations: stableSortBy(relations, (r) => r.field),
      indexes
    });
  }

  return {
    datasource,
    database: {
      kind: datasource.provider && inferDialectFromProvider(datasource.provider) === 'mongodb' ? 'document' : 'relational',
      dialect: inferDialectFromProvider(datasource.provider),
      name: '',
      schemas: datasource.schemas || []
    },
    enums,
    tables: stableSortBy(tables, (t) => t.name)
  };
}

function constraintsToFlags(constraints) {
  const flags = {
    primaryKey: false,
    unique: false,
    nullable: undefined
  };

  const c = (constraints || []).map((x) => String(x).toLowerCase());
  if (c.includes('pk') || c.includes('primary') || c.includes('primarykey')) flags.primaryKey = true;
  if (c.includes('unique')) flags.unique = true;
  if (c.includes('notnull') || c.includes('not-null') || c.includes('required')) flags.nullable = false;
  if (c.includes('null') || c.includes('nullable')) flags.nullable = true;

  return flags;
}

export function normalizeDbMirrorSchema(raw) {
  const now = toIsoNow();
  const obj = raw && typeof raw === 'object' ? raw : {};
  const version = Number(obj.version) || 1;

  if (version >= 2) {
    // Already normalized v2-ish; just sanitize.
    const tables = Array.isArray(obj.tables) ? obj.tables : [];
    const enums = Array.isArray(obj.enums) ? obj.enums : [];
    const database = obj.database && typeof obj.database === 'object' ? obj.database : { kind: 'relational', dialect: 'generic', name: '' };

    return {
      version: NORMALIZED_DB_SCHEMA_VERSION,
      updatedAt: obj.updatedAt || obj.lastUpdated || now,
      ssot: obj.ssot && typeof obj.ssot === 'object' ? obj.ssot : { mode: 'database', source: { kind: 'database', path: '' } },
      source: obj.source && typeof obj.source === 'object' ? obj.source : undefined,
      database: {
        kind: database.kind || 'relational',
        dialect: database.dialect || 'generic',
        name: database.name || '',
        schemas: Array.isArray(database.schemas) ? database.schemas : []
      },
      enums: stableSortBy(enums, (e) => e.name),
      tables: stableSortBy(tables, (t) => t.name),
      notes: obj.notes || ''
    };
  }

  // v1 legacy format: { version: 1, updatedAt, tables: [{name, columns:[{name,type,constraints}]}] }
  const tablesV1 = Array.isArray(obj.tables) ? obj.tables : [];

  const tables = tablesV1
    .filter((t) => t && typeof t === 'object')
    .map((t) => {
      const cols = Array.isArray(t.columns) ? t.columns : [];
      const columns = cols
        .filter((c) => c && typeof c === 'object')
        .map((c) => {
          const flags = constraintsToFlags(c.constraints || []);
          return {
            name: String(c.name || '').trim(),
            type: String(c.type || '').trim(),
            nullable: flags.nullable,
            list: false,
            dbName: null,
            dbType: null,
            default: null,
            primaryKey: flags.primaryKey,
            unique: flags.unique,
            constraints: Array.isArray(c.constraints) ? c.constraints : []
          };
        })
        .filter((c) => c.name);

      return {
        name: String(t.name || '').trim(),
        dbName: t.dbName || null,
        schema: t.schema || null,
        columns: stableSortBy(columns, (c) => c.name),
        relations: [],
        indexes: []
      };
    })
    .filter((t) => t.name);

  return {
    version: NORMALIZED_DB_SCHEMA_VERSION,
    updatedAt: obj.updatedAt || obj.lastUpdated || now,
    ssot: { mode: 'database', source: { kind: 'database', path: '' } },
    database: { kind: 'relational', dialect: 'generic', name: '', schemas: [] },
    enums: [],
    tables: stableSortBy(tables, (t) => t.name),
    notes: obj.notes || 'Upgraded from legacy db/schema/tables.json v1.'
  };
}

export function buildNormalizedDbSchema({ mode, source, database, enums, tables, notes }) {
  const now = toIsoNow();

  const dialect = database?.dialect || 'generic';
  const kind = database?.kind || (dialect === 'mongodb' ? 'document' : 'relational');

  return {
    version: NORMALIZED_DB_SCHEMA_VERSION,
    updatedAt: now,
    ssot: {
      mode: mode || 'none',
      source: {
        kind: source?.kind || 'none',
        path: source?.path || ''
      }
    },
    database: {
      kind,
      dialect,
      name: database?.name || '',
      schemas: Array.isArray(database?.schemas) ? database.schemas : []
    },
    enums: stableSortBy(Array.isArray(enums) ? enums : [], (e) => e.name),
    tables: stableSortBy(Array.isArray(tables) ? tables : [], (t) => t.name),
    notes: notes || ''
  };
}
