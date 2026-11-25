import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { getSchema, type JSONContent } from '@tiptap/core';
import { MarkdownCodec, createDocumentExtensions, stripMarkup } from '@renderer/editor/markdown';

// The markdown layer run over real markdown files (docs/editor.md, "Checking it on real
// files"). Not part of `npm test`: `npm run markdown:corpus -- <folder>…` sets MARKDOWN_CORPUS
// to the folders (and files) to read and MARKDOWN_REPORT to where the report is written.
//
// For every `.md` file it checks that reading never throws, that the source map's pieces are
// the text, that the unedited document saves as the text, that the editor's spelling is stable
// (written twice, it is the same), and that a save after an edit reads back as the document
// and leaves the rest of the text alone: at up to MARKDOWN_CORPUS_BLOCKS blocks of each file
// (8; 0 for every block), the block is edited, removed and followed by a new one.

const TARGETS = (process.env.MARKDOWN_CORPUS ?? '').split(path.delimiter).filter(Boolean);
const REPORT = process.env.MARKDOWN_REPORT;
const BLOCKS = Number(process.env.MARKDOWN_CORPUS_BLOCKS ?? 8);
// how many files are named for each problem
const NAMED = 10;

function markdownFiles(target: string, found: string[] = []): string[] {
  let stat;
  try {
    stat = statSync(target);
  } catch {
    return found;
  }
  if (stat.isFile()) {
    if (/\.(md|markdown)$/i.test(target)) found.push(target);
    return found;
  }
  if (!stat.isDirectory()) return found;
  for (const name of readdirSync(target)) {
    if (name !== '.git') markdownFiles(path.join(target, name), found);
  }
  return found;
}

// `node` with "zq" added to its last text outside code, or null when it has none
function withTextAdded(node: JSONContent): JSONContent | null {
  if (node.type === 'text') {
    const code = (node.marks ?? []).some((mark) => mark.type === 'code');
    return code ? null : { ...node, text: `${node.text}zq` };
  }
  if (node.type === 'codeBlock' || !node.content) return null;
  for (let k = node.content.length - 1; k >= 0; k -= 1) {
    const changed = withTextAdded(node.content[k]);
    if (changed) return { ...node, content: node.content.map((c, j) => (j === k ? changed : c)) };
  }
  return null;
}

interface Report {
  files: number;
  // by `UnmappedReason`
  noMap: Record<string, number>;
  mapped: number;
  // must all be 0: a text that could be lost or changed
  problems: Record<string, number>;
  // the files of each problem, the first few
  examples: Record<string, string[]>;
  // texts the editor's spelling writes differently the second time (no loss; the note changes
  // once more on its second edit)
  unstableSpelling: number;
  saves: number;
  keptText: number;
  // saves that wrote the whole document, by `WholeReason` and by what the save did
  wroteWhole: Record<string, number>;
  // saves whose document the editor's own spelling doesn't read back either (two lists brought
  // together): not counted as a problem
  unwritableAnyway: number;
  saveMs: { average: number; longest: number };
}

