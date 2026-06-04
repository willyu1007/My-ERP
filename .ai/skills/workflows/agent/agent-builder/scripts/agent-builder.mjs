#!/usr/bin/env node
/**
 * agent-builder.mjs
 *
 * Dependency-free helper for a 5-stage (A–E) agent build flow.
 *
 * Stage A: Interview notes + integration decision (TEMP workdir only; do not write repo)
 * Stage B: Blueprint JSON (TEMP workdir)
 * Stage C: Scaffold agent module + docs + registry (repo writes; no overwrite; registry merge)
 * Stage D: Implement (manual / project-specific)
 * Stage E: Verify + cleanup (delete TEMP workdir)
 *
 * Commands:
 *   - start
 *   - status
 *   - approve
 *   - validate-blueprint
 *   - plan
 *   - apply
 *   - verify
 *   - finish
 *
 * Notes:
 * - This script intentionally has no dependencies other than Node.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function usage(exitCode = 0) {
  const msg = `
agent-builder.mjs

Commands:
  start
    --workdir <path>             Workdir path. Default: create under OS temp dir.
    --repo-root <path>           Repo root to remember (default: cwd). No writes in start.

  status
    --workdir <path>             Workdir path (required unless AGENT_BUILDER_WORKDIR is set)

  approve
    --workdir <path>             Workdir path
    --stage <A|B|C|D|E>           Stage to approve (A and B required before apply)

  validate-blueprint
    --workdir <path>             Workdir path
    --format <text|json>          Output format (default: text)

  plan
    --workdir <path>             Workdir path
    --repo-root <path>           Repo root (default: cwd)

  apply
    --workdir <path>             Workdir path
    --repo-root <path>           Repo root (default: cwd)
    --apply                       Actually write to repo (otherwise dry-run)

  verify
    --workdir <path>             Workdir path
    --repo-root <path>           Repo root (default: cwd)
    --skip-http                  Skip HTTP server-based scenarios (for sandbox/CI)
    --format <text|json>          Output format (default: text)

  finish
    --workdir <path>             Workdir path
    --apply                       Actually delete the workdir (otherwise dry-run)

Examples:
  node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs start
  node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs approve --workdir <WORKDIR> --stage A
  node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs validate-blueprint --workdir <WORKDIR>
  node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs approve --workdir <WORKDIR> --stage B
  node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs plan --workdir <WORKDIR> --repo-root .
  node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs apply --workdir <WORKDIR> --repo-root . --apply
  node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs verify --workdir <WORKDIR> --repo-root .
  node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs verify --workdir <WORKDIR> --repo-root . --skip-http  # for sandbox/CI
  node .ai/skills/workflows/agent/agent-builder/scripts/agent-builder.mjs finish --workdir <WORKDIR> --apply
`;
  console.log(msg.trim());
  process.exit(exitCode);
}

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { _: [] };
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a.startsWith('-')) {
      const key = a.replace(/^--?/, '');
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        out[key] = next;
        i += 2;
      } else {
        out[key] = true;
        i += 1;
      }
    } else {
      out._.push(a);
      i += 1;
    }
  }
  return out;
}

function nowIso() {
  return new Date().toISOString();
}

function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(8).toString('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function safeResolve(repoRoot, relPath) {
  const abs = path.resolve(repoRoot, relPath);
  const root = path.resolve(repoRoot);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new Error(`Unsafe path (escapes repo root): ${relPath}`);
  }
  return abs;
}

function isTempWorkdir(p) {
  const tmp = path.resolve(os.tmpdir());
  const abs = path.resolve(p);
  return abs.startsWith(tmp + path.sep) && abs.includes(`${path.sep}agent-builder${path.sep}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function findFreePort() {
  return await new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = addr && typeof addr === 'object' ? addr.port : null;
      s.close(() => resolve(port));
    });
  });
}

async function httpJson({ method, hostname, port, path: reqPath, headers, body, timeoutMs }) {
  const payload = body ? JSON.stringify(body) : '';
  const h = Object.assign({ 'content-type': 'application/json' }, headers || {});
  if (payload) h['content-length'] = Buffer.byteLength(payload);

  return await new Promise((resolve, reject) => {
    const req = http.request({
      method: method || 'GET',
      hostname: hostname || '127.0.0.1',
      port,
      path: reqPath,
      headers: h,
      timeout: timeoutMs || 5000
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      try { req.destroy(new Error('timeout')); } catch (e) {}
    });
    if (payload) req.write(payload);
    req.end();
  });
}

// ----------------------------
// SSE (Server-Sent Events) client for verify harness
// ----------------------------

async function httpSseCollect({ hostname, port, path: reqPath, method, headers, body, timeoutMs }) {
  const payload = body ? JSON.stringify(body) : '';
  const h = Object.assign({
    'content-type': 'application/json',
    'accept': 'text/event-stream'
  }, headers || {});
  if (payload) h['content-length'] = Buffer.byteLength(payload);

  return await new Promise((resolve, reject) => {
    const events = [];
    let buffer = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { req.destroy(); } catch (e) {}
      resolve({ statusCode: 0, events, timedOut: true });
    }, timeoutMs || 8000);

    const req = http.request({
      method: method || 'POST',
      hostname: hostname || '127.0.0.1',
      port,
      path: reqPath,
      headers: h
    }, (res) => {
      res.setEncoding('utf8');

      res.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const evt = JSON.parse(dataStr);
              events.push(evt);
            } catch (e) {
              // Ignore non-JSON SSE data
            }
          }
        }
      });

      res.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ statusCode: res.statusCode, events });
      });
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    if (payload) req.write(payload);
    req.end();
  });
}

// ----------------------------
// Minimal WebSocket client (dependency-free)
//
// Used by verify harness to test the generated agent's WebSocket streaming endpoint.
// Supports:
// - client handshake
// - sending masked text frames
// - receiving unmasked text frames
// - ping/pong
//
// Limitations (acceptable for verify harness):
// - no permessage-deflate (compression extension)
// - no fragmented messages
// - max frame size: 16MB
// - text frames only (no binary frames)
//
// For production WebSocket testing, consider using a full WS library (e.g., ws, socket.io-client).
// ----------------------------

function wsBuildAcceptValue(secWebSocketKey) {
  return crypto.createHash('sha1')
    .update(String(secWebSocketKey) + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
}

function wsEncodeClientTextFrame(text) {
  const payload = Buffer.from(String(text), 'utf8');
  const len = payload.length;

  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text
    header[1] = 0x80 | len; // masked + length
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];

  return Buffer.concat([header, mask, masked]);
}

function wsEncodeClientCloseFrame() {
  // Close with empty payload
  const header = Buffer.from([0x88, 0x80]); // FIN+close, masked+0
  const mask = crypto.randomBytes(4);
  return Buffer.concat([header, mask]);
}

function wsEncodeClientPongFrame(payloadBuf) {
  const payload = payloadBuf ? Buffer.from(payloadBuf) : Buffer.alloc(0);
  const len = payload.length;

  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x8A; // FIN + pong
    header[1] = 0x80 | len;
  } else {
    header = Buffer.alloc(4);
    header[0] = 0x8A;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  }

  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];

  return Buffer.concat([header, mask, masked]);
}

function wsTryParseFrame(buffer) {
  if (!buffer || buffer.length < 2) return null;

  const b0 = buffer[0];
  const b1 = buffer[1];
  const fin = (b0 & 0x80) !== 0;
  const opcode = b0 & 0x0f;
  const masked = (b1 & 0x80) !== 0;
  let payloadLen = (b1 & 0x7f);
  let offset = 2;

  if (!fin) return { error: 'fragmented_frames_not_supported' };

  if (payloadLen === 126) {
    if (buffer.length < offset + 2) return null;
    payloadLen = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLen === 127) {
    if (buffer.length < offset + 8) return null;
    const big = buffer.readBigUInt64BE(offset);
    const n = Number(big);
    if (!Number.isFinite(n)) return { error: 'payload_too_large' };
    payloadLen = n;
    offset += 8;
  }

  const maskLen = masked ? 4 : 0;
  const frameLen = offset + maskLen + payloadLen;
  if (buffer.length < frameLen) return null;

  let payload = buffer.slice(offset + maskLen, frameLen);

  if (masked) {
    const mask = buffer.slice(offset, offset + 4);
    const out = Buffer.alloc(payloadLen);
    for (let i = 0; i < payloadLen; i++) out[i] = payload[i] ^ mask[i % 4];
    payload = out;
  }

  return {
    frame: { opcode, payload, masked },
    rest: buffer.slice(frameLen)
  };
}

async function wsSendAndCollectJson({ hostname, port, pathname, headers, sendObj, timeoutMs, stopWhen }) {
  const host = hostname || '127.0.0.1';
  const toMs = Number.isFinite(timeoutMs) ? timeoutMs : 8000;

  return await new Promise((resolve, reject) => {
    const socket = net.connect(port, host);
    socket.setNoDelay(true);

    let settled = false;

    function settleResolve(value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Keep an error listener to avoid unhandled ECONNRESET after resolve.
      try { socket.on('error', () => {}); } catch (e) {}
      try { socket.end(); } catch (e) {}
      setTimeout(() => { try { socket.destroy(); } catch (e) {} }, 25);
      resolve(value);
    }

    function settleReject(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.on('error', () => {}); } catch (e) {}
      try { socket.destroy(); } catch (e) {}
      reject(err);
    }

    const key = crypto.randomBytes(16).toString('base64');
    const lines = [
      `GET ${pathname} HTTP/1.1`,
      `Host: ${host}:${port}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Key: ${key}`,
      'Sec-WebSocket-Version: 13'
    ];

    const extraHeaders = headers || {};
    for (const [k, v] of Object.entries(extraHeaders)) {
      // Do not allow overriding critical WS handshake headers
      const kl = String(k).toLowerCase();
      if (['host','upgrade','connection','sec-websocket-key','sec-websocket-version'].includes(kl)) continue;
      lines.push(`${k}: ${v}`);
    }
    lines.push('', '');

    let buffer = Buffer.alloc(0);
    let handshakeDone = false;
    const messages = [];
    const jsonEvents = [];

    const timer = setTimeout(() => {
      settleReject(new Error('ws_timeout'));
    }, toMs);

    function tryDrainFrames() {
      while (true) {
        const parsed = wsTryParseFrame(buffer);
        if (!parsed) return;
        if (parsed.error) {
          settleReject(new Error(parsed.error));
          return;
        }
        buffer = parsed.rest;
        const frame = parsed.frame;

        // opcode 0x1: text, 0x8: close, 0x9: ping
        if (frame.opcode === 0x8) {
          settleResolve({ messages, jsonEvents });
          return;
        }
        if (frame.opcode === 0x9) {
          // ping -> pong
          try { socket.write(wsEncodeClientPongFrame(frame.payload)); } catch (e) {}
          continue;
        }
        if (frame.opcode === 0x1) {
          const txt = frame.payload.toString('utf8');
          messages.push(txt);
          try {
            const j = JSON.parse(txt);
            jsonEvents.push(j);
            if (stopWhen && stopWhen(j, jsonEvents)) {
              // Close politely
              try { socket.write(wsEncodeClientCloseFrame()); } catch (e) {}
              settleResolve({ messages, jsonEvents });
              return;
            }
          } catch (e) {
            // ignore non-json message
          }
        }
      }
    }

    socket.on('error', (err) => {
      if (settled) return;
      settleReject(err);
    });

    socket.on('connect', () => {
      try { socket.write(lines.join('\r\n')); } catch (e) {
        settleReject(e);
      }
    });

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      if (!handshakeDone) {
        const sep = buffer.indexOf('\r\n\r\n');
        if (sep === -1) return;

        const headerText = buffer.slice(0, sep).toString('utf8');
        const rest = buffer.slice(sep + 4);
        buffer = rest;

        const headerLines = headerText.split('\r\n');
        const statusLine = headerLines.shift() || '';
        const m = statusLine.match(/HTTP\/1\.1\s+(\d+)/i);
        const statusCode = m ? Number(m[1]) : 0;

        const h = {};
        for (const ln of headerLines) {
          const idx = ln.indexOf(':');
          if (idx === -1) continue;
          const k = ln.slice(0, idx).trim().toLowerCase();
          const v = ln.slice(idx + 1).trim();
          h[k] = v;
        }

        const expectedAccept = wsBuildAcceptValue(key);
        const gotAccept = h['sec-websocket-accept'];
        if (statusCode !== 101 || gotAccept !== expectedAccept) {
          settleReject(new Error(`ws_handshake_failed status=${statusCode} accept_ok=${gotAccept === expectedAccept}`));
          return;
        }

        handshakeDone = true;

        // Send client message after successful handshake
        try {
          const frame = wsEncodeClientTextFrame(JSON.stringify(sendObj || {}));
          socket.write(frame);
        } catch (e) {
          settleReject(e);
          return;
        }

        // Continue draining any buffered WS frames in the same packet
        tryDrainFrames();
        return;
      }

      // Post-handshake frames
      tryDrainFrames();
    });
  });
}

async function startMockLLMServer() {
  const port = await findFreePort();

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    if (String(req.method || '').toUpperCase() !== 'POST' || !u.pathname.endsWith('/chat/completions')) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }

    const chunks = [];
    for await (const c of req) chunks.push(c);
    const txt = Buffer.concat(chunks).toString('utf8');
    let payload = {};
    try { payload = txt ? JSON.parse(txt) : {}; } catch (e) {}

    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const lastUser = [...messages].reverse().find(m => m && m.role === 'user' && typeof m.content === 'string');
    const lastUserText = lastUser ? lastUser.content : '';

    // Debug hook (verify harness): if user content contains "__debug_messages__",
    // respond with a JSON string describing the message list so we can validate
    // conversation buffering/summary behavior deterministically without a real model.
    const wantsDebug = String(lastUserText || '').includes('__debug_messages__');

    let replyText = '';
    if (wantsDebug) {
      const roles = messages.map(m => (m && m.role) ? String(m.role) : '');
      const hasSummary = messages.some(m =>
        m && m.role === 'developer' && typeof m.content === 'string' && m.content.includes('Conversation summary:')
      );
      replyText = JSON.stringify({
        messages_count: messages.length,
        roles,
        has_summary: hasSummary
      });
    } else {
      replyText = `MOCK_RESPONSE: ${lastUserText}`.trim();
    }

    // Non-streaming response
    if (!payload.stream) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'mock_chatcmpl',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: payload.model || 'mock',
        choices: [
          { index: 0, message: { role: 'assistant', content: replyText }, finish_reason: 'stop' }
        ]
      }));
      return;
    }

    // Streaming (SSE-style) response (best-effort)
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    });

    const parts = replyText.split(/(\s+)/).filter(Boolean);
    for (const p of parts) {
      const chunk = { choices: [{ delta: { content: p } }] };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      await sleep(5);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  });

  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}/v1`,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };
}

async function startAgentHttpServer({ agentDir, env, basePath }) {
  const child = spawn(process.execPath, ['src/adapters/http/server.mjs'], {
    cwd: agentDir,
    env: Object.assign({}, process.env, env || {}),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const logs = { stdout: '', stderr: '' };
  child.stdout.on('data', (d) => { logs.stdout += String(d); });
  child.stderr.on('data', (d) => { logs.stderr += String(d); });

  // Wait until health responds (poll)
  const port = Number(env && env.PORT);
  const bp = String(basePath || '');
  const healthPath = `${bp}/health`;

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const r = await httpJson({ method: 'GET', port, path: healthPath, timeoutMs: 1000 });
      if (r.statusCode === 200) return { child, logs };
    } catch (e) {}
    await sleep(50);
  }

  try { child.kill('SIGKILL'); } catch (e) {}
  throw new Error(`Agent server did not become healthy within timeout. stdout=${logs.stdout} stderr=${logs.stderr}`);
}

async function stopProcess(child) {
  if (!child) return;
  try {
    child.kill('SIGTERM');
  } catch (e) {}
  const waited = await Promise.race([
    new Promise(resolve => child.once('exit', () => resolve(true))),
    sleep(500).then(() => false)
  ]);
  if (!waited) {
    try { child.kill('SIGKILL'); } catch (e) {}
  }
}

function loadTemplatesRoot() {
  // This script lives at .../scripts/agent-builder.mjs
  // Templates live at .../templates/
  return path.join(__dirname, '..', 'templates');
}

function statePath(workdir) {
  return path.join(workdir, '.agent-builder-state.json');
}

function stageKey(letter) {
  const l = String(letter || '').toLowerCase();
  if (!l) return '';
  return `stage-${l}`;
}

function normalizeStateShape(state) {
  if (!state || typeof state !== 'object') return state;

  // Migrate legacy camel-case stage keys -> kebab-case stage-* keys.
  for (const stageLetter of ['A', 'B', 'C', 'D', 'E']) {
    const legacyKey = `stage${stageLetter}`;
    const newKey = stageKey(stageLetter);
    if (state[legacyKey] && !state[newKey]) state[newKey] = state[legacyKey];
    if (state[legacyKey]) delete state[legacyKey];
  }

  // Normalize any legacy stage directory prefixes inside stored paths.
  const stageAState = state[stageKey('A')] || {};
  const stageBState = state[stageKey('B')] || {};
  const stageEState = state[stageKey('E')] || {};

  function replaceStageDirPrefix(value, stageLetter) {
    const legacyDir = `stage${stageLetter}`;
    const newDir = stageKey(stageLetter);
    return String(value || '').replace(new RegExp(`^${legacyDir}/`), `${newDir}/`);
  }

  function replaceStageDirSegment(value, stageLetter) {
    const legacyDir = `stage${stageLetter}`;
    const newDir = stageKey(stageLetter);
    return String(value || '').replace(new RegExp(`/${legacyDir}/`, 'g'), `/${newDir}/`);
  }

  if (typeof stageAState.interview_notes_path === 'string') {
    stageAState.interview_notes_path = replaceStageDirPrefix(stageAState.interview_notes_path, 'A');
  }
  if (typeof stageAState.integration_decision_path === 'string') {
    stageAState.integration_decision_path = replaceStageDirPrefix(stageAState.integration_decision_path, 'A');
  }

  if (typeof stageBState.blueprint_path === 'string') {
    stageBState.blueprint_path = replaceStageDirPrefix(stageBState.blueprint_path, 'B');
  }

  if (typeof stageEState.evidence_path === 'string') {
    stageEState.evidence_path = replaceStageDirSegment(stageEState.evidence_path, 'E');
  }
  if (typeof stageEState.report_path === 'string') {
    stageEState.report_path = replaceStageDirSegment(stageEState.report_path, 'E');
  }

  state[stageKey('A')] = stageAState;
  state[stageKey('B')] = stageBState;
  state[stageKey('E')] = stageEState;

  return state;
}

function loadState(workdir) {
  const p = statePath(workdir);
  if (!exists(p)) die(`State not found: ${p}`);
  return normalizeStateShape(readJson(p));
}

function saveState(workdir, state) {
  writeJson(statePath(workdir), state);
}

function addHistory(state, event, details) {
  state.history = state.history || [];
  state.history.push({ timestamp: nowIso(), event, details });
}

function ensureWorkdir(workdir) {
  if (!workdir) die('Missing --workdir (or set AGENT_BUILDER_WORKDIR).');
  if (!exists(workdir)) die(`Workdir does not exist: ${workdir}`);
}

function getWorkdir(args) {
  return args.workdir || process.env.AGENT_BUILDER_WORKDIR || '';
}

/**
 * Blueprint validation (manual, checklist-aligned).
 * Returns { ok, errors[], warnings[] }.
 */
