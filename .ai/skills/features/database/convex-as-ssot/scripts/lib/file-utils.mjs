import fs from "node:fs";
import path from "node:path";

export function toPosixPath(p) {
  return String(p).replace(/\\/g, "/");
}

export function resolvePath(base, p) {
  if (!p) return null;
  if (path.isAbsolute(p)) return p;
  return path.resolve(base, p);
}

export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    return { op: "mkdir", path: dirPath };
  }
  return { op: "skip", path: dirPath, reason: "exists" };
}

export function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  return { op: "write", path: filePath };
}

export function writeTextIfMissing(filePath, content) {
  if (fs.existsSync(filePath)) {
    return { op: "skip", path: filePath, reason: "exists" };
  }
  return writeText(filePath, content);
}

export function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

export function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function writeJson(filePath, data) {
  return writeText(filePath, JSON.stringify(data, null, 2) + "\n");
}

export function listFilesRecursively(dirPath, predicate = null) {
  const out = [];
  if (!fs.existsSync(dirPath)) return out;

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (!predicate || predicate(full)) {
        out.push(full);
      }
    }
  }

  walk(dirPath);
  out.sort();
  return out;
}

export function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    return { command: "help", opts: {}, positionals: [] };
  }
  const command = args.shift();
  const opts = {};
  const positionals = [];
  while (args.length > 0) {
    const token = args.shift();
    if (token === "-h" || token === "--help") {
      return { command: "help", opts: {}, positionals: [] };
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      if (args.length > 0 && !args[0].startsWith("--")) {
        opts[key] = args.shift();
      } else {
        opts[key] = true;
      }
    } else {
      positionals.push(token);
    }
  }
  return { command, opts, positionals };
}
