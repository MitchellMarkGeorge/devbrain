import { closeSync, existsSync, openSync, readFileSync, readSync } from 'node:fs';
import path from 'node:path';

/**
 * Checks what electron-builder put in a packaged app's resources folder (electron-builder.yml),
 * before the smoke check launches it. Returns what passed; throws on the first failure.
 *
 * - the app is an asar (app.asar, no app folder), holding the three builds and the fonts, and
 *   never a .env;
 * - better-sqlite3's native module is unpacked beside it, as a .node file can't be loaded from an
 *   asar;
 * - every migration in the journal is in resources/migrations (runtime/migrations.ts).
 */
export function checkPackageFiles(resourcesPath: string): string[] {
  const asarPath = path.join(resourcesPath, 'app.asar');
  if (!existsSync(asarPath)) throw new Error(`no app.asar in ${resourcesPath}`);
  if (existsSync(path.join(resourcesPath, 'app')))
    throw new Error(`${resourcesPath} has an unpacked app folder beside app.asar`);

  const files = listAsar(asarPath);
  for (const required of [
    'package.json',
    'dist/main/index.js',
    'dist/preload/index.cjs',
    'dist/renderer/index.html',
  ]) {
    if (!files.has(required)) throw new Error(`app.asar has no ${required}`);
  }
  const fonts = [...files].filter((file) => /^dist\/renderer\/assets\/.+\.woff2$/.test(file));
  if (fonts.length === 0) throw new Error('app.asar has no fonts in dist/renderer/assets');
  const env = [...files].filter((file) => path.posix.basename(file).startsWith('.env'));
  if (env.length > 0) throw new Error(`app.asar holds ${env.join(', ')}`);

  const native = path.join(
    resourcesPath,
    'app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  );
  if (!existsSync(native)) throw new Error(`better-sqlite3's native module is not at ${native}`);

  const migrations = path.join(resourcesPath, 'migrations');
  const journalPath = path.join(migrations, 'meta', '_journal.json');
  if (!existsSync(journalPath)) throw new Error(`no migrations journal at ${journalPath}`);
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] };
  const missing = journal.entries.filter(
    (entry) => !existsSync(path.join(migrations, `${entry.tag}.sql`)),
  );
  if (missing.length > 0)
    throw new Error(`migrations missing: ${missing.map((entry) => entry.tag).join(', ')}`);

  return [
    `app.asar holds the builds and ${fonts.length} font files, and no .env (${files.size} files)`,
    'better-sqlite3 unpacked beside it',
    `${journal.entries.length} migrations in resources/migrations`,
  ];
}

interface AsarEntry {
  files?: Record<string, AsarEntry>;
}

// The file paths in an asar archive. Its header is a JSON tree of the files after 16 bytes of
// sizes, the last of which is the JSON's length.
function listAsar(asarPath: string): Set<string> {
  const fd = openSync(asarPath, 'r');
  try {
    const sizes = Buffer.alloc(16);
    readSync(fd, sizes, 0, 16, 0);
    const length = sizes.readUInt32LE(12);
    const header = Buffer.alloc(length);
    readSync(fd, header, 0, length, 16);
    const root = JSON.parse(header.toString('utf8')) as AsarEntry;
    const files = new Set<string>();
    const walk = (entry: AsarEntry, prefix: string) => {
      for (const [name, child] of Object.entries(entry.files ?? {})) {
        const childPath = prefix === '' ? name : `${prefix}/${name}`;
        if (child.files) walk(child, childPath);
        else files.add(childPath);
      }
    };
    walk(root, '');
    return files;
  } finally {
    closeSync(fd);
  }
}
