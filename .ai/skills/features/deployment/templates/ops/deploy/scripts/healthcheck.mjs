#!/usr/bin/env node
/**
 * healthcheck.mjs - Service Health Check
 *
 * Checks the health of deployed services.
 */

import https from 'node:https';
import http from 'node:http';

function parseArgs(args) {
  const result = { flags: {} };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        result.flags[key] = nextArg;
        i++;
      } else {
        result.flags[key] = true;
      }
    }
  }
  return result;
}

function checkHealth(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout }, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve({ ok: true, status: res.statusCode });
      } else {
        resolve({ ok: false, status: res.statusCode });
      }
    });
    
    req.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (parsed.flags.help) {
    console.log(`
healthcheck.mjs - Service Health Check

Usage:
  node ops/deploy/scripts/healthcheck.mjs --url <url>

Options:
  --url <url>       Health check URL (required)
  --timeout <ms>    Timeout in milliseconds (default: 5000)
  --help            Show this help
`);
    return 0;
  }

  const { url, timeout } = parsed.flags;

  if (!url) {
    console.error('Error: --url is required.');
    return 1;
  }

  console.log(`Checking health: ${url}`);
  const result = await checkHealth(url, parseInt(timeout) || 5000);

  if (result.ok) {
    console.log(`[ok] Healthy (status: ${result.status})`);
    return 0;
  } else {
    console.log(`[error] Unhealthy (${result.error || `status: ${result.status}`})`);
    return 1;
  }
}

main().then(code => process.exit(code));
