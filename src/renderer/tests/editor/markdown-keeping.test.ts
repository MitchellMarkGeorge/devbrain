import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { JSONContent } from '@tiptap/core';
import {
  markdownBlocks,
  parseMarkdown,
  serializeKeepingSource,
  serializeMarkdown,
} from '@renderer/editor/markdown';

// A save rewrites only the blocks that changed (docs/editor.md, "What a save changes"). Each
// fixture is markdown as people and other apps write it (a README, Obsidian notes, a GitHub pull
// request, a Linear issue, the seed and showcase workspaces' notes), and every block of it is
// edited, removed and followed by a new one in turn: what is saved must read back as the edited
// document, and change nothing outside that block and the text around it. Each runs again with
// Windows line ends.

// from the repository's root, where the tests run (a DOM's import.meta.url is not a file: URL)
const fixtures = path.resolve('src/renderer/tests/editor/fixtures/real-world');
const FIXTURES = readdirSync(fixtures)
  .filter((name) => name.endsWith('.md'))
  .map((name) => ({ name, text: readFileSync(path.join(fixtures, name), 'utf8') }));

const inserted: JSONContent = { type: 'paragraph', content: [{ type: 'text', text: 'Inserted' }] };

// `node` with "zq" added to its last text outside code, or null when it has none
function withTextAdded(node: JSONContent): JSONContent | null {
  if (node.type === 'text') {
    const code = (node.marks ?? []).some((mark) => mark.type === 'code');
    return code ? null : { ...node, text: `${node.text}zq` };
  }
  if (node.type === 'codeBlock' || !node.content) return null;
  for (let k = node.content.length - 1; k >= 0; k--) {
    const changed = withTextAdded(node.content[k]);
    if (changed) return { ...node, content: replaced(node.content, k, changed) };
  }
  return null;
}

function replaced<T>(list: T[], index: number, item: T): T[] {
  return list.map((other, k) => (k === index ? item : other));
}

// the definitions a save writes at the end when the text that held them is gone
function withoutMovedDefinitions(saved: string, text: string): string {
  return saved.replace(/\n\n(?:\[[^\]\n]+\]:[^\n]*\n?)+$/, text.endsWith('\n') ? '\n' : '');
}

describe.each([
  ['\\n', (text: string) => text],
  ['\\r\\n', (text: string) => text.replace(/\n/g, '\r\n')],
])('saving real-world markdown with %s line ends', (_, lineEnds) => {
  it.each(FIXTURES)('$name', ({ text: lf }) => {
    const text = lineEnds(lf);
    const read = parseMarkdown(text);
    expect(serializeKeepingSource(text, read)).toBe(text);
    const slices = markdownBlocks(text);
    expect(slices).not.toBeNull();
    // made from the tokens the text was read into, as when the editor loads it, or read again
    expect(markdownBlocks(text, true)).toEqual(slices);
    const children = read.content ?? [];
    expect(slices).toHaveLength(children.length);
    let checked = 0;

    // `content` saved keeps the text before `from` (a slice's end) and after `to` (a slice's start)
    const expectSaved = (content: JSONContent[], from: number, to: number, what: string) => {
      const doc = { ...read, content };
      const saved = serializeKeepingSource(text, doc);
      const reread = parseMarkdown(saved);
      if (!isDeepStrictEqual(reread, doc)) {
        // only where the editor's own spelling can't write it either (two lists brought together)
        expect(parseMarkdown(serializeMarkdown(doc)), what).not.toEqual(doc);
        return;
      }
      if (text.includes('\r\n')) expect(saved.replace(/\r\n/g, ''), what).not.toContain('\n');
      const savedLf = saved.replace(/\r\n/g, '\n');
      const keeps = (kept: string) =>
        kept.startsWith(lf.slice(0, from)) && kept.endsWith(lf.slice(to));
      expect(
        keeps(savedLf) || keeps(withoutMovedDefinitions(savedLf, lf)),
        `${what}: ${saved}`,
      ).toBe(true);
      checked += 1;
    };

    children.forEach((child, index) => {
      const slice = slices![index];
      if (!slice) return;
      const previous = index === 0 ? 0 : slices![index - 1]?.[1];
      const next = index === children.length - 1 ? lf.length : slices![index + 1]?.[0];
      const changed = withTextAdded(child);
      // edited, it is written in its place, with the text around it as it was
      if (changed)
        expectSaved(
          replaced(children, index, changed),
          slice[0],
          slice[1],
          `block ${index} edited`,
        );
      if (previous !== undefined && next !== undefined && children.length > 1) {
        const removed = children.filter((_, k) => k !== index);
        expectSaved(removed, previous, next, `block ${index} removed`);
      }
      if (next !== undefined) {
        const added = [...children.slice(0, index + 1), inserted, ...children.slice(index + 1)];
        expectSaved(added, slice[1], next, `a block added after block ${index}`);
      }
    });
    expect(checked).toBeGreaterThan(children.length);
  });
});
