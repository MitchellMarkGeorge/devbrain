import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { getSchema, type JSONContent } from '@tiptap/core';
import { MarkdownCodec, createDocumentExtensions, stripMarkup } from '@renderer/editor/markdown';

// Properties of the markdown layer, checked on generated documents and texts rather than chosen
// cases (docs/editor.md, "Checking it on real files"). `npm test` runs each on a few hundred
// cases; MARKDOWN_PROPERTY_RUNS=10000 runs as many as the plan asks for before a release.

const RUNS = Number(process.env.MARKDOWN_PROPERTY_RUNS ?? 300);
// a case takes a few milliseconds; the slowest machine gets ten times that
const TIMEOUT = 5_000 + RUNS * 50;

const schema = getSchema(createDocumentExtensions());
const codec = new MarkdownCodec(schema);

const pm = (content: JSONContent[]) => schema.nodeFromJSON({ type: 'doc', content });
// a document as the schema holds it, without the markers its text was written with
const plain = (content: JSONContent[] | undefined) =>
  pm((content ?? []).map((node) => stripMarkup(node))).toJSON() as JSONContent;

// ---- documents the editor can make, and markdown can say

// Words of letters, digits and the characters markdown gives a meaning, which the writer has to
// escape. A word never starts or ends with a space (a paragraph's own are not kept), and words
// are joined by one space.
const word = fc
  .array(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCXYZ0123456789',
      ...'*_#[]()&~!+-=.:;,?/\'"$%^{}<>@|',
      'é',
      '日',
      '🙂',
    ),
    { minLength: 1, maxLength: 8 },
  )
  .map((characters) => characters.join(''))
  // a bare address reads as a link, by design (`www.example.com`, `https://…`, `a@b.c`)
  .filter((text) => !/www\.|[a-z]:\/\/|[a-z0-9]@|@[a-z0-9]/i.test(text));
const words = fc.array(word, { minLength: 1, maxLength: 6 }).map((list) => list.join(' '));

const mark = fc.constantFrom('bold', 'italic', 'strike', 'code');
// a run of text with at most one mark: runs side by side differ in their mark, so they stay apart
const inline = fc
  .array(fc.tuple(words, fc.option(mark, { nil: null })), { minLength: 1, maxLength: 4 })
  .map((runs) => {
    const content: JSONContent[] = [];
    runs.forEach(([text, type], index) => {
      const previous = runs[index - 1]?.[1];
      // the same mark twice in a row would be one run; and a space keeps two runs apart, as
      // `**a****b**` is not two bold words
      const marks = type && type !== previous ? [{ type }] : undefined;
      if (index > 0) content.push({ type: 'text', text: ' ' });
      content.push(marks ? { type: 'text', text, marks } : { type: 'text', text });
    });
    // as the editor holds it: text side by side with the same marks is one run of text
    return schema.nodes.paragraph
      .create(
        null,
        content.map((node) => schema.nodeFromJSON(node)),
      )
      .toJSON().content as JSONContent[];
  });

const paragraph = inline.map((content): JSONContent => ({ type: 'paragraph', content }));
const heading = fc
  .tuple(fc.integer({ min: 1, max: 6 }), inline)
  .map(([level, content]): JSONContent => ({ type: 'heading', attrs: { level }, content }));
const codeBlock = fc
  .tuple(
    fc.constantFrom(null, 'ts', 'bash', 'json'),
    fc.array(fc.oneof(words, fc.constant('```'), fc.constant('  indented')), {
      minLength: 1,
      maxLength: 4,
    }),
  )
  .map(
    ([language, lines]): JSONContent => ({
      type: 'codeBlock',
      attrs: { language },
      content: [{ type: 'text', text: lines.join('\n') }],
    }),
  );
const rule = fc.constant<JSONContent>({ type: 'horizontalRule' });

const item = (
  type: string,
  attrs: fc.Arbitrary<Record<string, unknown> | undefined>,
  nested?: fc.Arbitrary<JSONContent>,
) =>
  fc.tuple(attrs, paragraph, nested ? fc.option(nested, { nil: null }) : fc.constant(null)).map(
    ([itemAttrs, first, list]): JSONContent => ({
      type,
      ...(itemAttrs && { attrs: itemAttrs }),
      content: list ? [first, list] : [first],
    }),
  );
const listOf = (type: string, items: fc.Arbitrary<JSONContent>) =>
  fc
    .array(items, { minLength: 1, maxLength: 4 })
    .map((content): JSONContent => ({ type, content }));
const noAttrs = fc.constant(undefined);
const checked = fc.boolean().map((value) => ({ checked: value }));
const nestedBullets = listOf('bulletList', item('listItem', noAttrs));
const bulletList = listOf('bulletList', item('listItem', noAttrs, nestedBullets));
const orderedList = listOf('orderedList', item('listItem', noAttrs, nestedBullets));
const taskList = listOf('taskList', item('taskItem', checked));

const quote = fc
  .array(paragraph, { minLength: 1, maxLength: 3 })
  .map((content): JSONContent => ({ type: 'blockquote', content }));

const cell = (type: string) =>
  inline.map((content): JSONContent => ({ type, content: [{ type: 'paragraph', content }] }));
