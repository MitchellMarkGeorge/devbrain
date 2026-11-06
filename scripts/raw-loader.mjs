import { register } from 'node:module';

/**
 * Lets a script run with tsx load core, which imports some files as text with Vite's `?raw`
 * (the OAuth loopback's page.html and the logomark SVGs): `tsx --import ./scripts/raw-loader.mjs`.
 * The main build and Vitest handle `?raw` themselves.
 */
const hooks = `
import { readFile } from 'node:fs/promises';
export async function load(url, context, nextLoad) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'file:' || parsed.search !== '?raw') return nextLoad(url, context);
  parsed.search = '';
  const text = await readFile(parsed, 'utf8');
  return { format: 'module', source: 'export default ' + JSON.stringify(text), shortCircuit: true };
}
`;

register(`data:text/javascript,${encodeURIComponent(hooks)}`);