describe.skipIf(TARGETS.length === 0 || !REPORT)('the markdown layer on real files', () => {
  it('reads and saves every file without losing text', () => {
    const schema = getSchema(createDocumentExtensions());
    const codec = new MarkdownCodec(schema);
    const files = TARGETS.flatMap((target) => markdownFiles(path.resolve(target)));
    const report: Report = {
      files: files.length,
      noMap: {},
      mapped: 0,
      problems: {
        'reading threw': 0,
        'the map is not the text': 0,
        'unedited, it saved differently': 0,
        'a save threw': 0,
        'a save read back as another document': 0,
        'a save changed text outside its block': 0,
        'reading around the edit passed what the whole text did not': 0,
      },
      examples: {},
      unstableSpelling: 0,
      saves: 0,
      keptText: 0,
      wroteWhole: {},
      unwritableAnyway: 0,
      saveMs: { average: 0, longest: 0 },
    };
    const count = (table: Record<string, number>, key: string) => {
      table[key] = (table[key] ?? 0) + 1;
    };
    const problem = (what: string, file: string, detail = '') => {
      count(report.problems, what);
      const named = (report.examples[what] ??= []);
      if (named.length < NAMED) named.push(detail ? `${file} (${detail})` : file);
    };
    let totalMs = 0;
    const pm = (content: JSONContent[]) => schema.nodeFromJSON({ type: 'doc', content });
    // two documents' blocks the same but for the markers they were written with: as the schema
    // holds them, so an attribute left out and one at its default are the same
    const plain = (content: JSONContent[] | undefined) =>
      JSON.stringify(pm((content ?? []).map((node) => stripMarkup(node))).toJSON());
    const same = (a: JSONContent[] | undefined, b: JSONContent[]) => plain(a) === plain(b);

    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const { doc, source, reason } = codec.read(text);
      if (reason === 'unreadable') problem('reading threw', file);
      try {
        const once = codec.serialize(doc);
        if (codec.serialize(codec.parse(once)) !== once) {
          report.unstableSpelling += 1;
          const named = (report.examples['unstable spelling'] ??= []);
          if (named.length < NAMED) named.push(file);
        }
      } catch {
        problem('a save threw', file, 'whole document');
      }
      if (!source) {
        count(report.noMap, reason ?? 'unknown');
        continue;
      }
      report.mapped += 1;

      const sliced = source.blocks.filter((block) => block !== null);
      const pieces =
        sliced.map((block, k) => source.between[k] + text.slice(block.from, block.to)).join('') +
        source.between[sliced.length];
      if (pieces !== text) problem('the map is not the text', file);

      const children = doc.content ?? [];
      if (codec.serializeKeeping(pm(children), source) !== text) {
        problem('unedited, it saved differently', file);
      }

      // the slice each child was read from
      const sliceOf = source.blocks.flatMap((block) =>
        block ? block.nodes.map(() => block) : [null],
      );
      const withSlice = children.map((_, index) => index).filter((index) => sliceOf[index]);
      const step = BLOCKS > 0 ? Math.max(1, Math.ceil(withSlice.length / BLOCKS)) : 1;
      for (let n = 0; n < withSlice.length; n += step) {
        const index = withSlice[n];
        const { from, to } = sliceOf[index]!;
        const edited = withTextAdded(children[index]);
        const inserted = { type: 'paragraph', content: [{ type: 'text', text: 'Inserted' }] };
        const cases: [string, JSONContent[] | null][] = [
          ['edited', edited && children.map((child, k) => (k === index ? edited : child))],
          ['removed', children.length > 1 ? children.filter((_, k) => k !== index) : null],
          ['added', [...children.slice(0, index + 1), inserted, ...children.slice(index + 1)]],
        ];
        for (const [what, content] of cases) {
          if (!content) continue;
          report.saves += 1;
          const where = `block ${index} ${what}`;
          try {
            const start = performance.now();
            const written = codec.writeKeeping(pm(content), source, { check: 'both' });
            const ms = performance.now() - start;
            totalMs += ms;
            report.saveMs.longest = Math.max(report.saveMs.longest, ms);
            if (written.disagreed) {
              problem('reading around the edit passed what the whole text did not', file, where);
            }
            if (!same(codec.parse(written.markdown).content, content)) {
              // only a problem where the editor's own spelling of the document reads back
              const own = codec.parse(codec.serialize({ type: 'doc', content })).content;
              if (same(own, content)) problem('a save read back as another document', file, where);
              else report.unwritableAnyway += 1;
            }
            if (written.whole) {
              count(report.wroteWhole, `${written.whole}, a block ${what}`);
              continue;
            }
            report.keptText += 1;
            // the text before the block and after it is still there, in order; definitions may
            // have moved, so they are left out of both sides of the comparison
            const withoutDefinitions = (markdown: string) =>
              source.definitions.reduce(
                (rest, definition) => rest.replace(text.slice(definition.from, definition.to), ''),
                markdown,
              );
            const squeezed = (markdown: string) => withoutDefinitions(markdown).replace(/\s+/g, '');
            const saved = squeezed(written.markdown);
            const before = squeezed(text.slice(0, from));
            const after = squeezed(text.slice(to));
            if (!saved.startsWith(before) || !saved.endsWith(after)) {
              problem('a save changed text outside its block', file, where);
            }
          } catch {
            problem('a save threw', file, where);
          }
        }
      }
    }
    report.saveMs.average = report.saves ? Math.round((totalMs / report.saves) * 100) / 100 : 0;
    report.saveMs.longest = Math.round(report.saveMs.longest * 10) / 10;
    writeFileSync(REPORT!, `${JSON.stringify(report, null, 2)}\n`);
  }, 3_600_000);
});