function validateBlueprint(blueprint) {
  const errors = [];
  const warnings = [];

  function req(cond, msg) { if (!cond) errors.push(msg); }
  function warn(cond, msg) { if (!cond) warnings.push(msg); }

  if (!blueprint || typeof blueprint !== 'object') {
    return { ok: false, errors: ['Blueprint must be a JSON object.'], warnings };
  }

  req(blueprint.kind === 'agent_blueprint', 'kind must be "agent_blueprint".');
  req(Number.isInteger(blueprint.version) && blueprint.version >= 1, 'version must be an integer >= 1.');

  const mustBlocks = [
    'meta','agent','scope','integration','interfaces','api','schemas','contracts','model',
    'configuration','conversation','budgets','data_flow','observability','security','acceptance','deliverables'
  ];
  for (const b of mustBlocks) req(blueprint[b] && typeof blueprint[b] === 'object', `Missing required block: ${b}`);

  // Meta
  const meta = blueprint.meta || {};
  req(typeof meta.generated_at === 'string' && meta.generated_at.trim(), 'meta.generated_at is required (ISO timestamp string).');

  // Agent
  const agent = blueprint.agent || {};
  req(typeof agent.id === 'string' && agent.id.trim(), 'agent.id is required (string).');
  req(typeof agent.name === 'string' && agent.name.trim(), 'agent.name is required (string).');
  req(typeof agent.summary === 'string' && agent.summary.trim(), 'agent.summary is required (string).');
  req(Array.isArray(agent.owners) && agent.owners.length > 0, 'agent.owners must be a non-empty array.');
  for (let i = 0; i < (agent.owners || []).length; i++) {
    const o = agent.owners[i];
    if (!o) continue;
    req(['person','team','service'].includes(o.type), `agent.owners[${i}].type must be person|team|service.`);
    req(typeof o.id === 'string' && o.id.trim(), `agent.owners[${i}].id is required (string).`);
  }

  // Scope
  const scope = blueprint.scope || {};
  req(Array.isArray(scope.in_scope) && scope.in_scope.length > 0, 'scope.in_scope must be a non-empty array.');
  req(Array.isArray(scope.out_of_scope), 'scope.out_of_scope is required (array).');
  req(typeof scope.definition_of_done === 'string' && scope.definition_of_done.trim(), 'scope.definition_of_done is required (string).');

  const integration = blueprint.integration || {};
  req(integration.primary === 'api', 'integration.primary must be "api" (v1).');

  const attach = Array.isArray(integration.attach) ? integration.attach : [];
  const allowedAttach = new Set(['worker','sdk','cron','pipeline']);
  for (const a of attach) req(allowedAttach.has(a), `integration.attach contains unsupported value: ${a}`);

  const trig = integration.trigger || {};
  req(['sync_request','async_event','scheduled','manual','batch'].includes(trig.kind), 'integration.trigger.kind is required and must be a known enum.');

  const tgt = integration.target || {};
  req(typeof tgt.name === 'string' && tgt.name.trim(), 'integration.target.name is required (string).');
  req(['service','repo_module','pipeline_step','queue','topic','job','function','other'].includes(tgt.kind), 'integration.target.kind must be a known enum.');

  const fail = integration.failure_contract || {};
  req(['propagate_error','return_fallback','enqueue_retry'].includes(fail.mode), 'integration.failure_contract.mode must be a known enum.');
  // Explicitly disallow suppression modes
  req(fail.mode !== 'suppress_and_alert', 'integration.failure_contract.mode must not be suppress_and_alert.');

  const rollback = integration.rollback_or_disable || {};
  req(['feature_flag','config_toggle','route_switch','deployment_rollback'].includes(rollback.method), 'integration.rollback_or_disable.method must be a known enum.');

  // Contract refs (schemaRef pattern: #/schemas/Name)
  const schemaRefPattern = /^#\/schemas\/[A-Za-z0-9_]+$/;
  req(typeof integration.upstream_contract_ref === 'string' && schemaRefPattern.test(integration.upstream_contract_ref),
    'integration.upstream_contract_ref is required (format: #/schemas/Name).');
  req(typeof integration.downstream_contract_ref === 'string' && schemaRefPattern.test(integration.downstream_contract_ref),
    'integration.downstream_contract_ref is required (format: #/schemas/Name).');

  // API validation
  const api = blueprint.api || {};
  // v1 scaffold only supports HTTP.
  req(['http'].includes(api.protocol), 'api.protocol must be http.');
  req(typeof api.base_path === 'string' && api.base_path.startsWith('/'), 'api.base_path must be a non-empty path starting with "/".');
  req(Number.isInteger(api.timeout_budget_ms) && api.timeout_budget_ms > 0, 'api.timeout_budget_ms must be a positive integer.');

  const auth = api.auth || {};
  req(['none','api_key','bearer_token','oauth2','mtls','internal_gateway'].includes(auth.kind), 'api.auth.kind must be a known enum.');
  const degradation = api.degradation || {};
  req(['none','return_fallback','return_unavailable','route_to_worker'].includes(degradation.mode), 'api.degradation.mode must be a known enum.');

  // Routes must include run+health names and those names are fixed (no others in v1).
  const routes = Array.isArray(api.routes) ? api.routes : [];
  req(routes.length >= 2, 'api.routes must include at least run and health.');
  const routeNames = new Set(routes.map(r => r && r.name));
  req(routeNames.has('run'), 'api.routes must include name="run".');
  req(routeNames.has('health'), 'api.routes must include name="health".');
  for (const r of routes) {
    if (!r) continue;
    req(['run','health'].includes(r.name), `api.routes.name must be run|health (got ${r.name}).`);
    req(typeof r.path === 'string' && r.path.startsWith('/'), `api.routes[].path must start with "/": ${r.name}`);
    req(['get','post','put','patch','delete'].includes(String(r.method || '').toLowerCase()), `api.routes[].method invalid: ${r.name}`);
    req(typeof r.request_schema_ref === 'string' && schemaRefPattern.test(r.request_schema_ref),
      `api.routes[${r.name}].request_schema_ref must be format #/schemas/Name (got "${r.request_schema_ref}").`);
    req(typeof r.response_schema_ref === 'string' && schemaRefPattern.test(r.response_schema_ref),
      `api.routes[${r.name}].response_schema_ref must be format #/schemas/Name (got "${r.response_schema_ref}").`);
    req(typeof r.error_schema_ref === 'string' && schemaRefPattern.test(r.error_schema_ref),
      `api.routes[${r.name}].error_schema_ref must be format #/schemas/Name (got "${r.error_schema_ref}").`);
  }

  // Schemas must exist
  const schemas = blueprint.schemas || {};
  req(!!schemas.RunRequest, 'schemas.RunRequest is required.');
  req(!!schemas.RunResponse, 'schemas.RunResponse is required.');
  req(!!schemas.AgentError, 'schemas.AgentError is required.');

  // Contracts
  const contracts = blueprint.contracts || {};
  req(typeof contracts.version === 'string' && contracts.version.trim(), 'contracts.version is required (string).');
  req(['strict','additive_only','backward_compatible'].includes(contracts.compatibility_policy), 'contracts.compatibility_policy must be a known enum.');

  // Model
  const model = blueprint.model || {};
  req(model.primary && typeof model.primary === 'object', 'model.primary is required.');
  req(model.primary && model.primary.provider && typeof model.primary.provider === 'object', 'model.primary.provider is required.');
  req(model.primary && model.primary.provider && ['openai','openai_compatible','azure_openai','internal_gateway','local'].includes(model.primary.provider.type),
    'model.primary.provider.type must be openai|openai_compatible|azure_openai|internal_gateway|local.');
  req(model.primary && typeof model.primary.model === 'string' && model.primary.model.trim(), 'model.primary.model is required (string).');

  // Configuration env vars
  const cfg = blueprint.configuration || {};
  const envVars = Array.isArray(cfg.env_vars) ? cfg.env_vars : [];
  req(envVars.length > 0, 'configuration.env_vars must be a non-empty array.');
  const envNames = new Set();
  for (const ev of envVars) {
    if (!ev) continue;
    req(typeof ev.name === 'string' && ev.name.trim(), 'configuration.env_vars[].name is required.');
    req(typeof ev.description === 'string' && ev.description.trim(), `configuration.env_vars[${ev.name}].description is required.`);
    req(typeof ev.required === 'boolean', `configuration.env_vars[${ev.name}].required must be boolean.`);
    req(['public','internal','secret'].includes(ev.sensitivity), `configuration.env_vars[${ev.name}].sensitivity must be public|internal|secret.`);
    req(typeof ev.example_placeholder === 'string', `configuration.env_vars[${ev.name}].example_placeholder is required.`);
    if (envNames.has(ev.name)) errors.push(`Duplicate env var name: ${ev.name}`);
    envNames.add(ev.name);
  }
  // Kill switch must be present and required
  const kill = envVars.find(v => v && v.name === 'AGENT_ENABLED');
  req(!!kill, 'configuration.env_vars must include AGENT_ENABLED.');
  req(kill && kill.required === true, 'AGENT_ENABLED must be required=true.');

  // Conversation
  const conv = blueprint.conversation || {};
  req(['no-need','buffer','buffer_window','summary','summary_buffer'].includes(conv.mode), 'conversation.mode must be a known enum.');
  if (conv.mode !== 'no-need') {
    warn(typeof conv.scope === 'string', 'conversation.scope is recommended when conversation.mode != no-need.');
    warn(conv.storage && typeof conv.storage.kind === 'string', 'conversation.storage.kind is recommended when conversation.mode != no-need.');
    if (conv.storage && typeof conv.storage.kind === 'string') {
      warn(['none','in_memory','file','kv_store','database'].includes(conv.storage.kind), 'conversation.storage.kind must be a known enum when provided.');
      // NOTE: The scaffold runtime implements none/in_memory/file only.
      if (['kv_store','database'].includes(conv.storage.kind)) {
        warnings.push(`[STAGE_D_REQUIRED] conversation.storage.kind="${conv.storage.kind}" is not implemented in the scaffold. You MUST implement a custom store adapter in Stage D (see reference/stage_d_implementation_guide.md). Consider using "in_memory" or "file" for prototyping.`);
      }
    }
  }
  if (['summary','summary_buffer'].includes(conv.mode)) {
    const s = conv.summary || {};
    req(['llm','heuristic'].includes(s.update_method || 'llm'), 'conversation.summary.update_method must be llm|heuristic.');
    if ((s.update_method || 'llm') === 'heuristic') {
      warnings.push('[STAGE_D_REQUIRED] conversation.summary.update_method="heuristic" is not implemented in the scaffold. Summaries will NOT auto-update. You MUST implement heuristic summary logic in Stage D, or change to update_method="llm".');
    }
    req(['every_turn','threshold','periodic'].includes(s.refresh_policy || 'threshold'), 'conversation.summary.refresh_policy must be every_turn|threshold|periodic.');
    req(['after_turn','async_post_turn'].includes(s.update_timing || 'after_turn'), 'conversation.summary.update_timing must be after_turn|async_post_turn.');
    if ((s.refresh_policy || 'threshold') === 'threshold') {
      const thr = s.threshold || {};
      const hasToken = Number.isInteger(thr.max_tokens_since_update) && thr.max_tokens_since_update > 0;
      const hasTurns = Number.isInteger(thr.max_turns_since_update) && thr.max_turns_since_update > 0;
      req(hasToken || hasTurns, 'conversation.summary.threshold must set max_tokens_since_update and/or max_turns_since_update when refresh_policy=threshold.');
      warn(hasToken, 'Token-first default: set conversation.summary.threshold.max_tokens_since_update (recommended).');
    }
    if (conv.mode === 'summary_buffer') {
      const sb = conv.summary_buffer || {};
      req((Number.isInteger(sb.window_turns) && sb.window_turns > 0) || (Number.isInteger(sb.window_tokens) && sb.window_tokens > 0),
        'conversation.summary_buffer must set window_turns and/or window_tokens.');
    }
  }

  // Budgets
  const budgets = blueprint.budgets || {};
  req(budgets.latency_ms && typeof budgets.latency_ms === 'object', 'budgets.latency_ms is required.');
  req(budgets.throughput && typeof budgets.throughput === 'object', 'budgets.throughput is required.');

  // Data flow
  const df = blueprint.data_flow || {};
  req(Array.isArray(df.data_classes) && df.data_classes.length > 0, 'data_flow.data_classes must be a non-empty array.');
  const allowedDataClasses = ['PII','confidential','internal','public','unknown'];
  for (const dc of (df.data_classes || [])) {
    req(allowedDataClasses.includes(dc), `data_flow.data_classes contains invalid value "${dc}". Must be PII|confidential|internal|public|unknown.`);
  }
  req(df.llm_egress && typeof df.llm_egress === 'object', 'data_flow.llm_egress is required.');
  req(df.llm_egress && typeof df.llm_egress.what_is_sent === 'string' && df.llm_egress.what_is_sent.trim(), 'data_flow.llm_egress.what_is_sent is required (string).');

  // Observability
  const obs = blueprint.observability || {};
  const logs = obs.logs || {};
  req(Array.isArray(logs.required_fields) && logs.required_fields.length > 0, 'observability.logs.required_fields must be a non-empty array.');

  // Security
  const sec = blueprint.security || {};
  req(['read_only_only','writes_require_approval','writes_allowed'].includes(sec.side_effect_policy), 'security.side_effect_policy must be a known enum.');

  // Tools (schema refs validated later)
  const tools = (blueprint.tools && Array.isArray(blueprint.tools.tools)) ? blueprint.tools.tools : [];

  // Acceptance scenarios
  const acc = blueprint.acceptance || {};
  const scenarios = Array.isArray(acc.scenarios) ? acc.scenarios : [];
  req(scenarios.length >= 2, 'acceptance.scenarios must have at least 2 scenarios.');
  const allowedScenarioKinds = [
    'http_health','http_run','http_conversation_debug',
    'ws_streaming','sse_streaming',
    'pipeline','cron','worker','sdk'
  ];
  for (let si = 0; si < scenarios.length; si++) {
    const s = scenarios[si];
    if (!s) continue;
    req(typeof s.title === 'string' && s.title.trim(), `acceptance.scenarios[${si}].title is required.`);
    req(typeof s.given === 'string' && s.given.trim(), `acceptance.scenarios[${si}].given is required.`);
    req(typeof s.when === 'string' && s.when.trim(), `acceptance.scenarios[${si}].when is required.`);
    req(typeof s.then === 'string' && s.then.trim(), `acceptance.scenarios[${si}].then is required.`);
    req(Array.isArray(s.expected_output_checks) && s.expected_output_checks.length > 0,
      `acceptance.scenarios[${si}].expected_output_checks must be a non-empty array.`);
    req(['P0','P1','P2'].includes(s.priority), `acceptance.scenarios[${si}].priority must be P0|P1|P2.`);
    if (s.kind !== undefined && s.kind !== null && String(s.kind).trim() !== '') {
      req(allowedScenarioKinds.includes(String(s.kind).trim()), `acceptance.scenarios[${si}].kind must be a supported enum when provided.`);
    }
  }

  // Deliverables
  const del = blueprint.deliverables || {};
  req(typeof del.agent_module_path === 'string' && del.agent_module_path.trim(), 'deliverables.agent_module_path is required (string).');
  req(typeof del.docs_path === 'string' && del.docs_path.trim(), 'deliverables.docs_path is required (string).');
  req(typeof del.registry_path === 'string' && del.registry_path.trim(), 'deliverables.registry_path is required (string).');
  req(del.core_adapter_separation === 'required', 'deliverables.core_adapter_separation must be "required".');

  // Tools validation (if present)
  for (let ti = 0; ti < tools.length; ti++) {
    const t = tools[ti];
    if (!t) continue;
    req(typeof t.id === 'string' && t.id.trim(), `tools.tools[${ti}].id is required.`);
    req(['http_api','database','queue','filesystem','mcp_server','internal_service','other'].includes(t.kind),
      `tools.tools[${ti}].kind must be a known enum.`);
    req(['read_only','write','destructive'].includes(t.side_effect_level),
      `tools.tools[${ti}].side_effect_level must be read_only|write|destructive.`);
    req(typeof t.input_schema_ref === 'string' && schemaRefPattern.test(t.input_schema_ref),
      `tools.tools[${ti}].input_schema_ref is required (format: #/schemas/Name).`);
    req(typeof t.output_schema_ref === 'string' && schemaRefPattern.test(t.output_schema_ref),
      `tools.tools[${ti}].output_schema_ref is required (format: #/schemas/Name).`);
    req(typeof t.error_schema_ref === 'string' && schemaRefPattern.test(t.error_schema_ref),
      `tools.tools[${ti}].error_schema_ref is required (format: #/schemas/Name).`);
    req(t.timeouts && Number.isInteger(t.timeouts.timeout_ms) && t.timeouts.timeout_ms >= 0,
      `tools.tools[${ti}].timeouts.timeout_ms is required (integer >= 0).`);
    req(t.retry && Number.isInteger(t.retry.max_attempts) && t.retry.max_attempts >= 0,
      `tools.tools[${ti}].retry.max_attempts is required (integer >= 0).`);
    req(t.retry && ['fixed','exponential','exponential_jitter'].includes(t.retry.backoff),
      `tools.tools[${ti}].retry.backoff must be fixed|exponential|exponential_jitter.`);
    req(t.idempotency && ['none','header','payload_field','hash_payload','external_key'].includes(t.idempotency.strategy),
      `tools.tools[${ti}].idempotency.strategy must be a known enum.`);
    req(t.audit && typeof t.audit.required === 'boolean',
      `tools.tools[${ti}].audit.required is required (boolean).`);
  }

  // Attachment blocks required if enabled
  function hasAttach(x) { return attach.includes(x); }
  if (hasAttach('worker')) req(blueprint.worker && typeof blueprint.worker === 'object', 'worker block required when attach includes worker.');
  if (hasAttach('sdk')) req(blueprint.sdk && typeof blueprint.sdk === 'object', 'sdk block required when attach includes sdk.');
  if (hasAttach('cron')) req(blueprint.cron && typeof blueprint.cron === 'object', 'cron block required when attach includes cron.');
  if (hasAttach('pipeline')) req(blueprint.pipeline && typeof blueprint.pipeline === 'object', 'pipeline block required when attach includes pipeline.');

  // Worker block validation
  if (hasAttach('worker') && blueprint.worker) {
    const w = blueprint.worker;
    req(w.source && ['file_queue','queue','topic','task_table','cron','webhook'].includes(w.source.kind),
      'worker.source.kind must be a known enum.');
    req(w.source && typeof w.source.name === 'string' && w.source.name.trim(),
      'worker.source.name is required (string).');
    req(w.execution && Number.isInteger(w.execution.max_concurrency) && w.execution.max_concurrency >= 0,
      'worker.execution.max_concurrency is required (integer >= 0).');
    req(w.execution && Number.isInteger(w.execution.timeout_ms) && w.execution.timeout_ms >= 0,
      'worker.execution.timeout_ms is required (integer >= 0).');
    req(w.retry && Number.isInteger(w.retry.max_attempts) && w.retry.max_attempts >= 0,
      'worker.retry.max_attempts is required (integer >= 0).');
    req(w.retry && ['fixed','exponential','exponential_jitter'].includes(w.retry.backoff),
      'worker.retry.backoff must be fixed|exponential|exponential_jitter.');
    req(w.idempotency && ['none','header','payload_field','hash_payload','external_key'].includes(w.idempotency.strategy),
      'worker.idempotency.strategy must be a known enum.');
    req(w.failure && w.failure.dead_letter && ['none','queue','topic','table','directory'].includes(w.failure.dead_letter.kind),
      'worker.failure.dead_letter.kind must be a known enum.');
    req(w.failure && ['always','after_retries','never'].includes(w.failure.alert_on),
      'worker.failure.alert_on must be always|after_retries|never.');
  }

  // SDK block validation
  if (hasAttach('sdk') && blueprint.sdk) {
    const s = blueprint.sdk;
    req(['typescript','python','go','java','dotnet'].includes(s.language),
      'sdk.language must be typescript|python|go|java|dotnet.');
    req(s.package && typeof s.package.name === 'string' && s.package.name.trim(),
      'sdk.package.name is required (string).');
    req(s.package && typeof s.package.version === 'string' && s.package.version.trim(),
      'sdk.package.version is required (string).');
    req(Array.isArray(s.exports) && s.exports.length > 0,
      'sdk.exports must be a non-empty array.');
    for (let ei = 0; ei < (s.exports || []).length; ei++) {
      const e = s.exports[ei];
      if (!e) continue;
      req(typeof e.name === 'string' && e.name.trim(), `sdk.exports[${ei}].name is required.`);
      req(typeof e.input_schema_ref === 'string' && schemaRefPattern.test(e.input_schema_ref),
        `sdk.exports[${ei}].input_schema_ref is required.`);
      req(typeof e.output_schema_ref === 'string' && schemaRefPattern.test(e.output_schema_ref),
        `sdk.exports[${ei}].output_schema_ref is required.`);
      req(typeof e.error_schema_ref === 'string' && schemaRefPattern.test(e.error_schema_ref),
        `sdk.exports[${ei}].error_schema_ref is required.`);
    }
    req(s.compatibility && ['strict','relaxed'].includes(s.compatibility.semver),
      'sdk.compatibility.semver must be strict|relaxed.');
    req(s.compatibility && typeof s.compatibility.breaking_change_policy === 'string' && s.compatibility.breaking_change_policy.trim(),
      'sdk.compatibility.breaking_change_policy is required (string).');
  }

  // Cron block validation
  if (hasAttach('cron') && blueprint.cron) {
    const c = blueprint.cron;
    req(typeof c.schedule === 'string' && c.schedule.trim(),
      'cron.schedule is required (cron expression or schedule descriptor).');
    req(c.input && ['env_json','file','none'].includes(c.input.kind),
      'cron.input.kind must be env_json|file|none.');
    req(c.output && ['stdout','file','none'].includes(c.output.kind),
      'cron.output.kind must be stdout|file|none.');
  }

  // Pipeline block validation
  if (hasAttach('pipeline') && blueprint.pipeline) {
    const p = blueprint.pipeline;
    req(['ci','etl','data_pipeline','build','deploy','other'].includes(p.context),
      'pipeline.context must be ci|etl|data_pipeline|build|deploy|other.');
    req(['stdin','file'].includes(p.input_channel),
      'pipeline.input_channel must be stdin|file.');
    req(['stdout','file'].includes(p.output_channel),
      'pipeline.output_channel must be stdout|file.');
  }

  // Interfaces must include http and each attachment type.
  const ifaces = Array.isArray(blueprint.interfaces) ? blueprint.interfaces : [];
  const ifaceTypes = new Set(ifaces.map(i => i && i.type));
  req(ifaceTypes.has('http'), 'interfaces must include a type="http" interface.');
  for (const a of attach) req(ifaceTypes.has(a), `interfaces must include a type="${a}" interface because attach includes ${a}.`);

  // Interfaces validation
  for (const i of ifaces) {
    if (!i) continue;
    req(['http','worker','sdk','cron','pipeline','cli'].includes(i.type), `interfaces[].type invalid: ${i.type}`);
    req(typeof i.entrypoint === 'string' && i.entrypoint.trim(), `interfaces[${i.type}].entrypoint is required (string).`);
    req(typeof i.request_schema_ref === 'string' && schemaRefPattern.test(i.request_schema_ref),
      `interfaces[${i.type}].request_schema_ref is required (format: #/schemas/Name).`);
    req(typeof i.response_schema_ref === 'string' && schemaRefPattern.test(i.response_schema_ref),
      `interfaces[${i.type}].response_schema_ref is required (format: #/schemas/Name).`);
    req(typeof i.error_schema_ref === 'string' && schemaRefPattern.test(i.error_schema_ref),
      `interfaces[${i.type}].error_schema_ref is required (format: #/schemas/Name).`);
    req(['blocking','streaming','async'].includes(i.response_mode), `interfaces[${i.type}].response_mode invalid.`);
    req(['none','progress','debug'].includes(i.exposure_level), `interfaces[${i.type}].exposure_level invalid.`);
    if (i.type === 'http' && i.response_mode === 'streaming') {
      const protocol = i.streaming && i.streaming.protocol ? i.streaming.protocol : 'websocket';
      req(['websocket','sse','chunked_jsonl'].includes(protocol), 'interfaces[http].streaming.protocol must be websocket|sse|chunked_jsonl.');
      warn(!!(i.streaming && i.streaming.event_schema_ref), 'interfaces[http].streaming.event_schema_ref is recommended.');
      // If streaming, RunEvent schema should exist
      req(!!schemas.RunEvent, 'schemas.RunEvent is required when http interface is streaming.');
    }
  }

  // Schema refs must resolve
  const refs = [];
  function pushRef(r) { if (typeof r === 'string' && r.startsWith('#/schemas/')) refs.push(r); }
  for (const i of ifaces) {
    if (!i) continue;
    pushRef(i.request_schema_ref); pushRef(i.response_schema_ref); pushRef(i.error_schema_ref);
    if (i.streaming) pushRef(i.streaming.event_schema_ref);
  }
  for (const r of routes) {
    if (!r) continue;
    pushRef(r.request_schema_ref); pushRef(r.response_schema_ref); pushRef(r.error_schema_ref);
  }
  for (const t of tools) {
    if (!t) continue;
    pushRef(t.input_schema_ref); pushRef(t.output_schema_ref); pushRef(t.error_schema_ref);
  }
  const missing = [];
  for (const r of refs) {
    const name = r.replace('#/schemas/', '');
    if (!(name in schemas)) missing.push(r);
  }
  for (const m of missing) errors.push(`Schema ref does not resolve: ${m}`);

  // Warn if prompting tier missing
  const prompting = blueprint.prompting || {};
  warn(!!prompting.complexity_tier, 'prompting.complexity_tier is recommended (tier1|tier2|tier3).');

  return { ok: errors.length === 0, errors, warnings };
}

