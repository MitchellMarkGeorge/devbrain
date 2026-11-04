import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

/**
 * Runs Vitest on Electron's Node (ELECTRON_RUN_AS_NODE), with the arguments given:
 * `npm test -- src/main/core/tests/sync`. postinstall builds better-sqlite3 for Electron, so the
 * tests load the same native module as the app, on the Node version the app ships with, and
 * nothing is rebuilt for the system's Node.
 *
 * In Node, the `electron` package exports the binary's path for this platform.
 */
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));

const child = spawn(electronPath as unknown as string, [vitest, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});

// Ctrl+C reaches Vitest through the terminal, and this process waits for it to finish; a SIGTERM
// is passed on
process.on('SIGINT', () => {});
process.on('SIGTERM', () => child.kill('SIGTERM'));

child.on('error', (error) => {
  console.error(`Could not start Electron at ${electronPath}:`, error);
  process.exit(1);
});
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
