/**
 * python.mjs
 * Python detection utilities for tests
 */
import { runCommand } from './exec.mjs';

const PYTHON_CANDIDATES = [
  { cmd: 'python3', argsPrefix: [] },
  { cmd: 'python', argsPrefix: [] },
  { cmd: 'py', argsPrefix: ['-3'] }, // Windows launcher
];

function probePython(candidate) {
  const res = runCommand({
    cmd: candidate.cmd,
    args: [...candidate.argsPrefix, '-c', 'import sys; print(sys.executable)'],
    label: `probe-${candidate.cmd}`,
  });
  if (res.error) return null;
  if (res.code !== 0) return null;
  return {
    cmd: candidate.cmd,
    argsPrefix: candidate.argsPrefix,
    executable: String(res.stdout || '').trim(),
  };
}

export function pickPython() {
  for (const c of PYTHON_CANDIDATES) {
    const python = probePython(c);
    if (python) return python;
  }
  return null;
}

export function pythonHasModule(python, moduleName) {
  const res = runCommand({
    cmd: python.cmd,
    args: [...python.argsPrefix, '-c', `import ${moduleName}`],
    label: `python-import-${moduleName}`,
  });
  return !res.error && res.code === 0;
}