function renderTemplate(content, ctx) {
  return content.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (m, key) => {
    if (key in ctx) return String(ctx[key]);
    return m;
  });
}

function listFilesRecursive(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(p));
    else out.push(p);
  }
  return out;
}

function buildContextFromBlueprint(bp) {
  const agentId = bp.agent.id;
  const agentName = bp.agent.name;
  const apiBasePath = bp.api.base_path;
  const sdkPkgName = (bp.sdk && bp.sdk.package && bp.sdk.package.name) ? bp.sdk.package.name : agentId;
  const sdkPkgVer = (bp.sdk && bp.sdk.package && bp.sdk.package.version) ? bp.sdk.package.version : '0.1.0';

  const sampleReq = {
    contract_version: bp.contracts.version,
    request_id: 'req_123',
    input: 'Hello world'
  };

  return {
    agent_id: agentId,
    agent_name: agentName,
    agent_summary: bp.agent.summary,
    api_base_path: apiBasePath,
    sdk_package_name: sdkPkgName,
    sdk_package_version: sdkPkgVer,
    pipeline_sample_request_json: JSON.stringify(sampleReq).replace(/"/g, '\\"')
  };
}

function formatList(items) {
  if (!items || !items.length) return '- (none)\n';
  return items.map(x => `- ${x}`).join('\n') + '\n';
}

function buildDocsContext(bp) {
  const owners = bp.agent.owners || [];
  const ownersList = owners.map(o => `- ${o.type}: ${o.id}${o.contact ? ` (${o.contact})` : ''}`).join('\n') + '\n';

  const attachList = (bp.integration.attach || []).join(', ') || '(none)';

  const entrypoints = (bp.interfaces || []).map(i => `| ${i.type} | ${i.response_mode} | ${i.entrypoint} |`).join('\n');
  const entrypointsTable = `| interface | response_mode | entrypoint |\n|---|---|---|\n${entrypoints}\n`;

  const envVars = (bp.configuration.env_vars || []).map(v => `| ${v.name} | ${v.required ? 'yes' : 'no'} | ${v.sensitivity} | ${v.description} |`).join('\n');
  const envVarsTable = `| name | required | sensitivity | description |\n|---|---|---|\n${envVars}\n`;

  const cfgFiles = (bp.configuration.config_files || []).map(f => `- ${f.path}: ${f.description}`).join('\n') + '\n';

  const scenarios = (bp.acceptance.scenarios || []).map((s, idx) =>
    `${idx + 1}. **${s.title}** (${s.priority})\n   - Given: ${s.given}\n   - When: ${s.when}\n   - Then: ${s.then}\n   - Checks: ${Array.isArray(s.expected_output_checks) ? s.expected_output_checks.join('; ') : ''}\n`
  ).join('\n');

  const alerts = (bp.observability.alerts || []).map(a => `- ${a.name} (${a.severity || 'unknown'}): ${a.condition || ''}`).join('\n') + '\n';
  const logFields = (bp.observability.logs && bp.observability.logs.required_fields) ? bp.observability.logs.required_fields.map(f => `- ${f}`).join('\n') + '\n' : '- (none)\n';

  const conv = bp.conversation || {};
  const sumNotes = ['summary','summary_buffer'].includes(conv.mode)
    ? `- update_method: ${conv.summary?.update_method || 'llm'}\n- refresh_policy: ${conv.summary?.refresh_policy || 'threshold'}\n- update_timing: ${conv.summary?.update_timing || 'after_turn'}\n`
    : '(not applicable)\n';

  const workerNotes = (bp.integration.attach || []).includes('worker') ? `Enabled. source=${bp.worker?.source?.kind || ''}` : '(not enabled)\n';
  const cronNotes = (bp.integration.attach || []).includes('cron') ? `Enabled. schedule=${bp.cron?.schedule || ''}` : '(not enabled)\n';
  const pipelineNotes = (bp.integration.attach || []).includes('pipeline') ? `Enabled. context=${bp.pipeline?.context || ''}` : '(not enabled)\n';
  const sdkNotes = (bp.integration.attach || []).includes('sdk') ? `Enabled. package=${bp.sdk?.package?.name || ''}` : '(not enabled)\n';

  const apiHealth = (bp.api.routes || []).find(r => r.name === 'health');
  const apiRun = (bp.api.routes || []).find(r => r.name === 'run');

  return {
    agent_id: bp.agent.id,
    agent_name: bp.agent.name,
    agent_summary: bp.agent.summary,
    owners_list: ownersList,
    attach_list: attachList,
    entrypoints_table: entrypointsTable,
    in_scope_list: formatList(bp.scope.in_scope || []),
    out_of_scope_list: formatList(bp.scope.out_of_scope || []),
    definition_of_done: bp.scope.definition_of_done || '',
    integration_target_kind: bp.integration.target?.kind || '',
    integration_target_name: bp.integration.target?.name || '',
    integration_target_details: bp.integration.target?.details || '',
    integration_trigger_kind: bp.integration.trigger?.kind || '',
    api_base_path: bp.api.base_path,
    api_health_path: apiHealth ? apiHealth.path : '/health',
    api_run_path: apiRun ? apiRun.path : '/run',
    failure_mode: bp.integration.failure_contract?.mode || '',
    rollback_method: bp.integration.rollback_or_disable?.method || '',
    rollback_notes: bp.integration.rollback_or_disable?.notes || '',
    env_vars_table: envVarsTable,
    config_files_list: cfgFiles,
    data_classes: (bp.data_flow.data_classes || []).join(', '),
    llm_egress_notes: bp.data_flow.llm_egress?.what_is_sent || '',
    conversation_mode: conv.mode || 'no-need',
    conversation_scope: conv.scope || '',
    conversation_storage_kind: conv.storage?.kind || '',
    conversation_ttl_seconds: conv.retention?.ttl_seconds || 0,
    conversation_max_items: conv.retention?.max_items || 0,
    conversation_redaction_mode: conv.redaction?.mode || 'none',
    conversation_summary_notes: sumNotes,
    retention_notes: bp.data_flow.retention?.notes || '',
    log_fields_list: logFields,
    alerts_list: alerts,
    latency_p50: bp.budgets.latency_ms?.p50 || 0,
    latency_p95: bp.budgets.latency_ms?.p95 || 0,
    timeout_budget: bp.budgets.latency_ms?.timeout_budget_ms || bp.api.timeout_budget_ms || 0,
    throughput_rps: bp.budgets.throughput?.rps || 0,
    throughput_concurrency: bp.budgets.throughput?.concurrency || 0,
    max_input_tokens: bp.budgets.tokens?.max_input_tokens || 0,
    max_output_tokens: bp.budgets.tokens?.max_output_tokens || 0,
    max_usd_per_task: bp.budgets.cost?.max_usd_per_task || 0,
    acceptance_scenarios_list: scenarios,
    worker_notes: workerNotes,
    cron_notes: cronNotes,
    pipeline_notes: pipelineNotes,
    sdk_notes: sdkNotes
  };
}

function sanitizeManifest(bp) {
  // Keep blueprint-like structure but remove obviously irrelevant items (no secrets should exist anyway).
  const m = JSON.parse(JSON.stringify(bp));
  return m;
}

function planScaffold(bp, repoRoot) {
  const plan = [];

  const agentDir = safeResolve(repoRoot, bp.deliverables.agent_module_path);
  const docsDir = safeResolve(repoRoot, bp.deliverables.docs_path);
  const registryPath = safeResolve(repoRoot, bp.deliverables.registry_path);

  // Agent kit templates
  const templatesRoot = loadTemplatesRoot();
  const kitRoot = path.join(templatesRoot, 'agent-kit', 'node', 'layout');
  const ctx = buildContextFromBlueprint(bp);

  const kitFiles = listFilesRecursive(kitRoot);
  for (const f of kitFiles) {
    const rel = path.relative(kitRoot, f);
    const outRel = rel.endsWith('.template') ? rel.replace(/\.template$/, '') : rel;
    plan.push({ action: 'create', path: path.join(agentDir, outRel) });
  }

  // Prompts
  const tier = (bp.prompting && bp.prompting.complexity_tier) ? bp.prompting.complexity_tier : 'tier2';
  const promptSrc = path.join(templatesRoot, 'prompt-pack', tier);
  const promptFiles = exists(promptSrc) ? listFilesRecursive(promptSrc) : [];
  for (const f of promptFiles) {
    const rel = path.relative(promptSrc, f);
    plan.push({ action: 'create', path: path.join(agentDir, 'prompts', rel) });
  }

  // Schemas
  for (const [name, schemaObj] of Object.entries(bp.schemas || {})) {
    plan.push({ action: 'create', path: path.join(agentDir, 'schemas', `${name}.schema.json`) });
  }

  // Manifest copy
  plan.push({ action: 'create', path: path.join(agentDir, 'config', 'agent.manifest.json') });

  // .env.example is provided by the agent-kit template and is finalized in applyScaffold.

  // Docs
  const docsTemplates = path.join(templatesRoot, 'docs');
  const docFiles = listFilesRecursive(docsTemplates).filter(f => f.endsWith('.template.md'));
  for (const f of docFiles) {
    const base = path.basename(f).replace(/\.template\.md$/, '.md');
    plan.push({ action: 'create', path: path.join(docsDir, base) });
  }

  // Registry (merge)
  plan.push({ action: exists(registryPath) ? 'update' : 'create', path: registryPath });

  return { agentDir, docsDir, registryPath, plan, ctx };
}

function applyScaffold(bp, repoRoot, apply) {
  const { agentDir, docsDir, registryPath, plan, ctx } = planScaffold(bp, repoRoot);

  const templatesRoot = loadTemplatesRoot();
  const kitRoot = path.join(templatesRoot, 'agent-kit', 'node', 'layout');

  const created = [];
  const skipped = [];

  // 1) Create agent module from kit templates
  for (const src of listFilesRecursive(kitRoot)) {
    const rel = path.relative(kitRoot, src);
    const outRel = rel.endsWith('.template') ? rel.replace(/\.template$/, '') : rel;
    const dst = path.join(agentDir, outRel);

    if (exists(dst)) { skipped.push(dst); continue; }
    created.push(dst);
    if (!apply) continue;

    const txt = readText(src);
    const rendered = rel.endsWith('.template') ? renderTemplate(txt, ctx) : txt;
    writeText(dst, rendered);
  }

  // 2) Prompts
  const tier = (bp.prompting && bp.prompting.complexity_tier) ? bp.prompting.complexity_tier : 'tier2';
  const promptSrc = path.join(templatesRoot, 'prompt-pack', tier);
  if (exists(promptSrc)) {
    for (const src of listFilesRecursive(promptSrc)) {
      const rel = path.relative(promptSrc, src);
      const dst = path.join(agentDir, 'prompts', rel);
      if (exists(dst)) { skipped.push(dst); continue; }
      created.push(dst);
      if (!apply) continue;
      const txt = readText(src);
      writeText(dst, txt);
    }
  }

  // 3) Schemas
  for (const [name, schemaObj] of Object.entries(bp.schemas || {})) {
    const dst = path.join(agentDir, 'schemas', `${name}.schema.json`);
    if (exists(dst)) { skipped.push(dst); continue; }
    created.push(dst);
    if (!apply) continue;
    writeJson(dst, schemaObj);
  }

  // 4) Manifest copy
  const manifestDst = path.join(agentDir, 'config', 'agent.manifest.json');
  if (!exists(manifestDst)) {
    created.push(manifestDst);
    if (apply) writeJson(manifestDst, sanitizeManifest(bp));
  } else {
    skipped.push(manifestDst);
  }

  // 5) .env.example
  const envDst = path.join(agentDir, '.env.example');
  const desiredEnvVars = Array.isArray(bp.configuration?.env_vars) ? bp.configuration.env_vars : [];
  if (!exists(envDst)) {
    created.push(envDst);
    if (apply) {
      // Seed file with a header; actual variables will be appended/merged below.
      const base = [
        `# .env.example for ${bp.agent.id}`,
        '# Never commit real secrets. This file is placeholders only.',
        ''
      ].join('\n');
      writeText(envDst, base);
    }
  }

  // Always ensure required env vars are present (append-only; never delete existing lines).
  if (apply) {
    const current = exists(envDst) ? readText(envDst) : '';
    let out = current;
    const missing = [];

    for (const v of desiredEnvVars) {
      if (!v || !v.name) continue;
      const name = String(v.name).trim();
      if (!name) continue;
      const re = new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*=`, 'm');
      if (re.test(out)) continue;
      missing.push(v);
    }

    if (missing.length) {
      if (!out.endsWith('\n')) out += '\n';
      out += '# --- agent-builder managed env vars (append-only) ---\n';
      for (const v of missing) {
        const desc = String(v.description || '').trim();
        if (desc) out += `# ${desc}\n`;
        out += `${v.name}=${v.example_placeholder || ''}\n\n`;
      }
      writeText(envDst, out);
    }
  }

  // 6) Docs
  const docsTemplates = path.join(templatesRoot, 'docs');
  const docCtx = buildDocsContext(bp);
  for (const src of listFilesRecursive(docsTemplates)) {
    if (!src.endsWith('.template.md')) continue;
    const base = path.basename(src).replace(/\.template\.md$/, '.md');
    const dst = path.join(docsDir, base);
    if (exists(dst)) { skipped.push(dst); continue; }
    created.push(dst);
    if (!apply) continue;
    const rendered = renderTemplate(readText(src), docCtx);
    writeText(dst, rendered);
  }

  // 7) Registry merge (always update/create)
  const registryDir = path.dirname(registryPath);
  const relAgentModule = bp.deliverables.agent_module_path;
  const relDocs = bp.deliverables.docs_path;

  const entry = {
    id: bp.agent.id,
    name: bp.agent.name,
    summary: bp.agent.summary,
    owners: bp.agent.owners,
    module_path: relAgentModule,
    docs_path: relDocs,
    primary: 'api',
    attach: bp.integration.attach || [],
    entrypoints: (bp.interfaces || []).map(i => ({ type: i.type, entrypoint: i.entrypoint, response_mode: i.response_mode })),
    contract_version: bp.contracts.version,
    updated_at: nowIso()
  };

  if (apply) {
    fs.mkdirSync(registryDir, { recursive: true });
    let reg = { version: 1, agents: [] };
    if (exists(registryPath)) {
      try { reg = readJson(registryPath); } catch (e) { die(`Failed to parse existing registry: ${registryPath}`); }
      if (!Array.isArray(reg.agents)) reg.agents = [];
      if (!reg.version) reg.version = 1;
    }
    const idx = reg.agents.findIndex(a => a && a.id === entry.id);
    if (idx >= 0) reg.agents[idx] = { ...reg.agents[idx], ...entry };
    else reg.agents.push(entry);
    writeJson(registryPath, reg);
  }

  return { plan, created, skipped, registryPath };
}

