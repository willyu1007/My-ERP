/**
 * YAML frontmatter parsing utilities (dependency-free)
 *
 * Parses simple YAML frontmatter from Markdown files.
 * Supports flat key-value pairs with optional quoted values.
 *
 * Usage:
 *   import { parseFrontmatter, extractFrontmatterBlock, extractField } from './lib/frontmatter.mjs';
 *
 *   const { front, body } = parseFrontmatter(content);
 *   console.log(front.name, front.description);
 */

/**
 * Parse YAML frontmatter from Markdown content.
 * Supports flat "key: value" pairs with optional quoted values.
 *
 * @param {string} content - Markdown content starting with ---
 * @returns {{ front: Record<string, string>, body: string } | { error: string } | null}
 *          Returns null if no frontmatter found, error object if invalid, or parsed result.
 */
export function parseFrontmatter(content) {
  if (!content || !content.startsWith('---')) return null;

  const idx = content.indexOf('\n---', 3);
  if (idx === -1) return null;

  const raw = content.slice(3, idx).trim().replace(/\r\n/g, '\n');
  const body = content.slice(idx + '\n---'.length).replace(/^\s*\n/, '');

  const front = {};
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;

    // Match "key: value" pattern, allowing colons in the value
    const m = t.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)\s*$/);
    if (!m) {
      return { error: `Invalid frontmatter line: "${line}"` };
    }

    const k = m[1];
    let v = (m[2] ?? '').trim();

    // Remove surrounding quotes if present
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }

    front[k] = v;
  }

  return { front, body };
}

/**
 * Extract the full frontmatter block including delimiters.
 * Useful for stub generation where the entire block needs to be preserved.
 *
 * @param {string} content - Markdown content
 * @returns {{ full: string, yaml: string, rest: string } | null}
 */
export function extractFrontmatterBlock(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;

  const full = match[0];
  const yaml = match[1];
  const rest = content.slice(full.length);

  return { full, yaml, rest };
}

/**
 * Extract a specific field from frontmatter or raw YAML content.
 *
 * @param {string} frontmatter - Frontmatter block or full content
 * @param {string} fieldName - Field to extract (e.g., 'name', 'description')
 * @param {string} fallback - Fallback value if field not found
 * @returns {string}
 */
export function extractField(frontmatter, fieldName, fallback = '') {
  if (!frontmatter) return fallback;

  const re = new RegExp(`^${fieldName}:\\s*(.+)$`, 'm');
  const match = frontmatter.match(re);
  if (!match) return fallback;

  let value = match[1].trim();

  // Remove surrounding quotes
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  return value;
}

/**
 * Generate a frontmatter block from key-value pairs.
 *
 * @param {Record<string, string>} fields - Fields to include
 * @returns {string} - Frontmatter block with --- delimiters
 */
export function generateFrontmatter(fields) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    // Quote values that contain special characters
    const needsQuote = /[:#\[\]{}|>&*!]/.test(value) || value.includes('\n');
    const formatted = needsQuote ? `"${value.replace(/"/g, '\\"')}"` : value;
    lines.push(`${key}: ${formatted}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

/**
 * Check if content has valid frontmatter.
 *
 * @param {string} content - Markdown content
 * @returns {boolean}
 */
export function hasFrontmatter(content) {
  return content && content.startsWith('---') && content.indexOf('\n---', 3) !== -1;
}
