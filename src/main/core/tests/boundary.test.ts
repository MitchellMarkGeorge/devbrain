import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Core runs in plain Node: the main process passes in what it needs from Electron (safeStorage,
// net.fetch, shell.openExternal, electron-store and electron-log), and tests pass fakes. So nothing
// under src/main/core imports Electron or its packages.
//
// The types IPC routes take and return (the DTOs), and their enums, live in src/common/types, shared
// with the renderer, which bundles them: they import only other src/common files and zod.

const coreDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commonDir = path.resolve(coreDir, '../../common');

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

  it('imports no Electron module or package anywhere under src/main/core', () => {
    const offending = files.flatMap((file) =>
      specifiers(fs.readFileSync(file, 'utf8'))
        .filter((specifier) => /^electron($|[/-])/.test(specifier))
        .map((specifier) => `${path.relative(coreDir, file)}: ${specifier}`),
    );
    expect(offending).toEqual([]);
  });

  it('keeps the DTO types in src/common/types, importing only src/common and zod', () => {
    expect(fs.existsSync(path.join(coreDir, 'integrations/shared-types.ts'))).toBe(false);
    const typesDir = path.join(commonDir, 'types');
    const typeFiles = sourceFiles(typesDir);
    expect(typeFiles.map((file) => path.relative(typesDir, file))).toEqual(
      expect.arrayContaining(['index.ts', 'tasks.ts', 'integrations.ts', 'settings.ts']),
    );
    const offending = typeFiles.flatMap((file) =>
      specifiers(fs.readFileSync(file, 'utf8'))
        .filter((specifier) => {
          if (specifier === 'zod') return false;
          if (!specifier.startsWith('.')) return true;
          const target = path.resolve(path.dirname(file), specifier);
          return path.relative(commonDir, target).startsWith('..');
        })
        .map((specifier) => `${path.relative(commonDir, file)}: ${specifier}`),
    );
    expect(offending).toEqual([]);
  });
});
