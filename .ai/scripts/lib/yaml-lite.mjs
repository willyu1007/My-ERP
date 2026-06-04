/**
 * Lightweight YAML parsing utilities (dependency-free)
 *
 * Provides simple YAML parsing for common patterns used in registry files.
 * NOT a full YAML parser - only handles flat key-value pairs and simple lists.
 *
 * Usage:
 *   import { stripInlineComment, unquote, parseTopLevelVersion, parseListFieldValues } from './lib/yaml-lite.mjs';
 */

/**
 * Strip inline YAML comments (everything after # outside quotes).
 * @param {string} line - YAML line
 * @returns {string}
 */
export function stripInlineComment(line) {
  const s = String(line || '');
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    // Skip escaped characters inside quoted strings
    if (ch === '\\' && (inSingle || inDouble) && i + 1 < s.length) {
      i++; // skip the next character (escaped)
      continue;
    }
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) {
      return s.slice(0, i);
    }
  }
  return s;
}

/**
 * Unquote a YAML value (removes surrounding single or double quotes).
 * @param {string} s - Quoted or unquoted value
 * @returns {string}
 */
export function unquote(s) {
  const t = String(s || '').trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Parse a top-level version field.
 * Looks for: version: <int>
 *
 * @param {string} raw - YAML content
 * @returns {number | null}
 */
export function parseTopLevelVersion(raw) {
  const m = raw.match(/^\s*version\s*:\s*([0-9]+)\s*$/m);
  return m ? Number(m[1]) : null;
}

/**
 * Parse values from list items with a specific key.
 * Looks for: - <listItemKey>: value
 *
 * @param {string} raw - YAML content
 * @param {string} listItemKey - Key to extract (e.g., 'provider_id')
 * @returns {string[]}
 */
export function parseListFieldValues(raw, listItemKey) {
  const values = [];
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const re = new RegExp(`^\\s*\\-\\s*${listItemKey}\\s*:\\s*(.+)\\s*$`);

  for (const originalLine of lines) {
    const line = stripInlineComment(originalLine).trimEnd();
    const m = line.match(re);
    if (!m) continue;
    const v = unquote(m[1]);
    if (v) values.push(v);
  }

  return values;
}

/**
 * Parse scalar assignments across the document.
 * Looks for: keyName: value
 *
 * @param {string} raw - YAML content
 * @param {string} keyName - Key to extract
 * @returns {string[]}
 */
export function parseAllScalarValues(raw, keyName) {
  const values = [];
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const re = new RegExp(`^\\s*${keyName}\\s*:\\s*(.+)\\s*$`);

  for (const originalLine of lines) {
    const line = stripInlineComment(originalLine).trimEnd();
    const m = line.match(re);
    if (!m) continue;
    const v = unquote(m[1]);
    if (v) values.push(v);
  }

  return values;
}

/**
 * Parse simple list items (- value).
 *
 * @param {string} raw - YAML content
 * @param {string} sectionKey - Section key to start parsing after (e.g., 'keys')
 * @returns {string[]}
 */
export function parseSimpleList(raw, sectionKey) {
  const values = [];
  const lines = raw.replace(/\r\n/g, '\n').split('\n');

  let inSection = false;
  const sectionRe = new RegExp(`^${sectionKey}\\s*:\\s*$`);

  for (const originalLine of lines) {
    const line = stripInlineComment(originalLine).trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check for section start
    if (sectionRe.test(trimmed)) {
      inSection = true;
      continue;
    }

    // Check for new section (key:)
    if (inSection && /^[a-z_]+\s*:\s*$/.test(trimmed)) {
      inSection = false;
      continue;
    }

    if (inSection) {
      const m = trimmed.match(/^\-\s*(.+)\s*$/);
      if (m) {
        const value = unquote(m[1]);
        if (value) values.push(value);
      }
    }
  }

  return values;
}

/**
 * Parse a simple key-value map from YAML content.
 * Only handles top-level flat key: value pairs.
 *
 * @param {string} raw - YAML content
 * @returns {Record<string, string>}
 */
export function parseSimpleMap(raw) {
  const result = {};
  const lines = raw.replace(/\r\n/g, '\n').split('\n');

  for (const originalLine of lines) {
    const line = stripInlineComment(originalLine).trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip list items
    if (trimmed.startsWith('-')) continue;

    const m = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.+)\s*$/);
    if (m) {
      const key = m[1];
      const value = unquote(m[2]);
      result[key] = value;
    }
  }

  return result;
}

/**
 * Check if a file header contains a template marker.
 * @param {string} raw - File content
 * @returns {boolean}
 */
export function hasTemplateHeader(raw) {
  const head = raw.split(/\r?\n/).slice(0, 5).join('\n');
  return head.toLowerCase().includes('(template)');
}

