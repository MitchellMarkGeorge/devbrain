import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Core runs in plain Node: the main process passes in what it needs from Electron (safeStorage,
// net.fetch, shell.openExternal), and tests pass fakes. So nothing under src/main/core imports
// Electron. electron-log and electron-store are the exceptions: they work outside Electron, and
// tests mock electron-store.
//
// The integration types the renderer will need are kept free of main-only imports, so they can move
// to src/common unchanged.

const coreDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

// every module specifier in static imports, re-exports, dynamic imports and requires
function specifiers(source: string): string[] {
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]));
}

describe('Core — module boundary', () => {
  const files = sourceFiles(coreDir);

  it('finds the core sources, tests included', () => {
    const relative = files.map((file) => path.relative(coreDir, file));
    expect(relative).toEqual(
      expect.arrayContaining(['devbrain.ts', 'workspace/workspace.ts', 'sync/scheduler.ts']),
    );
    expect(relative.some((file) => file.startsWith(`tests${path.sep}`))).toBe(true);
  });

  it('imports no Electron module anywhere under src/main/core', () => {
    const offending = files.flatMap((file) =>
      specifiers(fs.readFileSync(file, 'utf8'))
        .filter((specifier) => specifier === 'electron' || specifier.startsWith('electron/'))
        .map((specifier) => `${path.relative(coreDir, file)}: ${specifier}`),
    );
    expect(offending).toEqual([]);
  });

  it('keeps the shared integration types to the shared ids', () => {
    const file = path.join(coreDir, 'integrations/shared-types.ts');
    expect(specifiers(fs.readFileSync(file, 'utf8'))).toEqual(['@common/ids']);
  });
});