function commandStart(args) {
  const templatesRoot = loadTemplatesRoot();
  const stageATemplatesDir = path.join(templatesRoot, 'stage-a');

  const repoRoot = args['repo-root'] ? path.resolve(args['repo-root']) : process.cwd();
  const runId = randomId();

  let workdir = args.workdir ? path.resolve(args.workdir) : path.join(os.tmpdir(), 'agent-builder', runId);
  fs.mkdirSync(workdir, { recursive: true });

  // Stage A + Stage B dirs
  fs.mkdirSync(path.join(workdir, 'stage-a'), { recursive: true });
  fs.mkdirSync(path.join(workdir, 'stage-b'), { recursive: true });

  // Write Stage A docs
  const interviewTpl = readText(path.join(stageATemplatesDir, 'interview-notes.template.md'));
  const integTpl = readText(path.join(stageATemplatesDir, 'integration-decision.template.md'));
  writeText(path.join(workdir, 'stage-a', 'interview-notes.md'), interviewTpl);
  writeText(path.join(workdir, 'stage-a', 'integration-decision.md'), integTpl);

  // Write blueprint example
  const bpExample = readText(path.join(templatesRoot, 'agent-blueprint.example.json'));
  writeText(path.join(workdir, 'stage-b', 'agent-blueprint.json'), bpExample);

  const state = {
    version: 1,
    run_id: runId,
    created_at: nowIso(),
    stage: 'A',
    workdir,
    repo_root: repoRoot,
    approvals: { A: false, B: false, C: false, D: false, E: false },
    [stageKey('A')]: {
      interview_notes_path: 'stage-a/interview-notes.md',
      integration_decision_path: 'stage-a/integration-decision.md'
    },
    [stageKey('B')]: {
      blueprint_path: 'stage-b/agent-blueprint.json',
      validated: false
    },
    [stageKey('C')]: {
      planned: false,
      applied: false,
      generated_paths: [],
      skipped_paths: []
    },
    history: []
  };
  addHistory(state, 'created', { repo_root: repoRoot });

  saveState(workdir, state);

  console.log(`Created workdir: ${workdir}`);
  console.log(`Next: fill Stage A docs, then approve Stage A:`);
  console.log(`  node ${path.relative(process.cwd(), __filename)} approve --workdir ${workdir} --stage A`);
}

