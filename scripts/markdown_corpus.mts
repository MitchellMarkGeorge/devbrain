import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Runs the editor's markdown layer over real markdown files, or times it (docs/editor.md,
 * "Checking it on real files"; docs/performance.md, "The editor's markdown"):
 *
 *   npm run markdown:corpus -- docs node_modules ~/notes     every .md under these, read and saved
 *   npm run markdown:corpus -- --all-blocks docs             an edit at every block, not eight a file
 *   npm run markdown:perf                                    timings on notes of 150 to 3,000 lines
 *
 * Both are Vitest files that `npm test` skips (src/renderer/tests/editor/corpus), run here on
 * Electron's Node like the tests. The corpus run exits with 1 when a text could be lost.
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const perf = args.includes('--perf');
const allBlocks = args.includes('--all-blocks');
const targets = args.filter((arg) => !arg.startsWith('--'));
if (!perf && targets.length === 0) {
  console.error('Usage: npm run markdown:corpus -- [--all-blocks] <folder or file>…');
  process.exit(2);
}

const folder = mkdtempSync(path.join(tmpdir(), 'devbrain-markdown-'));
const report = path.join(folder, 'report.json');
const test = perf ? 'markdown-perf.test.ts' : 'markdown-corpus.test.ts';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['test', '--', path.join('src/renderer/tests/editor/corpus', test)], {
  cwd: REPO_ROOT,
  stdio: ['ignore', 'ignore', 'inherit'],
  env: {
    ...process.env,
    ...(perf
      ? { MARKDOWN_PERF: report }
      : {
          MARKDOWN_REPORT: report,
          // from where the command was run, not the repository's root
          MARKDOWN_CORPUS: targets.map((target) => path.resolve(target)).join(path.delimiter),
          MARKDOWN_CORPUS_BLOCKS: allBlocks ? '0' : '8',
        }),
  },
});

let exit = result.status ?? 1;
try {
  const text = readFileSync(report, 'utf8');
  console.log(text);
  if (!perf) {
    const { problems } = JSON.parse(text) as { problems: Record<string, number> };
    const found = Object.values(problems).reduce((sum, count) => sum + count, 0);
    console.log(found === 0 ? 'No text was lost or changed.' : `${found} problems: see above.`);
    if (found > 0) exit = 1;
  }
} catch {
  console.error('The run wrote no report: it failed before finishing.');
  exit = exit || 1;
}
rmSync(folder, { recursive: true, force: true });
process.exit(exit);
