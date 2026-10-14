import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The real cipher over Electron's safeStorage, which only exists inside an Electron main process.
// Vitest runs in Node, so this test starts Electron on a small script (fixtures/
// safe-storage-check.mjs) that exercises the cipher and prints what it saw. On Linux it runs
// headless, with no display or keyring needed: `--password-store=basic` keeps it off the desktop
// keyring, which could ask to be unlocked. On macOS the first use of the keychain can prompt, so it
// runs there only with DEVBRAIN_ELECTRON_TESTS=1.

const fixture = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/safe-storage-check.mjs',
);
const ELECTRON_ARGS = [
  '--no-sandbox',
  '--ozone-platform=headless',
  '--disable-gpu',
  '--password-store=basic',
];

// the environment Electron runs in: as an app, not as Node
function electronEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

// the Electron binary, or why this test can't start it here
function findElectron(): { path: string } | { skip: string } {
  if (process.platform === 'darwin' && process.env.DEVBRAIN_ELECTRON_TESTS !== '1') {
    return { skip: 'the keychain may prompt on macOS; set DEVBRAIN_ELECTRON_TESTS=1 to run it' };
  }
  // Read where the electron package keeps the binary rather than requiring it: requiring it
  // downloads a missing binary, and a test must not reach the network.
  const packageDir = path.dirname(createRequire(import.meta.url).resolve('electron/package.json'));
  const pathFile = path.join(packageDir, 'path.txt');
  const electronPath = fs.existsSync(pathFile)
    ? path.join(packageDir, 'dist', fs.readFileSync(pathFile, 'utf8'))
    : null;
  if (electronPath === null || !fs.existsSync(electronPath)) {
    return { skip: 'the Electron binary is not installed (npm ci --ignore-scripts skips it)' };
  }
  const probe = spawnSync(electronPath, [...ELECTRON_ARGS, '--version'], {
    env: electronEnv(),
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (probe.status !== 0) {
    const reason = (probe.error?.message ?? probe.stderr).trim().split('\n')[0];
    return { skip: `Electron does not start here: ${reason}` };
  }
  return { path: electronPath };
}

const electron = findElectron();

interface Settled<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

interface CheckResult {
  crashed?: string;
  available: boolean;
  safeStorageAvailable: boolean;
  encryptedIsBuffer: boolean;
  encryptedHoldsPlain: boolean;
  decrypted: Settled<{ result: string; shouldReEncrypt: boolean }>;
  garbage: Settled<unknown>;
  devBlob: Settled<{ result: string; shouldReEncrypt: boolean }>;
  devBlobRefused: Settled<unknown>;
  devAwareDecrypted: Settled<{ result: string; shouldReEncrypt: boolean }>;
}

const PLAIN = '{"type":"api_key","apiKey":"lin_api_round_trip"}';

// a skipped run names its reason in the suite's title
const title = `safeStorage cipher — under Electron${'skip' in electron ? ` (skipped: ${electron.skip})` : ''}`;

describe.skipIf('skip' in electron)(title, () => {
  // one Electron run for every check; it takes a second or two
  let checked: CheckResult | null = null;
  function check(): CheckResult {
    if (checked) return checked;
    const run = spawnSync((electron as { path: string }).path, [...ELECTRON_ARGS, fixture], {
      env: electronEnv(),
      encoding: 'utf8',
      timeout: 60_000,
    });
    const line = run.stdout.split('\n').find((text) => text.startsWith('RESULT '));
    if (!line) throw new Error(`Electron printed no result:\n${run.stdout}\n${run.stderr}`);
    checked = JSON.parse(line.slice('RESULT '.length)) as CheckResult;
    expect(checked.crashed).toBeUndefined();
    return checked;
  }

  it('reports availability as safeStorage does', { timeout: 60_000 }, () => {
    const result = check();
    expect(result.available).toBe(result.safeStorageAvailable);
    expect(result.available).toBe(true);
  });

  it(
    'round-trips a string, and the blob does not hold it in the clear',
    { timeout: 60_000 },
    () => {
      const result = check();
      expect(result.encryptedIsBuffer).toBe(true);
      expect(result.encryptedHoldsPlain).toBe(false);
      expect(result.decrypted).toEqual({
        ok: true,
        value: { result: PLAIN, shouldReEncrypt: false },
      });
    },
  );

  it('rejects a blob safeStorage did not write', { timeout: 60_000 }, () => {
    expect(check().garbage.ok).toBe(false);
  });

  it(
    'in development, reads a dev cipher blob and asks for it to be stored again',
    {
      timeout: 60_000,
    },
    () => {
      const result = check();
      expect(result.devBlob).toEqual({ ok: true, value: { result: PLAIN, shouldReEncrypt: true } });
      expect(result.devAwareDecrypted).toEqual({
        ok: true,
        value: { result: PLAIN, shouldReEncrypt: false },
      });
    },
  );

  it('otherwise refuses a dev cipher blob', { timeout: 60_000 }, () => {
    expect(check().devBlobRefused.ok).toBe(false);
  });
});