function commandStatus(args) {
  const workdir = getWorkdir(args);
  ensureWorkdir(workdir);
  const state = loadState(workdir);

  console.log(`workdir: ${state.workdir}`);
  console.log(`run_id: ${state.run_id}`);
  console.log(`stage: ${state.stage}`);
  console.log(`approvals: A=${state.approvals.A} B=${state.approvals.B}`);
  console.log(`Stage A docs:`);
  console.log(`  - ${path.join(workdir, state[stageKey('A')].interview_notes_path)}`);
  console.log(`  - ${path.join(workdir, state[stageKey('A')].integration_decision_path)}`);
  console.log(`Stage B blueprint:`);
  console.log(`  - ${path.join(workdir, state[stageKey('B')].blueprint_path)} (validated=${state[stageKey('B')].validated})`);
  console.log(`Stage C: planned=${state[stageKey('C')].planned} applied=${state[stageKey('C')].applied}`);
}

function commandApprove(args) {
  const workdir = getWorkdir(args);
  ensureWorkdir(workdir);

  const stage = args.stage;
  if (!stage || !['A','B','C','D','E'].includes(stage)) die('approve requires --stage <A|B|C|D|E>');

  const state = loadState(workdir);
  state.approvals[stage] = true;
  const stageStateK = stageKey(stage);
  state[stageStateK] = state[stageStateK] || {};
  state[stageStateK].approved_at = nowIso();

  // Stage transitions (best-effort)
  if (stage === 'A') state.stage = 'B';
  if (stage === 'B') state.stage = 'C';

  addHistory(state, 'approved', { stage });
  saveState(workdir, state);

  console.log(`Approved stage ${stage}. Current stage=${state.stage}.`);
}

function commandValidateBlueprint(args) {
  const workdir = getWorkdir(args);
  ensureWorkdir(workdir);
  const fmt = args.format || 'text';

  const state = loadState(workdir);
  const bpPath = path.join(workdir, state[stageKey('B')].blueprint_path);
  if (!exists(bpPath)) die(`Blueprint not found: ${bpPath}`);
  const bp = readJson(bpPath);

  const result = validateBlueprint(bp);

  state[stageKey('B')].validated = result.ok;
  state[stageKey('B')].validated_at = nowIso();
  addHistory(state, 'validate-blueprint', { ok: result.ok, errors: result.errors.length, warnings: result.warnings.length });
  saveState(workdir, state);

  if (fmt === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.ok) console.log('OK: blueprint validation passed.');
    else console.log('FAIL: blueprint validation failed.');
    if (result.errors.length) {
      console.log('\nErrors:');
      for (const e of result.errors) console.log(`- ${e}`);
    }
    if (result.warnings.length) {
      console.log('\nWarnings:');
      for (const w of result.warnings) console.log(`- ${w}`);
    }
  }

  process.exit(result.ok ? 0 : 1);
}

function commandPlan(args) {
  const workdir = getWorkdir(args);
  ensureWorkdir(workdir);
  const repoRoot = args['repo-root'] ? path.resolve(args['repo-root']) : process.cwd();

  const state = loadState(workdir);
  const bpPath = path.join(workdir, state[stageKey('B')].blueprint_path);
  const bp = readJson(bpPath);

  const val = validateBlueprint(bp);
  if (!val.ok) die('Blueprint invalid. Run validate-blueprint and fix errors before planning.');

  const { plan } = planScaffold(bp, repoRoot);

  state[stageKey('C')].planned = true;
  state[stageKey('C')].planned_at = nowIso();
  addHistory(state, 'plan', { repo_root: repoRoot, items: plan.length });
  saveState(workdir, state);

  console.log(`Plan (${plan.length} items):`);
  for (const p of plan) {
    console.log(`- [${p.action}] ${p.path}`);
  }
}

function commandApply(args) {
  const workdir = getWorkdir(args);
  ensureWorkdir(workdir);
  const repoRoot = args['repo-root'] ? path.resolve(args['repo-root']) : process.cwd();
  const apply = !!args.apply;

  const state = loadState(workdir);
  if (!state.approvals.A) die('Refusing to apply: Stage A is not approved. Run approve --stage A first.');
  if (!state.approvals.B) die('Refusing to apply: Stage B is not approved. Run approve --stage B first.');

  const bpPath = path.join(workdir, state[stageKey('B')].blueprint_path);
  const bp = readJson(bpPath);

  const val = validateBlueprint(bp);
  if (!val.ok) die('Refusing to apply: blueprint validation failed. Run validate-blueprint and fix errors.');

  const result = applyScaffold(bp, repoRoot, apply);

  state[stageKey('C')].applied = apply;
  state[stageKey('C')].applied_at = nowIso();
  state[stageKey('C')].generated_paths = result.created;
  state[stageKey('C')].skipped_paths = result.skipped;
  addHistory(state, 'apply', { repo_root: repoRoot, apply, created: result.created.length, skipped: result.skipped.length });
  saveState(workdir, state);

  console.log(apply ? 'Applied scaffold.' : 'Dry-run (no changes written).');
  console.log(`Created (${result.created.length})`);
  for (const p of result.created.slice(0, 200)) console.log(`  + ${p}`);
  if (result.created.length > 200) console.log(`  ... (${result.created.length - 200} more)`);

  console.log(`Skipped existing (${result.skipped.length})`);
  for (const p of result.skipped.slice(0, 200)) console.log(`  = ${p}`);
  if (result.skipped.length > 200) console.log(`  ... (${result.skipped.length - 200} more)`);

  console.log(`Registry: ${result.registryPath}`);
  if (!apply) {
    console.log('\nTo apply changes, rerun with --apply.');
  }
}

/**
 * Verify command: execute a minimal set of acceptance scenarios (HTTP-first) and generate evidence.
 *
 * The verification runs the generated agent locally (child process) and drives it via HTTP
 * against a local mock LLM server. No external network is required.
 *
 * Unsupported scenarios will be marked as skipped (with structural checks recorded).
 */
