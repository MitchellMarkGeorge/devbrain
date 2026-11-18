import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRawHeader } from '@electron/asar';
import { FuseState, FuseV1Options, getCurrentFuseWire } from '@electron/fuses';

/**
 * Checks a packaged DevBrain (docs/security/hardening.md): Electron's fuses as electron-builder.yml
 * sets them, and what the asar holds. Run after `npm run compile`:
 *
 *   npm run check:package                                  # release/linux-unpacked
 *   npm run check:package -- release/DevBrain-0.0.1-x86_64.AppImage
 *   npm run check:package -- release/mac-arm64/DevBrain.app
 *   npm run check:package -- release/win-unpacked
 *
 * It reads the files only, and never starts the app (an AppImage is extracted, which runs its
 * AppImage runtime, not Electron). Exits 1, listing every failure, when a check fails.
 */

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCT_NAME = 'DevBrain';
// electron-builder names the Linux binary after package.json's name
const LINUX_EXECUTABLE = 'devbrain';

// What each fuse must read in the packaged binary, and why (docs/security/hardening.md)
const EXPECTED_FUSES: Record<FuseV1Options, { state: FuseState; why: string }> = {
  [FuseV1Options.RunAsNode]: {
    state: FuseState.DISABLE,
    why: 'ELECTRON_RUN_AS_NODE would run any script as DevBrain',
  },
  [FuseV1Options.EnableCookieEncryption]: {
    state: FuseState.ENABLE,
    why: 'cookies are encrypted with the OS key store',
  },
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: {
    state: FuseState.DISABLE,
    why: 'NODE_OPTIONS (--require) would load other code into main',
  },
  [FuseV1Options.EnableNodeCliInspectArguments]: {
    state: FuseState.DISABLE,
    why: '--inspect would let a debugger run code in main',
  },
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: {
    state: FuseState.ENABLE,
    why: 'the asar is checked against its hash (macOS and Windows)',
  },
  [FuseV1Options.OnlyLoadAppFromAsar]: {
    state: FuseState.ENABLE,
    why: 'the app is loaded from app.asar only, not an app folder beside it',
  },
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: {
    state: FuseState.DISABLE,
    why: 'there is no browser-specific snapshot to load',
  },
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: {
    state: FuseState.ENABLE,
    why: 'the page is loaded from file://',
  },
  // left as Electron sets it: WebAssembly's bounds checks through signal handlers, which the
  // WebAssembly needs to run at full speed; electron-builder 26's fuses option can't set it
  [FuseV1Options.WasmTrapHandlers]: {
    state: FuseState.ENABLE,
    why: "Electron's default, which electron-builder can't change",
  },
};

// Nothing in the asar may match these: local secrets, sources, tests and source maps
const FORBIDDEN_IN_ASAR: { pattern: RegExp; what: string }[] = [
  { pattern: /(^|\/)\.env(\.|$)/, what: 'a .env file' },
  { pattern: /\.map$/, what: 'a source map' },
  { pattern: /(^|\/)(tests?|__tests__|__mocks__)\//, what: 'a test folder' },
  { pattern: /\.(test|spec)\.[cm]?[jt]sx?$/, what: 'a test file' },
  { pattern: /^src\//, what: 'the sources' },
  { pattern: /^\.dev\//, what: 'the development DevBrain folder' },
];

const failures: string[] = [];
const fail = (message: string) => failures.push(message);

interface Packaged {
  binary: string;
  resources: string;
}

// The binary and the resources folder of a packaged app: a .app, a linux-unpacked or win-unpacked
// folder, or an AppImage (extracted into a temporary folder, removed on exit)
function locate(target: string): Packaged {
  if (target.endsWith('.app')) {
    return {
      binary: path.join(target, 'Contents', 'MacOS', PRODUCT_NAME),
      resources: path.join(target, 'Contents', 'Resources'),
    };
  }
  if (target.endsWith('.AppImage')) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'devbrain-appimage-'));
    process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
    execFileSync(path.resolve(target), ['--appimage-extract'], { cwd: dir, stdio: 'ignore' });
    return locate(path.join(dir, 'squashfs-root'));
  }
  const windows = path.join(target, `${PRODUCT_NAME}.exe`);
  return {
    binary: existsSync(windows) ? windows : path.join(target, LINUX_EXECUTABLE),
    resources: path.join(target, 'resources'),
  };
}

