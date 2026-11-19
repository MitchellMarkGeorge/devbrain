import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// What the app runs from: `npm run build` writes it, and `electron .` starts dist/main/index.js
export const BUILT_MAIN = path.join(REPO_ROOT, 'dist/main/index.js');

export const MIGRATIONS_PATH = path.join(REPO_ROOT, 'src/main/db/migrations');