// ============================================================================
// Full YAML Subset Parser (for OpenAPI 3.x files)
// ============================================================================
//
// Supported: indentation-based maps/sequences, plain/quoted/block scalars,
//   flow [sequences] and {mappings}, numbers, booleans, null, comments.
// Not supported: anchors/aliases, tags (!!), complex keys, multi-document.

/**
 * Parse a YAML document into a JavaScript value.
 * @param {string} text
 * @returns {any}
 */
export function parseYaml(text) {
  if (!text || !text.trim()) return {};
  const rawLines = text.replace(/\r\n/g, '\n').split('\n');
  _detectUnsupportedSyntax(rawLines);
  const tokens = _tokenize(rawLines);
  if (tokens.length === 0) return {};
  const ctx = { tokens, rawLines, pos: 0 };
  return _parseNode(ctx, 0) ?? {};
}

function _detectUnsupportedSyntax(rawLines) {
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const noQ = trimmed.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
    if (/(?::\s+|^-\s+|^)&\w/.test(noQ)) {
      throw new Error(`yaml-lite: anchors (&) are not supported (line ${i + 1}): ${trimmed.slice(0, 60)}`);
    }
    if (/(?::\s+|^-\s+)\*\w/.test(noQ)) {
      throw new Error(`yaml-lite: aliases (*) are not supported (line ${i + 1}): ${trimmed.slice(0, 60)}`);
    }
    if (/(?::\s+|^-\s+|^)!!\w/.test(noQ)) {
      throw new Error(`yaml-lite: tags (!!) are not supported (line ${i + 1}): ${trimmed.slice(0, 60)}`);
    }
    if (/<<\s*:/.test(noQ)) {
      throw new Error(`yaml-lite: merge keys (<<) are not supported (line ${i + 1}): ${trimmed.slice(0, 60)}`);
    }
  }
}

/* ---- tokenizer ---- */

function _tokenize(rawLines) {
  const out = [];
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed === '---' || trimmed === '...') continue;
    const indent = raw.search(/\S/);
    const stripped = stripInlineComment(raw).trimEnd();
    const content = stripped.substring(indent);
    if (!content) continue;
    out.push({ indent, content, ri: i });
  }
  return out;
}

/* ---- node dispatcher ---- */

function _parseNode(ctx, minIndent) {
  if (ctx.pos >= ctx.tokens.length) return null;
  const tok = ctx.tokens[ctx.pos];
  if (tok.indent < minIndent) return null;
  if (tok.content.startsWith('- ') || tok.content === '-') {
    return _parseSequence(ctx, tok.indent);
  }
  return _parseMapping(ctx, tok.indent);
}

/* ---- mapping ---- */

function _parseMapping(ctx, baseIndent) {
  const result = {};
  while (ctx.pos < ctx.tokens.length) {
    const tok = ctx.tokens[ctx.pos];
    if (tok.indent !== baseIndent) break;
    if (tok.content.startsWith('- ') || tok.content === '-') break;
    const ci = _findKeyColon(tok.content);
    if (ci < 0) break;
    const key = _unquoteScalar(tok.content.slice(0, ci).trim());
    const vs = tok.content.slice(ci + 1).trim();
    ctx.pos++;
    result[key] = _resolveValue(ctx, baseIndent, vs, tok.ri);
  }
  return result;
}

/* ---- sequence ---- */

function _parseSequence(ctx, baseIndent) {
  const result = [];
  while (ctx.pos < ctx.tokens.length) {
    const tok = ctx.tokens[ctx.pos];
    if (tok.indent !== baseIndent) break;
    if (!tok.content.startsWith('- ') && tok.content !== '-') break;
    const afterDash = tok.content.length > 2 ? tok.content.slice(2) : '';
    ctx.pos++;

    if (afterDash === '') {
      if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].indent > baseIndent) {
        result.push(_parseNode(ctx, ctx.tokens[ctx.pos].indent));
      } else {
        result.push(null);
      }
      continue;
    }

    if (afterDash.startsWith('[')) { result.push(_parseFlowSequence(afterDash)); continue; }
    if (afterDash.startsWith('{')) { result.push(_parseFlowMapping(afterDash)); continue; }

    const ci = _findKeyColon(afterDash);
    if (ci >= 0) {
      const map = {};
      const contIndent = baseIndent + 2;
      const k = _unquoteScalar(afterDash.slice(0, ci).trim());
      const v = afterDash.slice(ci + 1).trim();
      map[k] = _resolveValue(ctx, contIndent, v, tok.ri);
      while (
        ctx.pos < ctx.tokens.length &&
        ctx.tokens[ctx.pos].indent === contIndent &&
        !ctx.tokens[ctx.pos].content.startsWith('- ')
      ) {
        const nt = ctx.tokens[ctx.pos];
        const nc = _findKeyColon(nt.content);
        if (nc < 0) break;
        const nk = _unquoteScalar(nt.content.slice(0, nc).trim());
        const nv = nt.content.slice(nc + 1).trim();
        ctx.pos++;
        map[nk] = _resolveValue(ctx, contIndent, nv, nt.ri);
      }
      result.push(map);
    } else {
      result.push(_parseScalar(afterDash));
    }
  }
  return result;
}

