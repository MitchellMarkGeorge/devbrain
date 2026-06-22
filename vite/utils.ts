import pkg from '../package.json' with { type: 'json' };

export function dependenciesToExternalize() {
  const dependencies = Object.keys(pkg.dependencies);
  return ['electron', /^node:/, ...dependencies, new RegExp(`^(${dependencies.join('|')})/.+`)];
}
