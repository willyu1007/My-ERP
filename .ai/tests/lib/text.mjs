/**
 * text.mjs
 * Text assertion utilities for tests
 */

export function assertIncludes(haystack, needle, message) {
  if (!String(haystack).includes(String(needle))) {
    throw new Error(message || `Expected output to include: ${needle}`);
  }
}

export function assertNotIncludes(haystack, needle, message) {
  if (String(haystack).includes(String(needle))) {
    throw new Error(message || `Expected output to NOT include: ${needle}`);
  }
}
