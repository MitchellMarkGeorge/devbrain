import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Provider } from '../../../integrations/types';

// The rule for oauth/: it holds the whole flow and names no provider. A provider adds OAuth by
// declaring an OAuthConfig; it never needs a change here.

const integrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../integrations',
);
const oauthDir = path.join(integrationsDir, 'oauth');
const providersDir = path.join(integrationsDir, 'providers');

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

describe('OAuth — module boundary', () => {
  const files = sourceFiles(oauthDir);

  it('finds the oauth sources', () => {
    expect(files.map((file) => path.basename(file)).sort()).toEqual(
      expect.arrayContaining(['client.ts', 'loopback.ts', 'pkce.ts', 'types.ts']),
    );
  });

  it('imports nothing from providers/', () => {
    const offending = files.flatMap((file) =>
      specifiers(fs.readFileSync(file, 'utf8'))
        .filter((specifier) => {
          if (specifier.startsWith('.')) {
            const resolved = path.resolve(path.dirname(file), specifier);
            return resolved === providersDir || resolved.startsWith(providersDir + path.sep);
          }
          return /(^|\/)integrations\/providers(\/|$)/.test(specifier);
        })
        .map((specifier) => `${path.relative(integrationsDir, file)}: ${specifier}`),
    );
    expect(offending).toEqual([]);
  });

  it('names no provider', () => {
    const names = Object.entries(Provider).flatMap(([key, value]) => [
      key.toLowerCase(),
      value,
      ...value.split('_'),
    ]);
    const pattern = new RegExp(`\\b(${[...new Set(names)].join('|')})\\b`, 'i');
    const offending = files.filter((file) => pattern.test(fs.readFileSync(file, 'utf8')));
    expect(offending.map((file) => path.relative(integrationsDir, file))).toEqual([]);
  });
});
