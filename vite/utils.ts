import { builtinModules } from 'node:module';
import pkg from '../package.json' with { type: 'json' };

export function dependenciesToExternalize() {
  const dependencies = Object.keys(pkg.dependencies);
  // Node built-ins imported without the node: prefix (fs/promises in core/local) too: left to Vite,
  // they are replaced with an empty browser stub
  return [
    'electron',
    /^node:/,
    ...builtinModules,
    ...dependencies,
    new RegExp(`^(${dependencies.join('|')})/.+`),
  ];
}