const table = fc
  .integer({ min: 1, max: 3 })
  .chain((columns) =>
    fc.tuple(
      fc.array(cell('tableHeader'), { minLength: columns, maxLength: columns }),
      fc.array(fc.array(cell('tableCell'), { minLength: columns, maxLength: columns }), {
        minLength: 1,
        maxLength: 3,
      }),
    ),
  )
  .map(
    ([header, rows]): JSONContent => ({
      type: 'table',
      content: [header, ...rows].map((content) => ({ type: 'tableRow', content })),
    }),
  );

const block = fc.oneof(
  { weight: 4, arbitrary: paragraph },
  heading,
  codeBlock,
  rule,
  bulletList,
  orderedList,
  taskList,
  quote,
  table,
);

// Two quotes side by side read as one quote: no markdown says otherwise, so a document never has
// them. (Two lists of a kind side by side are written with different markers.)
const JOINS = new Set(['blockquote']);
const document = fc
  .array(block, { minLength: 1, maxLength: 8 })
  .map((blocks) =>
    blocks.filter(
      (node, index) => !(JOINS.has(node.type!) && blocks[index - 1]?.type === node.type),
    ),
  );

// ---- texts as people write them: the real-world fixtures' blocks, in any order

const fixtureBlocks = Object.values(
  import.meta.glob<string>('./fixtures/real-world/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
).flatMap((text) => {
  const { source } = codec.read(text);
  return source ? source.blocks.flatMap((b) => (b ? [text.slice(b.from, b.to)] : [])) : [];
});

const text = fc
  .tuple(
    fc.array(
      fc.tuple(
        fc.constantFrom(...fixtureBlocks),
        fc.constantFrom('\n\n', '\n\n', '\n\n\n', '\n\n\n\n'),
      ),
      { minLength: 1, maxLength: 8 },
    ),
    fc.constantFrom('', '\n', '\n\n'),
    fc.boolean(),
  )
  .map(([blocks, end, windows]) => {
    const joined =
      blocks.map(([blockText, gap], index) => (index === 0 ? '' : gap) + blockText).join('') + end;
    return windows ? joined.replace(/\n/g, '\r\n') : joined;
  });

const newBlock = fc.oneof(paragraph, heading, bulletList, codeBlock);

describe('the markdown layer, on generated cases', () => {
  it(
    'reads a document back as it was written',
    () => {
      fc.assert(
        fc.property(document, (content) => {
          const written = codec.serialize({ type: 'doc', content });
          expect(plain(codec.parse(written).content)).toEqual(plain(content));
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );

  it(
    'writes a document the same the second time',
    () => {
      fc.assert(
        fc.property(document, (content) => {
          const once = codec.serialize({ type: 'doc', content });
          expect(codec.serialize(codec.parse(once))).toBe(once);
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );

  it(
    'writes a text the same from the second time on',
    () => {
      // (the first writing can bring two lists together, which the second then reads as one)
      fc.assert(
        fc.property(text, (markdown) => {
          const twice = codec.serialize(codec.parse(codec.serialize(codec.parse(markdown))));
          expect(codec.serialize(codec.parse(twice))).toBe(twice);
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );

  it(
    'saves a text it read, unedited, as it is',
    () => {
      fc.assert(
        fc.property(text, (markdown) => {
          const { doc, source } = codec.read(markdown);
          expect(source).not.toBeNull();
          expect(codec.serializeKeeping(schema.nodeFromJSON(doc), source)).toBe(markdown);
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );

  it(
    'saves any edit of one block as the edited document, with the rest of the text as it was',
    () => {
      const edit = fc.record({
        at: fc.nat(),
        kind: fc.constantFrom('replace', 'remove', 'insert'),
        block: newBlock,
      });
      fc.assert(
        fc.property(text, edit, (markdown, { at, kind, block: added }) => {
          const { doc, source } = codec.read(markdown);
          const children = doc.content ?? [];
          // a block of the text, not an empty paragraph read from its blank lines
          const sliceOf = source!.blocks.flatMap((b) => (b ? b.nodes.map(() => b) : [null]));
          const withSlice = children.map((_, index) => index).filter((index) => sliceOf[index]);
          const index = withSlice[at % withSlice.length];
          const content =
            kind === 'replace'
              ? children.map((child, k) => (k === index ? added : child))
              : kind === 'remove'
                ? children.filter((_, k) => k !== index)
                : [...children.slice(0, index + 1), added, ...children.slice(index + 1)];
          if (content.length === 0) return;

          const saved = codec.writeKeeping(pm(content), source, { check: 'both' });
          // reading only around the edit never passes what the whole text would not
          expect(saved.disagreed).toBeUndefined();
          // it reads back as the document, wherever the editor's own spelling of it does
          const own = codec.parse(codec.serialize({ type: 'doc', content })).content;
          if (JSON.stringify(plain(own)) === JSON.stringify(plain(content))) {
            expect(plain(codec.parse(saved.markdown).content)).toEqual(plain(content));
          }
          if (saved.whole) return;
          // and the text before the block and after it is still there, in order (definitions may
          // move to the end, so they are left out of both)
          const { from, to } = sliceOf[index]!;
          const squeezed = (part: string) =>
            source!.definitions
              .reduce((rest, d) => rest.replace(markdown.slice(d.from, d.to), ''), part)
              .replace(/\s+/g, '');
          const result = squeezed(saved.markdown);
          expect(result.startsWith(squeezed(markdown.slice(0, from)))).toBe(true);
          expect(result.endsWith(squeezed(markdown.slice(to)))).toBe(true);
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );
});
