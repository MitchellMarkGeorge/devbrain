import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import * as ours from '@renderer/editor/markdown';
import * as tiptap from './tiptap-markdown';

// The markdown layer against @tiptap/markdown, which it replaces: the same JSON and the same
// markdown for each fixture. PARITY_CORPUS=<dir> adds every .md file under a directory.

const FIXTURES = path.resolve(__dirname, '../fixtures/real-world');

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return name === '.git' ? [] : markdownFiles(file);
    return /\.(md|markdown|mdx)$/i.test(name) ? [file] : [];
  });
}

const files = [
  ...markdownFiles(FIXTURES),
  ...(process.env.PARITY_CORPUS ? markdownFiles(process.env.PARITY_CORPUS) : []),
];

// as text: toEqual is slow on a long document's tree, and undefined fields drop out either way
const json = (value: unknown) => JSON.stringify(value);

// the same text, or a failure showing where the two first differ (a whole note is too long to diff)
function expectSame(actual: string, expected: string, label: string) {
  if (actual === expected) return;
  let at = 0;
  while (actual[at] === expected[at]) at += 1;
  const around = (text: string) => JSON.stringify(text.slice(Math.max(0, at - 200), at + 200));
  expect.fail(
    `${label} differs at ${at}:\n ours:   ${around(actual)}\n tiptap: ${around(expected)}`,
  );
}

function editorOf(extensions: ReturnType<typeof ours.createDocumentExtensions>, content: string) {
  return new Editor({ extensions, content, contentType: 'markdown' });
}

describe('parity with @tiptap/markdown', { timeout: 120_000 }, () => {
  for (const file of files) {
    const markdown = readFileSync(file, 'utf8');
    const name = path.relative(process.cwd(), file);
    it(name, () => {
      const theirs = tiptap.parseMarkdown(markdown);
      expectSame(json(ours.parseMarkdown(markdown)), json(theirs), 'json');
      expectSame(ours.serializeMarkdown(theirs), tiptap.serializeMarkdown(theirs), 'markdown');
      expectSame(
        ours.normalizeMarkdown(markdown),
        tiptap.normalizeMarkdown(markdown),
        'normalized',
      );
    });
    // PARITY_EDITORS=0 skips these: each editor adds @tiptap/markdown's tokenizers to marked again
    it.skipIf(process.env.PARITY_EDITORS === '0')(`${name} in an editor`, () => {
      const mine = editorOf(ours.createDocumentExtensions(), markdown);
      const theirs = editorOf(tiptap.createDocumentExtensions(), markdown);
      expectSame(json(mine.getJSON()), json(theirs.getJSON()), 'editor json');
      expectSame(mine.getMarkdown(), theirs.getMarkdown(), 'editor markdown');
      mine.destroy();
      theirs.destroy();
    });
  }
});
