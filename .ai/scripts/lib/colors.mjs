/**
 * Terminal colors and output utilities (dependency-free)
 *
 * Provides consistent colored terminal output across all scripts.
 * Respects NO_COLOR environment variable and TTY detection.
 *
 * Usage:
 *   import { colors, die, warn, ok, info } from './lib/colors.mjs';
 *
 *   console.log(colors.red('Error message'));
 *   die('Fatal error');  // prints red and exits with code 1
 *   warn('Warning');     // prints yellow
 *   ok('Success');       // prints green
 *   info('Info');        // prints gray
 */

const isColorSupported = process.stdout.isTTY && !process.env.NO_COLOR;

/**
 * ANSI color functions.
 * Returns the string as-is if colors are not supported.
 */
export const colors = {
  red: (s) => (isColorSupported ? `\x1b[31m${s}\x1b[0m` : s),
  green: (s) => (isColorSupported ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s) => (isColorSupported ? `\x1b[33m${s}\x1b[0m` : s),
  blue: (s) => (isColorSupported ? `\x1b[34m${s}\x1b[0m` : s),
  magenta: (s) => (isColorSupported ? `\x1b[35m${s}\x1b[0m` : s),
  cyan: (s) => (isColorSupported ? `\x1b[36m${s}\x1b[0m` : s),
  gray: (s) => (isColorSupported ? `\x1b[90m${s}\x1b[0m` : s),
  bold: (s) => (isColorSupported ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s) => (isColorSupported ? `\x1b[2m${s}\x1b[0m` : s),
};

/**
 * Print an error message in red and exit with the specified code.
 * @param {string} msg - Error message
 * @param {number} exitCode - Exit code (default: 1)
 */
export function die(msg, exitCode = 1) {
  console.error(colors.red(msg));
  process.exit(exitCode);
}

/**
 * Print a warning message in yellow.
 * @param {string} msg - Warning message
 */
export function warn(msg) {
  console.warn(colors.yellow(msg));
}

/**
 * Print a success message in green.
 * @param {string} msg - Success message
 */
export function ok(msg) {
  console.log(colors.green(msg));
}

/**
 * Print an info message in gray.
 * @param {string} msg - Info message
 */
export function info(msg) {
  console.log(colors.gray(msg));
}

/**
 * Print a header/title in cyan.
 * @param {string} msg - Header message
 */
export function header(msg) {
  console.log(colors.cyan(msg));
}
