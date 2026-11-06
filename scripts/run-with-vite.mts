import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Runs a script that imports core: `tsx scripts/run-with-vite.mts <script> [args...]`.
 *
 * - On Electron's Node (ELECTRON_RUN_AS_NODE), like the tests (see vitest.mts): postinstall builds
 *   better-sqlite3 for Electron, so the system's Node can't load it.
 * - Through Vite's module runner, so imports resolve as they do in the main build and Vitest
 *   (the tsconfig path aliases, and packages such as rrule that Node's own loader reads
 *   differently).
 */
const [script, ...args] = process.argv.slice(2);
if (script === undefined) {
  console.error('Usage: run-with-vite.mts <script> [args...]');
  process.exit(1);
}

if (process.versions.electron === undefined) {
  // Not on Electron yet: run this file again on it. In Node, the `electron` package exports the
  // binary's path for this platform.
  const { default: electronPath } = await import('electron');
  const self = fileURLToPath(import.meta.url);
  const child = spawn(electronPath as unknown as string, [self, script, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });

  // Ctrl+C reaches the script through the terminal, and this process waits for it to finish; a
  // SIGTERM is passed on
  process.on('SIGINT', () => {});
  process.on('SIGTERM', () => child.kill('SIGTERM'));

  child.on('error', (error) => {
    console.error(`Could not start Electron at ${electronPath}:`, error);
    process.exit(1);
  });
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
} else {
  const { createServer, createServerModuleRunner } = await import('vite');
  const server = await createServer({
    configFile: false,
    resolve: { tsconfigPaths: true },
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    // Packages are left for Node to load, except those Node reads differently from Vite: rrule
    // has no "exports" map, so Node loads its UMD build as CommonJS (no named exports) while Vite
    // bundles its ESM build
    ssr: { noExternal: ['rrule'] },
    // Only the server side is used: don't scan for browser dependencies to pre-bundle
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const runner = createServerModuleRunner(server.environments.ssr, { hmr: false });

  // The script reads its own arguments from process.argv.slice(2)
  const file = path.resolve(script);
  process.argv = [process.argv[0], file, ...args];
  try {
    await runner.import(file);
  } finally {
    await runner.close();
    await server.close();
  }
}
