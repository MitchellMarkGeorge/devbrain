import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { chromium } from 'playwright-core';

/**
 * Checks the built Storybook (`npm run build-storybook`) with axe in a real browser, in the dark and
 * light themes: what the axe test in src/renderer/tests/routing can't see under happy-dom, chiefly
 * colour contrast and target sizes. See docs/accessibility.md.
 *
 *   npm run a11y:storybook                    every Screens/* story
 *   npm run a11y:storybook -- lists-taskrow   the stories whose id contains it
 *
 * Prints the violations by rule and writes them all to dist/axe-storybook.json. Needs a Chromium:
 * Playwright's own (`npx playwright install chromium`), or one at CHROMIUM_PATH.
 */
const ROOT = path.resolve('dist/storybook');
const filter = process.argv[2] ?? 'screens-';
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
};

if (!existsSync(path.join(ROOT, 'index.json'))) {
  console.error('No dist/storybook: run `npm run build-storybook` first.');
  process.exit(1);
}

interface Entry {
  id: string;
  type: string;
}
const index = JSON.parse(readFileSync(path.join(ROOT, 'index.json'), 'utf8')) as {
  entries: Record<string, Entry>;
};
const stories = Object.values(index.entries).filter(
  (entry) => entry.type === 'story' && entry.id.includes(filter),
);

const server = createServer((request, response) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(request.url!, 'http://x').pathname));
  if (!file.startsWith(ROOT) || !existsSync(file)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
  });
  createReadStream(file).pipe(response);
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address() as { port: number };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
interface Found {
  story: string;
  theme: string;
  rule: string;
  impact: string | null | undefined;
  target: string;
  summary: string;
}
const found: Found[] = [];
const jobs = stories.flatMap((story) =>
  (['dark', 'light'] as const).map((theme) => ({ story, theme })),
);
let next = 0;
async function worker() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  while (next < jobs.length) {
    const { story, theme } = jobs[next++];
    await page.goto(
      `http://127.0.0.1:${port}/iframe.html?id=${story.id}&viewMode=story&globals=theme:${theme}`,
    );
    await page.waitForSelector('#storybook-root > *', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    for (const violation of results.violations)
      for (const node of violation.nodes)
        found.push({
          story: story.id,
          theme,
          rule: violation.id,
          impact: violation.impact,
          target: node.target.join(' '),
          summary: node.failureSummary ?? '',
        });
  }
  await context.close();
}
await Promise.all([worker(), worker(), worker(), worker()]);
await browser.close();
server.close();

writeFileSync('dist/axe-storybook.json', JSON.stringify(found, null, 1));
const byRule = new Map<string, Found[]>();
for (const item of found) byRule.set(item.rule, [...(byRule.get(item.rule) ?? []), item]);
console.log(`${stories.length} stories, ${jobs.length} checks: ${found.length} violations`);
for (const [rule, items] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
  const where = new Set(items.map((item) => `${item.story} (${item.theme})`));
  console.log(`\n${rule} (${items[0].impact}): ${items.length} in ${where.size} stories`);
  for (const story of [...where].slice(0, 5)) console.log(`  ${story}`);
}
