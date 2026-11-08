import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// TanStack Router's file routes: what the Vite plugin (vite/renderer.config.ts) and
// `npm run routes` read. The generated tree is checked in, so the tests and the typecheck run
// without a build. No code splitting: the bundle loads from disk, so splitting only adds work.
export const routerGeneratorConfig = {
  target: 'react' as const,
  routesDirectory: path.join(REPO_ROOT, 'src/renderer/routes'),
  generatedRouteTree: path.join(REPO_ROOT, 'src/renderer/routeTree.gen.ts'),
  autoCodeSplitting: false,
  // the route files' pieces that are not routes live under src/renderer/pages
  routeFileIgnorePrefix: '-',
  quoteStyle: 'single' as const,
  semicolons: true,
};
