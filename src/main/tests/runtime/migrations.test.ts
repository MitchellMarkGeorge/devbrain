import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsPath } from '../../runtime/migrations';

const repoRoot = path.resolve('/repo');
const resourcesPath = path.resolve('/app/resources');

describe('migrationsPath', () => {
  it('is the resources folder in the packaged app, whatever .env says', () => {
    expect(
      migrationsPath({ isPackaged: true, resourcesPath, repoRoot, override: 'elsewhere' }),
    ).toBe(path.join(resourcesPath, 'migrations'));
  });

  it("is the repository's in development", () => {
    expect(migrationsPath({ isPackaged: false, resourcesPath, repoRoot })).toBe(
      path.join(repoRoot, 'src/main/db/migrations'),
    );
  });

  it('takes an override relative to the repository in development', () => {
    expect(
      migrationsPath({
        isPackaged: false,
        resourcesPath,
        repoRoot,
        override: './other/migrations',
      }),
    ).toBe(path.join(repoRoot, 'other/migrations'));
  });
});
