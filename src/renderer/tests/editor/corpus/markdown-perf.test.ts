import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { MarkdownCodec, createDocumentExtensions } from '@renderer/editor/markdown';

// How long the markdown layer takes on a long note (docs/performance.md, "The editor's
// markdown"). Not part of `npm test`: run it with `npm run markdown:perf`, which sets
// MARKDOWN_PERF to the file the timings are written to.

const REPORT = process.env.MARKDOWN_PERF;

const fixtures = Object.values(
  import.meta.glob<string>('../fixtures/real-world/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
);

// a note of about `lines` lines: the real-world fixtures one after another, each under a heading
function noteOf(lines: number): string {
  const parts: string[] = [];
  let count = 0;
  for (let index = 0; count < lines; index += 1) {
    const text = `## Section ${index + 1}\n\n${fixtures[index % fixtures.length].trim()}`;
    parts.push(text);
    count += text.split('\n').length + 1;
  }
  return `${parts.join('\n\n')}\n`;
}

function median(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function timed(runs: number, work: () => void): number {
  const times: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const start = performance.now();
    work();
    times.push(performance.now() - start);
  }
  return Math.round(median(times) * 10) / 10;
}

describe.skipIf(!REPORT)('the markdown layer on a long note', () => {
  it('reads, and saves an edit, within the budget', () => {
    const schema = getSchema(createDocumentExtensions());
    const codec = new MarkdownCodec(schema);
    const rows = [150, 750, 3000].map((lines) => {
      const text = noteOf(lines);
      const read = timed(9, () => codec.read(text));
      const { doc: json, source } = codec.read(text);
      const doc = schema.nodeFromJSON(json);
      // a paragraph in the middle typed in, as an edit leaves the document: every other block
      // the very node it was
      const at = Math.floor(doc.childCount / 2);
      const edited = (suffix: string): ProseMirrorNode =>
        doc.copy(
          doc.content.replaceChild(
            at,
            schema.nodes.paragraph.create(null, schema.text(`Typed in the middle ${suffix}`)),
          ),
        );
      // the first save lines the document up with the source; the ones after it are the edits
      codec.writeKeeping(edited('0'), source);
      let keystroke = 0;
      const save = timed(25, () => {
        keystroke += 1;
        const written = codec.writeKeeping(edited(String(keystroke)), source);
        expect(written.whole).toBeNull();
      });
      const whole = timed(9, () => codec.serialize(doc.toJSON()));
      const added = timed(25, () => {
        keystroke += 1;
        const more = doc.copy(
          doc.content.append(
            Fragment.from(schema.nodes.paragraph.create(null, schema.text(`New ${keystroke}`))),
          ),
        );
        expect(codec.writeKeeping(more, source).whole).toBeNull();
      });
      return {
        lines: text.split('\n').length,
        blocks: doc.childCount,
        kilobytes: Math.round(text.length / 1024),
        readMs: read,
        saveEditMs: save,
        saveAddedMs: added,
        writeWholeMs: whole,
      };
    });
    writeFileSync(REPORT!, `${JSON.stringify(rows, null, 2)}\n`);
  }, 600_000);
});