/* ---- value resolution ---- */

function _resolveValue(ctx, parentIndent, vs, rawIdx) {
  if (vs === '') {
    if (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].indent > parentIndent) {
      return _parseNode(ctx, ctx.tokens[ctx.pos].indent);
    }
    return null;
  }
  if (/^[|>][+-]?$/.test(vs)) return _parseBlockScalar(ctx, parentIndent, vs, rawIdx);
  if (vs.startsWith('[')) return _parseFlowSequence(vs);
  if (vs.startsWith('{')) return _parseFlowMapping(vs);
  return _parseScalar(vs);
}

/* ---- block scalar (| and >) ---- */

function _parseBlockScalar(ctx, parentIndent, indicator, afterRawIdx) {
  const isLiteral = indicator.charAt(0) === '|';
  const chomp = indicator.length > 1 ? indicator.charAt(1) : '';
  const lines = [];
  let contentIndent = -1;
  let i = afterRawIdx + 1;

  while (i < ctx.rawLines.length) {
    const raw = ctx.rawLines[i];
    const trimmed = raw.trim();
    if (trimmed === '') {
      if (contentIndent >= 0) lines.push('');
      i++;
      continue;
    }
    const ind = raw.search(/\S/);
    if (ind <= parentIndent) break;
    if (contentIndent < 0) contentIndent = ind;
    if (ind < contentIndent) break;
    lines.push(raw.substring(contentIndent));
    i++;
  }

  while (ctx.pos < ctx.tokens.length && ctx.tokens[ctx.pos].ri < i) ctx.pos++;

  let last = lines.length - 1;
  while (last >= 0 && lines[last] === '') last--;
  const trimmed = lines.slice(0, last + 1);

  if (chomp === '-') {
    return isLiteral ? trimmed.join('\n') : trimmed.join(' ').replace(/\s+/g, ' ').trim();
  }
  if (chomp === '+') {
    return isLiteral ? lines.join('\n') + '\n' : lines.join('\n') + '\n';
  }
  if (trimmed.length === 0) return '';
  return isLiteral ? trimmed.join('\n') + '\n' : trimmed.join(' ').replace(/\s+/g, ' ').trim() + '\n';
}

/* ---- flow collections ---- */

function _parseFlowSequence(str) {
  const inner = str.slice(1, str.lastIndexOf(']')).trim();
  if (!inner) return [];
  return _splitFlowItems(inner).map(s => _parseFlowValue(s.trim()));
}

function _parseFlowMapping(str) {
  const inner = str.slice(1, str.lastIndexOf('}')).trim();
  if (!inner) return {};
  const result = {};
  for (const item of _splitFlowItems(inner)) {
    const ci = item.indexOf(':');
    if (ci < 0) continue;
    result[_unquoteScalar(item.slice(0, ci).trim())] = _parseFlowValue(item.slice(ci + 1).trim());
  }
  return result;
}

function _parseFlowValue(s) {
  if (!s) return null;
  if (s.startsWith('[')) return _parseFlowSequence(s);
  if (s.startsWith('{')) return _parseFlowMapping(s);
  return _parseScalar(s);
}

function _splitFlowItems(str) {
  const items = [];
  let depth = 0, inS = false, inD = false, start = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\\' && (inS || inD)) { i++; continue; }
    if (ch === "'" && !inD) { inS = !inS; continue; }
    if (ch === '"' && !inS) { inD = !inD; continue; }
    if (!inS && !inD) {
      if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') depth--;
      else if (ch === ',' && depth === 0) { items.push(str.slice(start, i)); start = i + 1; }
    }
  }
  if (start < str.length) items.push(str.slice(start));
  return items;
}

/* ---- scalars ---- */

function _findKeyColon(content) {
  let inS = false, inD = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '\\' && (inS || inD)) { i++; continue; }
    if (ch === "'" && !inD) { inS = !inS; continue; }
    if (ch === '"' && !inS) { inD = !inD; continue; }
    if (ch === ':' && !inS && !inD && (i + 1 >= content.length || content[i + 1] === ' ')) {
      return i;
    }
  }
  return -1;
}

function _unquoteScalar(s) {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function _parseScalar(str) {
  const s = str.trim();
  if (s === '' || s === 'null' || s === '~') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  return s;
}