async function commandVerify(args) {
  const workdir = getWorkdir(args);
  ensureWorkdir(workdir);
  const repoRoot = args['repo-root'] ? path.resolve(args['repo-root']) : process.cwd();
  const fmt = args.format || 'text';
  const skipHttp = !!args['skip-http']; // Skip HTTP server-based scenarios (for sandbox/CI)

  const state = loadState(workdir);
  if (!state[stageKey('C')].applied) {
    die('Refusing to verify: Stage C (scaffold) has not been applied yet.');
  }

  const bpPath = path.join(workdir, state[stageKey('B')].blueprint_path);
  const bp = readJson(bpPath);

  const agentDir = safeResolve(repoRoot, bp.deliverables.agent_module_path);
  const docsDir = safeResolve(repoRoot, bp.deliverables.docs_path);

  const manifestPath = path.join(agentDir, 'config', 'agent.manifest.json');
  if (!exists(manifestPath)) die(`Missing agent manifest: ${manifestPath}`);
  const manifest = readJson(manifestPath);

  const contractVersion = manifest?.contracts?.version || bp?.contracts?.version || '1.0.0';
  const basePath = manifest?.api?.base_path || bp?.api?.base_path || '';

  const verifiedAt = nowIso();
  const scenarios = Array.isArray(bp.acceptance?.scenarios) ? bp.acceptance.scenarios : [];
  const results = [];

  // Workdir for verification artifacts
  const stageEDir = path.join(workdir, 'stage-e');
  fs.mkdirSync(stageEDir, { recursive: true });

  // Provider env vars (from manifest; fallback to defaults)
  const primaryProvider = manifest?.model?.primary?.provider || {};
  const baseUrlEnv = primaryProvider.base_url_env || 'LLM_BASE_URL';
  const apiKeyEnv = primaryProvider.api_key_env || 'LLM_API_KEY';

  // Conversation header key (if configured)
  const convHeaderName =
    manifest?.conversation?.key?.source === 'header'
      ? String(manifest?.conversation?.key?.name || '')
      : '';

  function parseExplicitEnvFlag(text, key) {
    const lc = String(text || '').toLowerCase();
    const k = String(key || '').toLowerCase();
    if (!k) return null;
    const reEq = new RegExp(`${k}\\s*=\\s*(true|false|1|0)`, 'i');
    const reColon = new RegExp(`${k}\\s*:\\s*(true|false|1|0)`, 'i');
    const m = lc.match(reEq) || lc.match(reColon);
    if (!m) return null;
    const v = String(m[1]).toLowerCase();
    return (v === 'true' || v === '1');
  }

  function inferScenarioKind({ title, when, expectedChecks }) {
    const titleLc = String(title || '').toLowerCase();
    const whenLc = String(when || '').toLowerCase();
    const exp = Array.isArray(expectedChecks) ? expectedChecks.map(x => String(x || '').toLowerCase()) : [];

    // IMPORTANT: Avoid naive substring matching that can misclassify scenarios.
    // Example: "processes" contains "sse" as a substring; we must not treat it as SSE.
    function hasWord(haystack, word) {
      const w = String(word || '').toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(^|[^a-z0-9])${w}($|[^a-z0-9])`, 'i');
      return re.test(String(haystack || '').toLowerCase());
    }

    const wantsWs = whenLc.includes('/ws') || hasWord(whenLc, 'websocket') || hasWord(titleLc, 'websocket') || hasWord(whenLc, 'ws') || hasWord(titleLc, 'ws');
    const wantsSse =
      // Prefer strong signals.
      whenLc.includes('/run/stream') || whenLc.includes('text/event-stream') || whenLc.includes('server-sent') ||
      titleLc.includes('server-sent') || titleLc.includes('event-stream') ||
      // Fall back to an actual "sse" token.
      hasWord(whenLc, 'sse') || hasWord(titleLc, 'sse');

    // HTTP endpoints (explicit method/path) should take precedence over descriptive words.
    const wantsHealth = /\bget\b/.test(whenLc) && whenLc.includes('/health');
    const wantsHttpRun = /\bpost\b/.test(whenLc) && whenLc.includes('/run');

    const wantsConversationDebug =
      exp.some(c => c.includes('messages_count')) ||
      exp.some(c => c.includes('conversation')) ||
      titleLc.includes('conversation');

    const wantsPipeline = hasWord(whenLc, 'pipeline') || hasWord(whenLc, 'stdin') || hasWord(titleLc, 'pipeline');
    const wantsCron = hasWord(whenLc, 'cron') || hasWord(titleLc, 'cron');
    const wantsWorker = hasWord(whenLc, 'worker') || hasWord(titleLc, 'worker');
    const wantsSdk = hasWord(whenLc, 'sdk') || hasWord(titleLc, 'sdk') || whenLc.includes("require('");

    // Precedence order:
    // 1) Explicit streaming endpoints
    // 2) Explicit HTTP endpoints
    // 3) Non-HTTP adapters
    if (wantsWs) return 'ws_streaming';
    if (wantsSse) return 'sse_streaming';
    if (wantsHealth) return 'http_health';
    if (wantsHttpRun && wantsConversationDebug) return 'http_conversation_debug';
    if (wantsHttpRun) return 'http_run';
    if (wantsPipeline) return 'pipeline';
    if (wantsCron) return 'cron';
    if (wantsWorker) return 'worker';
    if (wantsSdk) return 'sdk';

    return 'unsupported';
  }

  const VALID_SCENARIO_KINDS = new Set([
    'http_health','http_run','http_conversation_debug',
    'ws_streaming','sse_streaming',
    'pipeline','cron','worker','sdk'
  ]);

  function resolveScenarioKind(scenario) {
    const explicit = scenario && scenario.kind !== undefined && scenario.kind !== null
      ? String(scenario.kind).trim()
      : '';
    if (explicit && VALID_SCENARIO_KINDS.has(explicit)) return explicit;
    const title = String(scenario?.title || '');
    const when = String(scenario?.when || '');
    const expectedChecks = Array.isArray(scenario?.expected_output_checks) ? scenario.expected_output_checks : [];
    return inferScenarioKind({ title, when, expectedChecks });
  }

  function safeParseJson(txt) {
    try {
      return { ok: true, json: JSON.parse(String(txt || '')) };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  async function spawnCapture({ command, args, cwd, env, stdinText, timeoutMs }) {
    return await new Promise((resolve) => {
      const child = spawn(command, args || [], {
        cwd,
        env: Object.assign({}, process.env, env || {}),
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const out = { stdout: '', stderr: '', exitCode: null, timedOut: false };
      child.stdout.on('data', (d) => { out.stdout += String(d); });
      child.stderr.on('data', (d) => { out.stderr += String(d); });

      let timer = null;
      if (timeoutMs) {
        timer = setTimeout(() => {
          out.timedOut = true;
          try { child.kill('SIGKILL'); } catch (e) {}
        }, timeoutMs);
      }

      child.on('close', (code) => {
        if (timer) clearTimeout(timer);
        out.exitCode = code;
        resolve(out);
      });

      if (stdinText !== undefined && stdinText !== null) {
        try { child.stdin.write(String(stdinText)); } catch (e) {}
      }
      try { child.stdin.end(); } catch (e) {}
    });
  }

  async function waitForCondition(fn, timeoutMs, pollMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if (fn()) return true;
      } catch (e) {}
      await sleep(pollMs);
    }
    return false;
  }

  // Determine whether we need a mock LLM server (health-only scenarios can skip).
  const needsMock = scenarios.some(s => {
    const kind = resolveScenarioKind(s);
    if (kind === 'http_health') return false;
    // Kill switch can be tested without LLM, but it's harmless to provide it.
    return kind !== 'unsupported';
  });

  const mockLLM = needsMock ? await startMockLLMServer() : null;

  try {
    for (const scenario of scenarios) {
      const startTime = Date.now();
      const checks = [];
      const execution = { kind: 'unknown' };
      let status = 'passed';

      const title = String(scenario?.title || 'Untitled');
      const titleLc = title.toLowerCase();
      const givenText = String(scenario?.given || '');
      const givenLc = givenText.toLowerCase();
      const whenText = String(scenario?.when || '');
      const expected = Array.isArray(scenario?.expected_output_checks) ? scenario.expected_output_checks : [];

      // Structural baseline checks
      const envExample = path.join(agentDir, '.env.example');
      checks.push({
        check: 'Agent module directory exists',
        result: exists(agentDir),
        actual: exists(agentDir) ? agentDir : 'missing'
      });
      checks.push({
        check: '.env.example exists',
        result: exists(envExample),
        actual: exists(envExample) ? envExample : 'missing'
      });

      const hasKillSwitch = exists(envExample) && readText(envExample).includes('AGENT_ENABLED');
      checks.push({
        check: 'AGENT_ENABLED in .env.example',
        result: hasKillSwitch,
        actual: hasKillSwitch ? 'present' : 'missing'
      });
      if (!hasKillSwitch) status = 'failed';

      const kind = resolveScenarioKind(scenario);
      execution.kind = kind;

      const attach = Array.isArray(bp.integration?.attach) ? bp.integration.attach : [];
      const attachSet = new Set(attach);

      // Scenario-level env flags
      const agentEnabledExplicit = parseExplicitEnvFlag(givenText, 'AGENT_ENABLED');
      const degraded = parseExplicitEnvFlag(givenText, 'AGENT_DEGRADED') === true;

      const isKillSwitchScenario =
        (agentEnabledExplicit === false) ||
        titleLc.includes('kill switch') ||
        givenLc.includes('agent_enabled=false');

      // Common env for child processes
      const commonEnv = {
        AGENT_ENABLED: isKillSwitchScenario ? 'false' : 'true'
      };

      if (!isKillSwitchScenario && mockLLM) {
        commonEnv[baseUrlEnv] = mockLLM.baseUrl;
        commonEnv[apiKeyEnv] = 'test_key';
      }

      // Ensure temp dirs for this scenario
      const scenarioDir = path.join(stageEDir, `scenario-${randomId()}`);
      fs.mkdirSync(scenarioDir, { recursive: true });

      // Route selection: if unsupported, skip (unless structural failures already marked failed).
      if (kind === 'unsupported') {
        status = status === 'failed' ? 'failed' : 'skipped';
        checks.push({
          check: 'Scenario supported by verify harness',
          result: false,
          actual: `Unsupported when="${whenText}"`
        });
        results.push({ title, priority: scenario?.priority, status, checks, execution, duration_ms: Date.now() - startTime });
        continue;
      }

      // Attachment gating (hard-fail if scenario demands an attach not enabled)
      if (kind === 'worker' && !attachSet.has('worker')) {
        status = 'failed';
        checks.push({ check: 'integration.attach includes worker', result: false, actual: `attach=[${attach.join(',')}]` });
        results.push({ title, priority: scenario?.priority, status, checks, execution, duration_ms: Date.now() - startTime });
        continue;
      }
      if (kind === 'cron' && !attachSet.has('cron')) {
        status = 'failed';
        checks.push({ check: 'integration.attach includes cron', result: false, actual: `attach=[${attach.join(',')}]` });
        results.push({ title, priority: scenario?.priority, status, checks, execution, duration_ms: Date.now() - startTime });
        continue;
      }
      if (kind === 'pipeline' && !attachSet.has('pipeline')) {
        status = 'failed';
        checks.push({ check: 'integration.attach includes pipeline', result: false, actual: `attach=[${attach.join(',')}]` });
        results.push({ title, priority: scenario?.priority, status, checks, execution, duration_ms: Date.now() - startTime });
        continue;
      }
      if (kind === 'sdk' && !attachSet.has('sdk')) {
        status = 'failed';
        checks.push({ check: 'integration.attach includes sdk', result: false, actual: `attach=[${attach.join(',')}]` });
        results.push({ title, priority: scenario?.priority, status, checks, execution, duration_ms: Date.now() - startTime });
        continue;
      }

      // Execute scenario
      try {
        // ----------------------------
        // HTTP server-based scenarios
        // ----------------------------
        const isHttpScenario = kind === 'http_health' || kind === 'http_run' || kind === 'http_conversation_debug' || kind === 'ws_streaming' || kind === 'sse_streaming';

        if (isHttpScenario && skipHttp) {
          status = 'skipped';
          checks.push({
            check: 'HTTP scenario skipped (--skip-http)',
            result: true,
            actual: 'skipped_by_flag'
          });
          results.push({ title, priority: scenario?.priority, status, checks, execution, duration_ms: Date.now() - startTime });
          continue;
        }

        if (isHttpScenario) {
          const port = await findFreePort();

          // Degradation env
          const env = Object.assign({}, commonEnv);
          if (degraded) env.AGENT_DEGRADED = 'true';

          // For route_to_worker degradation we must set the worker input dir.
          const workerInputDirForDegrade = path.join(scenarioDir, 'worker-in');
          if (degraded) env.AGENT_WORKER_INPUT_DIR = workerInputDirForDegrade;

          // Start agent HTTP server
          let serverProc = null;
          let serverLogs = { stdout: '', stderr: '' };
          try {
            ({ child: serverProc, logs: serverLogs } = await startAgentHttpServer({
              agentDir,
              env: Object.assign(env, { PORT: String(port) }),
              basePath
            }));

            // Common request headers (conversation key)
            const headers = {};
            if (convHeaderName) headers[convHeaderName] = 'verify-conv';
            // If scenario asks for additional header-based conversation, include.
            // (No other header semantics are assumed here.)

            if (kind === 'http_health') {
              execution.method = 'GET';
              execution.path = `${basePath}/health`;
              const r = await httpJson({ method: 'GET', port, path: execution.path, headers, timeoutMs: 3000 });
              execution.http_status = r.statusCode;
              execution.response = r.json || r.text;
              const ok = r.statusCode === 200 && r.json && r.json.status === 'ok';
              checks.push({ check: 'health returns 200 status=ok', result: ok, actual: `status=${r.statusCode}` });
              if (!ok) status = 'failed';
            }

            if (kind === 'http_run') {
              execution.method = 'POST';
              execution.path = `${basePath}/run`;

              const requestId = `verify-${randomId()}`;
              const runRequest = {
                contract_version: contractVersion,
                request_id: requestId,
                conversation_id: 'verify',
                input: 'hello from verify',
                context: {},
                options: { response_mode: 'blocking' }
              };

              const r = await httpJson({ method: 'POST', port, path: execution.path, headers, body: runRequest, timeoutMs: 8000 });
              execution.http_status = r.statusCode;
              execution.response = r.json || r.text;

              // If degraded route_to_worker, expect 202 with queued_file.
              if (degraded) {
                const ok = r.statusCode === 202 && r.json && r.json.status === 'queued' && typeof r.json.queued_file === 'string';
                checks.push({ check: 'degraded route_to_worker returns 202 queued', result: ok, actual: `status=${r.statusCode}` });
                if (!ok) status = 'failed';

                if (r.json && typeof r.json.queued_file === 'string') {
                  const queued = r.json.queued_file;
                  const existsQueued = exists(queued);
                  checks.push({ check: 'queued_file exists', result: existsQueued, actual: existsQueued ? queued : 'missing' });
                  if (!existsQueued) status = 'failed';
                }
              }

              // Evaluate expected checks (simple DSL)
              for (const c of expected) {
                const cLc = String(c).toLowerCase();

                if (cLc.includes('http status')) {
                  const m = cLc.match(/http status\s*==\s*(\d+)/);
                  const want = m ? Number(m[1]) : null;
                  const ok = want ? (r.statusCode === want) : true;
                  checks.push({ check: c, result: ok, actual: `status=${r.statusCode}` });
                  if (!ok) status = 'failed';
                  continue;
                }

                if (cLc.includes('status == ok')) {
                  const ok = r.statusCode === 200 && r.json && r.json.status === 'ok';
                  checks.push({ check: c, result: ok, actual: ok ? 'ok' : `status=${r.statusCode}` });
                  if (!ok) status = 'failed';
                  continue;
                }

                if (cLc.includes('output is non-empty')) {
                  const out = r.json && typeof r.json.output === 'string' ? r.json.output : '';
                  const ok = r.statusCode === 200 && out.trim().length > 0;
                  checks.push({ check: c, result: ok, actual: `len=${out.length}` });
                  if (!ok) status = 'failed';
                  continue;
                }

                if (cLc.includes('contract_version')) {
                  const got = r.json && r.json.contract_version ? r.json.contract_version : null;
                  const ok = r.json && r.json.contract_version === contractVersion;
                  checks.push({ check: c, result: ok, actual: `got=${got} expected=${contractVersion}` });
                  if (!ok) status = 'failed';
                  continue;
                }

                if (cLc.includes('retryable == false')) {
                  const retryable = r.json && typeof r.json.retryable === 'boolean' ? r.json.retryable : null;
                  const ok = retryable === false;
                  checks.push({ check: c, result: ok, actual: `retryable=${retryable}` });
                  if (!ok) status = 'failed';
                  continue;
                }

                if (cLc.includes('queued_file')) {
                  const q = r.json && r.json.queued_file ? r.json.queued_file : '';
                  const ok = !!q && exists(q);
                  checks.push({ check: c, result: ok, actual: ok ? q : 'missing' });
                  if (!ok) status = 'failed';
                  continue;
                }

                checks.push({ check: c, result: true, actual: 'not_evaluated' });
              }

              // Default checks if none provided
              if (!expected.length) {
                const ok = isKillSwitchScenario ? (r.statusCode >= 400) : (r.statusCode === 200);
                checks.push({ check: 'default result status', result: ok, actual: `http=${r.statusCode}` });
                if (!ok) status = 'failed';
              }
            }

            if (kind === 'http_conversation_debug') {
              execution.method = 'POST';
              execution.path = `${basePath}/run`;
              execution.subkind = 'two_turns_debug';

              const headers2 = Object.assign({}, headers);
              // If conversation key is configured via header, use a stable value across both turns.
              if (convHeaderName) headers2[convHeaderName] = 'verify-conv-debug';

              const requestId1 = `verify-${randomId()}`;
              const req1 = {
                contract_version: contractVersion,
                request_id: requestId1,
                conversation_id: 'verify',
                input: '__debug_messages__ turn1',
                context: {},
                options: { response_mode: 'blocking' }
              };

              const r1 = await httpJson({ method: 'POST', port, path: execution.path, headers: headers2, body: req1, timeoutMs: 8000 });

              const requestId2 = `verify-${randomId()}`;
              const req2 = {
                contract_version: contractVersion,
                request_id: requestId2,
                conversation_id: 'verify',
                input: '__debug_messages__ turn2',
                context: {},
                options: { response_mode: 'blocking' }
              };

              const r2 = await httpJson({ method: 'POST', port, path: execution.path, headers: headers2, body: req2, timeoutMs: 8000 });

              execution.http_status_1 = r1.statusCode;
              execution.http_status_2 = r2.statusCode;
              execution.response_1 = r1.json || r1.text;
              execution.response_2 = r2.json || r2.text;

              // Parse debug payload from output strings.
              let c1 = null;
              let c2 = null;
              try {
                c1 = safeParseJson(r1.json && r1.json.output ? r1.json.output : '').json;
              } catch (e) {}
              try {
                c2 = safeParseJson(r2.json && r2.json.output ? r2.json.output : '').json;
              } catch (e) {}

              const n1 = c1 && Number.isInteger(c1.messages_count) ? c1.messages_count : null;
              const n2 = c2 && Number.isInteger(c2.messages_count) ? c2.messages_count : null;

              checks.push({ check: 'turn1 returns debug payload', result: n1 !== null, actual: `messages_count=${n1}` });
              checks.push({ check: 'turn2 returns debug payload', result: n2 !== null, actual: `messages_count=${n2}` });
              if (n1 === null || n2 === null) status = 'failed';

              const increased = (n1 !== null && n2 !== null) ? (n2 > n1) : false;
              checks.push({ check: 'messages_count increases on second turn', result: increased, actual: `n1=${n1} n2=${n2}` });
              if (!increased) status = 'failed';

              // Evaluate expected checks
              for (const c of expected) {
                const cLc = String(c).toLowerCase();
                if (cLc.includes('messages_count') && cLc.includes('increase')) {
                  const ok = increased;
                  checks.push({ check: c, result: ok, actual: `n1=${n1} n2=${n2}` });
                  if (!ok) status = 'failed';
                  continue;
                }
                checks.push({ check: c, result: true, actual: 'not_evaluated' });
              }
            }

            if (kind === 'ws_streaming') {
              execution.path = `${basePath}/ws`;
              execution.protocol = 'websocket';

              // WebSocket requires headers for auth (if any) and conversation (optional).
              const wsHeaders = Object.assign({}, (convHeaderName ? { [convHeaderName]: 'verify-ws' } : {}));

              const requestId = `verify-${randomId()}`;
              const runRequest = {
                contract_version: contractVersion,
                request_id: requestId,
                conversation_id: 'verify',
                input: 'hello ws streaming verify',
                context: {},
                options: { response_mode: 'streaming' }
              };

              const wsRes = await wsSendAndCollectJson({
                hostname: '127.0.0.1',
                port,
                pathname: execution.path,
                headers: wsHeaders,
                sendObj: runRequest,
                timeoutMs: 8000,
                stopWhen: (evt) => evt && evt.type === 'final' && evt.data && evt.data.response
              });

              execution.ws_messages = wsRes.messages.slice(0, 200);
              execution.ws_events = wsRes.jsonEvents.slice(0, 200);

              const hasAny = wsRes.jsonEvents.length > 0;
              checks.push({ check: 'ws receives at least one event', result: hasAny, actual: `events=${wsRes.jsonEvents.length}` });
              if (!hasAny) status = 'failed';

              const hasDelta = wsRes.jsonEvents.some(e => e && e.type === 'delta');
              checks.push({ check: 'ws receives delta events', result: hasDelta, actual: hasDelta ? 'present' : 'missing' });
              if (!hasDelta) status = 'failed';

              const hasError = wsRes.jsonEvents.some(e => e && e.type === 'error');
              checks.push({ check: 'ws has no error events', result: !hasError, actual: hasError ? 'error_present' : 'ok' });
              if (hasError) status = 'failed';

              const finalWithResponse = wsRes.jsonEvents.find(e => e && e.type === 'final' && e.data && e.data.response);
              const okFinal = finalWithResponse && finalWithResponse.data && finalWithResponse.data.response && finalWithResponse.data.response.status === 'ok';
              checks.push({ check: 'ws final event contains RunResponse status=ok', result: !!okFinal, actual: okFinal ? 'ok' : 'missing_or_not_ok' });
              if (!okFinal) status = 'failed';

              // Evaluate expected checks
              for (const c of expected) {
                const cLc = String(c).toLowerCase();
                if (cLc.includes('ws') && cLc.includes('delta')) {
                  checks.push({ check: c, result: hasDelta, actual: hasDelta ? 'present' : 'missing' });
                  if (!hasDelta) status = 'failed';
                  continue;
                }
                if (cLc.includes('ws') && cLc.includes('no error')) {
                  checks.push({ check: c, result: !hasError, actual: hasError ? 'error_present' : 'ok' });
                  if (hasError) status = 'failed';
                  continue;
                }
                if (cLc.includes('final') && cLc.includes('status') && cLc.includes('ok')) {
                  checks.push({ check: c, result: !!okFinal, actual: okFinal ? 'ok' : 'missing_or_not_ok' });
                  if (!okFinal) status = 'failed';
                  continue;
                }
                checks.push({ check: c, result: true, actual: 'not_evaluated' });
              }
            }

            // ----------------------------
            // SSE (Server-Sent Events) streaming scenario
            // ----------------------------
            if (kind === 'sse_streaming') {
              const sseHeaders = Object.assign({}, (convHeaderName ? { [convHeaderName]: 'verify-sse' } : {}));
              const requestId = `verify-${randomId()}`;
              const runRequest = {
                contract_version: contractVersion,
                request_id: requestId,
                conversation_id: 'verify',
                input: 'hello sse streaming verify',
                options: { response_mode: 'streaming' }
              };

              const ssePath = `${basePath}/run/stream`;
              const sseRes = await httpSseCollect({
                hostname: '127.0.0.1',
                port,
                path: ssePath,
                method: 'POST',
                headers: sseHeaders,
                body: runRequest,
                timeoutMs: 15000
              });

              execution.sse_response = {
                statusCode: sseRes.statusCode,
                events_count: sseRes.events.length,
                timedOut: !!sseRes.timedOut
              };

              // Check for delta events
              const hasDelta = sseRes.events.some(e => e && e.type === 'delta');
              checks.push({ check: 'SSE delta events received', result: hasDelta, actual: hasDelta ? 'yes' : 'no' });
              if (!hasDelta) status = 'failed';

              // Check for error events
              const hasError = sseRes.events.some(e => e && e.type === 'error');
              checks.push({ check: 'SSE no error events', result: !hasError, actual: hasError ? 'has_error' : 'no_error' });
              if (hasError) status = 'failed';

              // Check for final event with response
              const finalWithResponse = sseRes.events.find(e => e && e.type === 'final' && e.data && e.data.response);
              const okFinal = finalWithResponse && finalWithResponse.data && finalWithResponse.data.response && finalWithResponse.data.response.status === 'ok';
              checks.push({ check: 'SSE final event with status=ok', result: !!okFinal, actual: okFinal ? 'ok' : 'missing_or_not_ok' });
              if (!okFinal) status = 'failed';

              // Process expected checks
              for (const c of expected) {
                const cLc = c.toLowerCase();
                if (cLc.includes('sse') && cLc.includes('delta')) {
                  checks.push({ check: c, result: hasDelta, actual: hasDelta ? 'yes' : 'no' });
                  if (!hasDelta) status = 'failed';
                  continue;
                }
                if (cLc.includes('sse') && cLc.includes('no error')) {
                  checks.push({ check: c, result: !hasError, actual: hasError ? 'has_error' : 'no_error' });
                  if (hasError) status = 'failed';
                  continue;
                }
                if (cLc.includes('final') && cLc.includes('status') && cLc.includes('ok')) {
                  checks.push({ check: c, result: !!okFinal, actual: okFinal ? 'ok' : 'missing_or_not_ok' });
                  if (!okFinal) status = 'failed';
                  continue;
                }
                checks.push({ check: c, result: true, actual: 'not_evaluated' });
              }
            }
          } finally {
            await stopProcess(serverProc);
            execution.server_stdout_tail = (serverLogs.stdout || '').slice(-2000);
            execution.server_stderr_tail = (serverLogs.stderr || '').slice(-2000);
          }
        }

        // ----------------------------
        // Pipeline adapter scenario
        // ----------------------------
        if (kind === 'pipeline') {
          const requestId = `verify-${randomId()}`;
          const runRequest = {
            contract_version: contractVersion,
            request_id: requestId,
            conversation_id: 'verify',
            input: 'hello from pipeline verify',
            context: {},
            options: { response_mode: 'blocking' }
          };

          const proc = await spawnCapture({
            command: process.execPath,
            args: ['src/adapters/pipeline/pipeline.mjs'],
            cwd: agentDir,
            env: commonEnv,
            stdinText: JSON.stringify(runRequest),
            timeoutMs: 8000
          });

          execution.exit_code = proc.exitCode;
          execution.stdout_tail = String(proc.stdout || '').slice(-2000);
          execution.stderr_tail = String(proc.stderr || '').slice(-2000);
          execution.timed_out = proc.timedOut;

          const parsed = safeParseJson(proc.stdout);
          execution.response = parsed.ok ? parsed.json : proc.stdout;

          const okExit = proc.exitCode === 0 && !proc.timedOut;
          checks.push({ check: 'pipeline exits with code 0', result: okExit, actual: `exit=${proc.exitCode} timeout=${proc.timedOut}` });
          if (!okExit) status = 'failed';

          const okStatus = parsed.ok && parsed.json && parsed.json.status === 'ok';
          checks.push({ check: 'pipeline returns RunResponse status=ok', result: okStatus, actual: okStatus ? 'ok' : 'not_ok' });
          if (!okStatus) status = 'failed';

          // Evaluate expected checks (re-use common checks)
          for (const c of expected) {
            const cLc = String(c).toLowerCase();
            if (cLc.includes('exit code')) {
              const m = cLc.match(/exit code\s*==\s*(\d+)/);
              const want = m ? Number(m[1]) : 0;
              const ok = proc.exitCode === want;
              checks.push({ check: c, result: ok, actual: `exit=${proc.exitCode}` });
              if (!ok) status = 'failed';
              continue;
            }
            if (cLc.includes('status == ok')) {
              checks.push({ check: c, result: okStatus, actual: okStatus ? 'ok' : 'not_ok' });
              if (!okStatus) status = 'failed';
              continue;
            }
            if (cLc.includes('output is non-empty')) {
              const out = parsed.ok && parsed.json && typeof parsed.json.output === 'string' ? parsed.json.output : '';
              const ok = out.trim().length > 0;
              checks.push({ check: c, result: ok, actual: `len=${out.length}` });
              if (!ok) status = 'failed';
              continue;
            }
            checks.push({ check: c, result: true, actual: 'not_evaluated' });
          }
        }

        // ----------------------------
        // Cron adapter scenario
        // ----------------------------
        if (kind === 'cron') {
          const requestId = `verify-${randomId()}`;
          const runRequest = {
            contract_version: contractVersion,
            request_id: requestId,
            conversation_id: 'verify',
            input: 'hello from cron verify',
            context: {},
            options: { response_mode: 'blocking' }
          };

          const proc = await spawnCapture({
            command: process.execPath,
            args: ['src/adapters/cron/cron.mjs'],
            cwd: agentDir,
            env: Object.assign({}, commonEnv, { AGENT_CRON_INPUT_JSON: JSON.stringify(runRequest) }),
            stdinText: null,
            timeoutMs: 8000
          });

          execution.exit_code = proc.exitCode;
          execution.stdout_tail = String(proc.stdout || '').slice(-2000);
          execution.stderr_tail = String(proc.stderr || '').slice(-2000);
          execution.timed_out = proc.timedOut;

          const parsed = safeParseJson(proc.stdout);
          execution.response = parsed.ok ? parsed.json : proc.stdout;

          const okExit = proc.exitCode === 0 && !proc.timedOut;
          checks.push({ check: 'cron exits with code 0', result: okExit, actual: `exit=${proc.exitCode} timeout=${proc.timedOut}` });
          if (!okExit) status = 'failed';

          const okStatus = parsed.ok && parsed.json && parsed.json.status === 'ok';
          checks.push({ check: 'cron returns RunResponse status=ok', result: okStatus, actual: okStatus ? 'ok' : 'not_ok' });
          if (!okStatus) status = 'failed';

          for (const c of expected) {
            const cLc = String(c).toLowerCase();
            if (cLc.includes('exit code')) {
              const m = cLc.match(/exit code\s*==\s*(\d+)/);
              const want = m ? Number(m[1]) : 0;
              const ok = proc.exitCode === want;
              checks.push({ check: c, result: ok, actual: `exit=${proc.exitCode}` });
              if (!ok) status = 'failed';
              continue;
            }
            if (cLc.includes('status == ok')) {
              checks.push({ check: c, result: okStatus, actual: okStatus ? 'ok' : 'not_ok' });
              if (!okStatus) status = 'failed';
              continue;
            }
            if (cLc.includes('output is non-empty')) {
              const out = parsed.ok && parsed.json && typeof parsed.json.output === 'string' ? parsed.json.output : '';
              const ok = out.trim().length > 0;
              checks.push({ check: c, result: ok, actual: `len=${out.length}` });
              if (!ok) status = 'failed';
              continue;
            }
            checks.push({ check: c, result: true, actual: 'not_evaluated' });
          }
        }

        // ----------------------------
        // Worker adapter scenario
        // ----------------------------
        if (kind === 'worker') {
          const inDir = path.join(scenarioDir, 'worker-in');
          const outDir = path.join(scenarioDir, 'worker-out');
          fs.mkdirSync(inDir, { recursive: true });
          fs.mkdirSync(outDir, { recursive: true });

          const requestId = `verify-${randomId()}`;
          const runRequest = {
            contract_version: contractVersion,
            request_id: requestId,
            conversation_id: 'verify',
            input: 'hello from worker verify',
            context: {},
            options: { response_mode: 'async' }
          };

          const inputFile = path.join(inDir, `${requestId}.json`);
          fs.writeFileSync(inputFile, JSON.stringify(runRequest, null, 2));

          const env = Object.assign({}, commonEnv, {
            AGENT_WORKER_INPUT_DIR: inDir,
            AGENT_WORKER_OUTPUT_DIR: outDir,
            AGENT_WORKER_POLL_MS: '50'
          });

          const child = spawn(process.execPath, ['src/adapters/worker/worker.mjs'], {
            cwd: agentDir,
            env: Object.assign({}, process.env, env),
            stdio: ['ignore', 'pipe', 'pipe']
          });

          const logs = { stdout: '', stderr: '' };
          child.stdout.on('data', (d) => { logs.stdout += String(d); });
          child.stderr.on('data', (d) => { logs.stderr += String(d); });

          const outOkFile = path.join(outDir, `${requestId}.out.json`);
          const outErrFile = path.join(outDir, `${requestId}.error.json`);
          const doneFile = path.join(inDir, '.done', `${requestId}.json`);
          const failedFile = path.join(inDir, '.failed', `${requestId}.json`);

          const produced = await waitForCondition(() => exists(outOkFile) || exists(outErrFile), 8000, 50);
          const moved = await waitForCondition(() => exists(doneFile) || exists(failedFile), 8000, 50);

          await stopProcess(child);

          execution.worker_in = inDir;
          execution.worker_out = outDir;
          execution.worker_stdout_tail = (logs.stdout || '').slice(-2000);
          execution.worker_stderr_tail = (logs.stderr || '').slice(-2000);

          checks.push({ check: 'worker produced an output file', result: produced, actual: produced ? 'produced' : 'timeout' });
          if (!produced) status = 'failed';

          checks.push({ check: 'worker moved input to .done or .failed', result: moved, actual: moved ? 'moved' : 'timeout' });
          if (!moved) status = 'failed';

          let outObj = null;
          if (exists(outOkFile)) {
            outObj = readJson(outOkFile);
            execution.output_file = outOkFile;
          } else if (exists(outErrFile)) {
            outObj = readJson(outErrFile);
            execution.output_file = outErrFile;
          }
          execution.response = outObj;

          const okStatus = outObj && outObj.status === 'ok';
          checks.push({ check: 'worker output has status=ok', result: !!okStatus, actual: okStatus ? 'ok' : 'not_ok' });
          if (!okStatus) status = 'failed';

          for (const c of expected) {
            const cLc = String(c).toLowerCase();
            if (cLc.includes('status == ok')) {
              checks.push({ check: c, result: !!okStatus, actual: okStatus ? 'ok' : 'not_ok' });
              if (!okStatus) status = 'failed';
              continue;
            }
            if (cLc.includes('.done')) {
              const ok = exists(doneFile);
              checks.push({ check: c, result: ok, actual: ok ? 'moved_to_done' : 'not_in_done' });
              if (!ok) status = 'failed';
              continue;
            }
            if (cLc.includes('output file')) {
              const ok = exists(outOkFile) || exists(outErrFile);
              checks.push({ check: c, result: ok, actual: ok ? execution.output_file : 'missing' });
              if (!ok) status = 'failed';
              continue;
            }
            checks.push({ check: c, result: true, actual: 'not_evaluated' });
          }
        }

        // ----------------------------
        // SDK adapter scenario
        // ----------------------------
        if (kind === 'sdk') {
          const requestId = `verify-${randomId()}`;
          const runRequest = {
            contract_version: contractVersion,
            request_id: requestId,
            conversation_id: 'verify',
            input: 'hello from sdk verify',
            context: {},
            options: { response_mode: 'blocking' }
          };

          const sdkScript = path.join(scenarioDir, 'sdk-test.mjs');
          writeText(sdkScript, `
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
(async () => {
  const reqTxt = process.env.SDK_TEST_REQUEST_JSON || '{}';
  const req = JSON.parse(reqTxt);
  const sdk = await import(path.join(process.cwd(), 'src', 'adapters', 'sdk', 'index.mjs'));
  const result = await sdk.runAgent(req, { responseMode: 'blocking' });
  const out = result.ok ? result.response : result.error;
  process.stdout.write(JSON.stringify(out));
  process.exit(result.ok ? 0 : 1);
})().catch((e) => { process.stderr.write(String(e && e.message ? e.message : e)); process.exit(1); });
          `.trim() + '\n');

          const proc = await spawnCapture({
            command: process.execPath,
            args: [sdkScript],
            cwd: agentDir,
            env: Object.assign({}, commonEnv, { SDK_TEST_REQUEST_JSON: JSON.stringify(runRequest) }),
            stdinText: null,
            timeoutMs: 8000
          });

          execution.exit_code = proc.exitCode;
          execution.stdout_tail = String(proc.stdout || '').slice(-2000);
          execution.stderr_tail = String(proc.stderr || '').slice(-2000);
          execution.timed_out = proc.timedOut;

          const parsed = safeParseJson(proc.stdout);
          execution.response = parsed.ok ? parsed.json : proc.stdout;

          const okExit = proc.exitCode === 0 && !proc.timedOut;
          checks.push({ check: 'sdk test exits with code 0', result: okExit, actual: `exit=${proc.exitCode} timeout=${proc.timedOut}` });
          if (!okExit) status = 'failed';

          const okStatus = parsed.ok && parsed.json && parsed.json.status === 'ok';
          checks.push({ check: 'sdk returns RunResponse status=ok', result: okStatus, actual: okStatus ? 'ok' : 'not_ok' });
          if (!okStatus) status = 'failed';

          for (const c of expected) {
            const cLc = String(c).toLowerCase();
            if (cLc.includes('status == ok')) {
              checks.push({ check: c, result: okStatus, actual: okStatus ? 'ok' : 'not_ok' });
              if (!okStatus) status = 'failed';
              continue;
            }
            if (cLc.includes('output is non-empty')) {
              const out = parsed.ok && parsed.json && typeof parsed.json.output === 'string' ? parsed.json.output : '';
              const ok = out.trim().length > 0;
              checks.push({ check: c, result: ok, actual: `len=${out.length}` });
              if (!ok) status = 'failed';
              continue;
            }
            checks.push({ check: c, result: true, actual: 'not_evaluated' });
          }
        }
      } catch (e) {
        status = 'failed';
        execution.error = String(e && e.message ? e.message : e);
      }

      results.push({
        title,
        priority: scenario?.priority,
        status,
        checks,
        execution,
        duration_ms: Date.now() - startTime
      });
    }
  } finally {
    if (mockLLM) await mockLLM.close();
  }

  // Calculate summary
  const summary = {
    total: results.length,
    passed: results.filter(r => r.status === 'passed').length,
    failed: results.filter(r => r.status === 'failed').length,
    skipped: results.filter(r => r.status === 'skipped').length
  };

  // Build evidence object
  const evidence = {
    agent_id: bp.agent.id,
    agent_name: bp.agent.name,
    verified_at: verifiedAt,
    repo_root: repoRoot,
    agent_module_path: bp.deliverables.agent_module_path,
    scenarios: results,
    summary
  };

  // Write JSON evidence
  const evidencePath = path.join(stageEDir, 'verification-evidence.json');
  writeJson(evidencePath, evidence);

  // Generate Markdown report
  const reportLines = [];
  reportLines.push(`# ${bp.agent.name} Verification Report`);
  reportLines.push('');
  reportLines.push('## Summary');
  reportLines.push('');
  reportLines.push(`- **Agent ID**: ${bp.agent.id}`);
  reportLines.push(`- **Verified At**: ${verifiedAt}`);
  reportLines.push(`- **Total Scenarios**: ${summary.total}`);
  reportLines.push(`- **Passed**: ${summary.passed}`);
  reportLines.push(`- **Failed**: ${summary.failed}`);
  reportLines.push(`- **Skipped**: ${summary.skipped}`);
  reportLines.push('');
  reportLines.push(`**Result**: ${summary.failed === 0 ? 'PASS' : 'FAIL'}`);
  reportLines.push('');
  reportLines.push('## Scenario Details');
  reportLines.push('');

  for (const r of results) {
    const icon = r.status === 'passed' ? '[PASS]' : r.status === 'failed' ? '[FAIL]' : '[SKIP]';
    reportLines.push(`### ${icon} ${r.title} (${r.priority})`);
    reportLines.push('');
    reportLines.push(`- Status: **${r.status}**`);
    reportLines.push(`- Duration: ${r.duration_ms}ms`);
    reportLines.push(`- Kind: ${r.execution && r.execution.kind ? r.execution.kind : ''}`);
    reportLines.push('');
    if (r.checks.length > 0) {
      reportLines.push('**Checks**:');
      reportLines.push('');
      reportLines.push('| Check | Result | Actual |');
      reportLines.push('|-------|--------|--------|');
      for (const c of r.checks) {
        const checkIcon = c.result ? 'PASS' : 'FAIL';
        reportLines.push(`| ${c.check} | ${checkIcon} | ${c.actual} |`);
      }
      reportLines.push('');
    }
  }

  reportLines.push('---');
  reportLines.push('');
  reportLines.push('*Generated by agent-builder.mjs verify command*');

  const reportPath = path.join(stageEDir, 'verification-report.md');
  writeText(reportPath, reportLines.join('\n'));

  // Also copy to docs directory if it exists
  if (exists(docsDir)) {
    writeJson(path.join(docsDir, 'verification-evidence.json'), evidence);
    writeText(path.join(docsDir, 'verification-report.md'), reportLines.join('\n'));
  }

  // Update state
  state[stageKey('E')] = state[stageKey('E')] || {};
  state[stageKey('E')].verified = true;
  state[stageKey('E')].verified_at = verifiedAt;
  state[stageKey('E')].evidence_path = evidencePath;
  state[stageKey('E')].report_path = reportPath;
  state[stageKey('E')].summary = summary;
  state.stage = 'E';
  addHistory(state, 'verify', {
    total: summary.total,
    passed: summary.passed,
    failed: summary.failed
  });
  saveState(workdir, state);

  // Output
  if (fmt === 'json') {
    console.log(JSON.stringify(evidence, null, 2));
  } else {
    console.log(`Verification ${summary.failed === 0 ? 'PASSED' : 'FAILED'}`);
    console.log(`  Total: ${summary.total}, Passed: ${summary.passed}, Failed: ${summary.failed}, Skipped: ${summary.skipped}`);
    console.log('');
    for (const r of results) {
      const icon = r.status === 'passed' ? '[PASS]' : r.status === 'failed' ? '[FAIL]' : '[SKIP]';
      console.log(`  ${icon} ${r.title} (${r.priority})`);
    }
    console.log('');
    console.log(`Evidence: ${evidencePath}`);
    console.log(`Report: ${reportPath}`);
    if (exists(docsDir)) {
      console.log(`Also copied to: ${docsDir}`);
    }
  }

  process.exit(summary.failed === 0 ? 0 : 1);
}

function commandFinish(args) {
  const workdir = getWorkdir(args);
  ensureWorkdir(workdir);
  const apply = !!args.apply;

  if (!isTempWorkdir(workdir)) {
    die(`Refusing to delete non-temp workdir: ${workdir}\nExpected under OS temp dir and containing /agent-builder/.`);
  }

  if (!apply) {
    console.log(`Dry-run: would delete ${workdir}`);
    console.log('Re-run with --apply to actually delete.');
    return;
  }

  fs.rmSync(workdir, { recursive: true, force: true });
  console.log(`Deleted workdir: ${workdir}`);
}

function main() {
  const args = parseArgs(process.argv);
  const cmd = args._[0];
  if (!cmd || cmd === '-h' || cmd === '--help') usage(0);

  if (cmd === 'start') return commandStart(args);
  if (cmd === 'status') return commandStatus(args);
  if (cmd === 'approve') return commandApprove(args);
  if (cmd === 'validate-blueprint') return commandValidateBlueprint(args);
  if (cmd === 'plan') return commandPlan(args);
  if (cmd === 'apply') return commandApply(args);
  if (cmd === 'verify') {
    return commandVerify(args).catch((e) => {
      console.error(`Verify failed: ${String(e && e.message ? e.message : e)}`);
      process.exit(1);
    });
  }
  if (cmd === 'finish') return commandFinish(args);

  usage(1);
}

main();
