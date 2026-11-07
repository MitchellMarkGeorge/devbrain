import { Generator, getConfig } from '@tanstack/router-generator';
import { routerGeneratorConfig } from '../vite/router-generator';

/**
 * Generates src/renderer/routeTree.gen.ts from the route files in src/renderer/routes, as the
 * renderer's Vite plugin does on every build and while `npm run dev` runs. For when a route file
 * changes without either running: the tree is checked in, and the typecheck and tests read it.
 * (@tanstack/router-generator comes with @tanstack/router-plugin.)
 */
const config = getConfig(routerGeneratorConfig);
await new Generator({ config, root: process.cwd() }).run();
console.log(`Generated ${config.generatedRouteTree}`);