async function checkFuses(binary: string) {
  const wire = await getCurrentFuseWire(binary);
  for (const [index, { state, why }] of Object.entries(EXPECTED_FUSES)) {
    const option = Number(index) as FuseV1Options;
    const name = FuseV1Options[option];
    const actual = wire[option];
    if (actual !== state) {
      fail(
        `fuse ${name} is ${FuseState[actual as FuseState] ?? actual}, expected ${FuseState[state]}: ${why}`,
      );
    }
  }
  // a fuse added by a later Electron: decide what it should be, then add it above
  const known = new Set(Object.keys(EXPECTED_FUSES).map(Number));
  for (const key of Object.keys(wire)) {
    const index = Number(key);
    if (Number.isInteger(index) && !known.has(index)) {
      fail(`fuse ${index} is not checked: add it to EXPECTED_FUSES and electron-builder.yml`);
    }
  }
}

interface AsarEntry {
  files?: Record<string, AsarEntry>;
  unpacked?: boolean;
  link?: string;
}

// every file in the asar's header, with whether it is unpacked beside it
function asarFiles(archive: string): { file: string; unpacked: boolean }[] {
  const { header } = getRawHeader(archive) as { header: AsarEntry };
  const files: { file: string; unpacked: boolean }[] = [];
  const walk = (entry: AsarEntry, prefix: string) => {
    for (const [name, child] of Object.entries(entry.files ?? {})) {
      const file = prefix ? `${prefix}/${name}` : name;
      if (child.files) walk(child, file);
      else files.push({ file, unpacked: child.unpacked === true });
    }
  };
  walk(header, '');
  return files;
}

function checkAsar(resources: string) {
  const archive = path.join(resources, 'app.asar');
  if (!existsSync(archive)) {
    fail(`no app.asar in ${resources}`);
    return;
  }
  if (existsSync(path.join(resources, 'app'))) {
    fail('an app folder sits beside app.asar');
  }
  const files = asarFiles(archive);
  for (const { file } of files) {
    for (const { pattern, what } of FORBIDDEN_IN_ASAR) {
      if (pattern.test(file)) fail(`the asar holds ${what}: ${file}`);
    }
  }
  for (const entry of [
    'package.json',
    'dist/main/index.js',
    'dist/preload/index.cjs',
    'dist/renderer/index.html',
  ]) {
    if (!files.some(({ file }) => file === entry)) fail(`the asar has no ${entry}`);
  }

  // A native module can't be loaded from inside an asar: each must be unpacked, and be there
  const natives = files.filter(({ file }) => file.endsWith('.node'));
  if (!natives.some(({ file }) => file.endsWith('better_sqlite3.node'))) {
    fail('the asar lists no better_sqlite3.node');
  }
  for (const { file, unpacked } of natives) {
    if (!unpacked) fail(`native module ${file} is packed in the asar, not unpacked`);
    else if (!existsSync(path.join(resources, 'app.asar.unpacked', file))) {
      fail(`native module ${file} is missing from app.asar.unpacked`);
    }
  }
}

// nothing outside the asar either: no .env anywhere in the resources folder
function checkResources(resources: string) {
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (/^\.env(\.|$)/.test(name)) fail(`the package holds ${path.relative(resources, full)}`);
      if (statSync(full).isDirectory()) walk(full);
    }
  };
  walk(resources);

  // the migrations ship as an extra resource (src/main/runtime/migrations.ts)
  const shipped = path.join(resources, 'migrations');
  const source = path.join(REPO_ROOT, 'src/main/db/migrations');
  const sql = (dir: string) =>
    readdirSync(dir)
      .filter((name) => name.endsWith('.sql'))
      .sort();
  if (!existsSync(path.join(shipped, 'meta', '_journal.json'))) {
    fail('resources/migrations has no meta/_journal.json');
  } else if (sql(shipped).join() !== sql(source).join()) {
    fail('resources/migrations does not hold the same migrations as src/main/db/migrations');
  }
}

async function main() {
  const target = path.resolve(process.argv[2] ?? path.join(REPO_ROOT, 'release/linux-unpacked'));
  if (!existsSync(target)) {
    console.error(`No package at ${target}: run npm run compile first.`);
    process.exit(1);
  }
  const { binary, resources } = locate(target);
  if (!existsSync(binary)) fail(`no binary at ${binary}`);
  else await checkFuses(binary);
  checkAsar(resources);
  checkResources(resources);

  if (failures.length > 0) {
    console.error(`The package at ${target} failed ${failures.length} check(s):`);
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  console.log(`The package at ${target} passed: fuses set, asar clean, native modules unpacked.`);
}

await main();
