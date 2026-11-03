import { builtinModules } from 'node:module';
import pkg from '../package.json' with { type: 'json' };

// Dependencies bundled into the build rather than loaded by Node at runtime: ones with no ES module
// entry Node can read. rrule's `main` is a UMD bundle, whose named exports Node cannot see, and its
// ES module build is only named by `module`, a field bundlers read and Node does not.
const BUNDLED = new Set(['rrule']);

export function dependenciesToExternalize() {
  const dependencies = Object.keys(pkg.dependencies).filter((name) => !BUNDLED.has(name));
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
