import { describe, expect, it } from 'vitest';
import { Editor, getSchema, type JSONContent } from '@tiptap/core';
import {
  MarkdownCodec,
  createDocumentExtensions,
  hasMarkup,
  normalizeMarkdown,
  parseMarkdown,
  readMarkdown,
  relaxEntities,
  serializeMarkdown,
  stripMarkup,
} from '@renderer/editor/markdown';
import type { MarkdownSource, SourceBlock } from '@renderer/editor/markdown';
import { highlightToText } from '@renderer/editor/highlight';
import { kbdVariants } from '@renderer/components/ui/Kbd';

// Notes are markdown files, so loading one into the editor and saving it must give the file back.
// Each document here is written the way the editor writes markdown, and must come back unchanged.

function nodesOfType(doc: JSONContent, type: string): JSONContent[] {
  const found: JSONContent[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === type) found.push(node);
    node.content?.forEach(walk);
  };
  walk(doc);
  return found;
}

function expectRoundTrip(markdown: string) {
  expect(normalizeMarkdown(markdown)).toBe(markdown);
}

describe('markdown round trip', () => {
  it('fences code with more backticks than any line of it starts with', () => {
    const code = (text: string): JSONContent => ({
      type: 'doc',
      content: [
        { type: 'codeBlock', attrs: { language: 'md' }, content: [{ type: 'text', text }] },
      ],
    });
    expect(serializeMarkdown(code('plain'))).toBe('```md\nplain\n```');
    const fenced = serializeMarkdown(code('```\ninner\n```'));
    expect(fenced).toBe('````md\n```\ninner\n```\n````');
    expect(nodesOfType(parseMarkdown(fenced), 'codeBlock')[0].content).toEqual([
      { type: 'text', text: '```\ninner\n```' },
    ]);
    expect(serializeMarkdown(code('a\n`````\nb'))).toBe('``````md\na\n`````\nb\n``````');
    // backticks inside a line close nothing
    expect(serializeMarkdown(code('a ``` b'))).toBe('```md\na ``` b\n```');
  });

  it('numbers a list with digits only, as typing `1. ` does: a word or a letter starts a sentence', () => {
    // TipTap read letters and roman numerals as numbers, and with them any short word
    for (const text of [
      'No. I think so',
      'Hi. there',
      'ok. so',
      'a) first point\nb) second point',
      'I. Introduction',
      'iv. fourth',
    ]) {
      expect(parseMarkdown(text).content?.map((node) => node.type)).toEqual(['paragraph']);
      expectRoundTrip(text);
    }
    // digits, with `.` or `)`
    expect(parseMarkdown('3. three\n4. four').content?.[0]).toMatchObject({
      type: 'orderedList',
      attrs: { start: 3 },
    });
    expect(parseMarkdown('1) one').content?.[0]).toMatchObject({
      type: 'orderedList',
      attrs: { markup: ')' },
    });
    // a paragraph the editor holds that starts like an item is written so it stays one
    const paragraph = (text: string): JSONContent => ({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    for (const [text, written] of [
      ['1. not a list', '1\\. not a list'],
      ['2) nor this', '2\\) nor this'],
      ['+', '\\+'],
      ['a) first point', 'a) first point'],
      ['No. I think so', 'No. I think so'],
    ]) {
      expect(serializeMarkdown(paragraph(text))).toBe(written);
      expect(parseMarkdown(written)).toEqual(paragraph(text));
    }
    // a lettered list from pasted HTML is written with numbers: markdown has no letters
    const lettered: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { start: 2, type: 'a' },
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }],
            },
          ],
        },
      ],
    };
    expect(serializeMarkdown(lettered)).toBe('2. b');
  });

  it('reads the lines of a wrapped paragraph without their indentation', () => {
    // the lines after the first of a list item, and what follows a line break
    const doc = parseMarkdown('1. first line\n   second line\n- bullet\n      wrapped far');
    expect(nodesOfType(doc, 'text').map((node) => node.text)).toEqual([
      'first line\nsecond line',
      'bullet\nwrapped far',
    ]);
    expect(
      nodesOfType(parseMarkdown('one  \n   two<br>\nthree'), 'text').map((n) => n.text),
    ).toEqual(['one', 'two', 'three']);
    // written once, they stay as they are
    for (const text of ['1. first line\n   second line', 'one<br>\ntwo', 'one   \ntwo']) {
      const once = normalizeMarkdown(text);
      expect(normalizeMarkdown(once)).toBe(once);
    }
    expect(normalizeMarkdown('one<br>\ntwo')).toBe('one  \ntwo');
  });

  it('writes a heading on one line, and nothing that reads as nothing', () => {
    const heading = (...content: JSONContent[]): JSONContent => ({
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 2 }, content }],
    });
    const text = (value: string): JSONContent => ({ type: 'text', text: value });
    expect(serializeMarkdown(heading(text('one\ntwo')))).toBe('## one two');
    // `#`s that end it would close it
    expect(serializeMarkdown(heading(text('C #')))).toBe('## C \\#');
    expect(parseMarkdown('## C \\#')).toEqual(heading(text('C #')));
    // a line break, or spaces, that end a paragraph
    const paragraph: JSONContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [text('end '), { type: 'hardBreak' }] }],
    };
    expect(serializeMarkdown(paragraph)).toBe('end');
  });

  it('reads a numbered item with no text as an empty item, and writes it back', () => {
    const doc = parseMarkdown('1. \n2. two');
    expect(nodesOfType(doc, 'listItem').map((item) => item.content?.[0])).toEqual([
      { type: 'paragraph', content: [] },
      { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
    ]);
    expect(() => serializeMarkdown(doc)).not.toThrow();
    expect(parseMarkdown(serializeMarkdown(doc))).toEqual(doc);
  });

  it('keeps every GFM block as written', () => {
    expectRoundTrip(
      [
        '# Title',
        '',
        '## Section',
        '',
        '### Sub-section',
        '',
        'A paragraph with **bold**, *italic*, ~~struck~~, `code` and <u>underline</u>.',
        'A second line in the same paragraph.',
        '',
        '- One',
        '- Two',
        '  - Nested',
        '',
        '1. First',
        '2. Second',
        '',
        '- [x] Done',
        '- [ ] Open',
        '  - [ ] Nested to-do',
        '',
        '> A quote',
        '> on two lines',
        '',
        '```ts',
        'const answer = 42; // <b>not html</b> & not escaped',
        '```',
        '',
        '---',
        '',
        '| Name | Status |',
        '| ---- | ------ |',
        '| Sync | Done   |',
        '',
        'Hard  ',
        'break',
      ].join('\n'),
    );
  });

  it('keeps notes shaped like the seed workspace builds them, with a blank line between blocks', () => {
    // scripts/setup_dev_workspace.mts writes a heading straight above its paragraph or list; the
    // editor always puts one blank line between blocks, the only change it makes to these notes
    const meeting = [
      '**When:** 11/4/2026, 10:00:00 AM',
      '**Where:** Room 4 & the call',
      '',
      '### Discussion',
      '- The tradeoff is complexity now versus flexibility later.',
      '- Still an open question — need more input before committing to a direction.',
      '',
      '### Action items',
      '- Follow up with design',
    ].join('\n');
    const task = [
      '### Implementation notes: Fix login',
      'The main risk is migration — existing data needs a backfill step.',
      '',
      '- [x] Write the migration',
      '- [ ] Backfill',
    ].join('\n');
    const spaced = (markdown: string) => markdown.replace(/^(### .*)\n(?!\n)/gm, '$1\n\n');

    expect(normalizeMarkdown(meeting)).toBe(spaced(meeting));
    expect(normalizeMarkdown(task)).toBe(spaced(task));
    expectRoundTrip(spaced(task));
  });

  it('keeps links in the form they were written', () => {
    expectRoundTrip(
      'See [the docs](https://example.com/docs "Docs"), <https://example.com/a> and https://example.com/b.',
    );
    expectRoundTrip('Bare www.example.com too.');
  });

  it('writes characters as they are, escaping only what would read back as markup', () => {
    expectRoundTrip('A & B, x < y, y > x, 2 \\* 3 and \\_name\\_.');
    // these would turn into an entity, a tag or a quote
    expect(relaxEntities('&amp;amp; &lt;b&gt;')).toBe('&amp;amp; &lt;b>');
    expect(relaxEntities('&gt; not a quote')).toBe('\\> not a quote');
    expect(relaxEntities('&amp; &lt; 3')).toBe('& < 3');
  });

  it('escapes a paragraph line that would read as a heading or a list, and nothing in code', () => {
    const paragraph = (...content: JSONContent[]): JSONContent => ({
      type: 'doc',
      content: [{ type: 'paragraph', content }],
    });
    const text = (value: string, marks?: JSONContent['marks']): JSONContent => ({
      type: 'text',
      text: value,
      ...(marks && { marks }),
    });
    const cases: [JSONContent, string][] = [
      [paragraph(text('## Not a heading')), '\\## Not a heading'],
      [paragraph(text('- not a list')), '\\- not a list'],
      [paragraph(text('1. not a list')), '1\\. not a list'],
      [
        paragraph(text('Line'), { type: 'hardBreak' }, text('# after a break')),
        'Line  \n\\# after a break',
      ],
      [paragraph(text('Mid-line # and - stay')), 'Mid-line # and - stay'],
      [paragraph(text('## code', [{ type: 'code' }])), '`## code`'],
    ];
    for (const [doc, markdown] of cases) {
      expect(serializeMarkdown(doc)).toBe(markdown);
      // and reads back as the same paragraph
      expect(parseMarkdown(markdown).content?.[0].type).toBe('paragraph');
      expect(serializeMarkdown(parseMarkdown(markdown))).toBe(markdown);
    }
  });

  it('writes the same markdown the second time round', () => {
    const first = normalizeMarkdown(
      ['* Star bullet', '', '__Bold__ and _italic_', '', '|a|b|', '|-|-|', '|1|2|'].join('\n'),
    );
    expect(first).toBe(
      [
        '- Star bullet',
        '',
        '**Bold** and *italic*',
        '',
        '| a   | b   |',
        '| --- | --- |',
        '| 1   | 2   |',
      ].join('\n'),
    );
    expect(normalizeMarkdown(first)).toBe(first);
  });
});

// An edited block keeps the spelling it was read with (docs/editor.md, "What a save changes"):
// each marker is in the `markup` attribute of its node or mark (markup.ts).
describe('keeping markers in an edited block', () => {
  // the source as read, with `zq` added to the last text of the top-level block `index`
  function typed(text: string, index: number): JSONContent {
    const doc = parseMarkdown(text);
    const add = (node: JSONContent): JSONContent | null => {
      if (node.type === 'text') return { ...node, text: `${node.text}zq` };
      const content = node.content ?? [];
      for (let k = content.length - 1; k >= 0; k--) {
        const changed = add(content[k]);
        if (changed) return { ...node, content: content.map((c, j) => (j === k ? changed : c)) };
      }
      return null;
    };
    const content = [...(doc.content ?? [])];
    content[index] = add(content[index])!;
    return { ...doc, content };
  }
  const kept = (text: string, index: number) => writeKeepingSource(text, typed(text, index));
  const markupsOf = (text: string) => {
    const found: string[] = [];
    const walk = (node: JSONContent) => {
      if (node.attrs?.markup) found.push(`${node.type}:${node.attrs.markup}`);
      node.marks?.forEach(
        (mark) => mark.attrs?.markup && found.push(`${mark.type}:${mark.attrs.markup}`),
      );
      node.content?.forEach(walk);
    };
    walk(parseMarkdown(text));
    return found;
  };

  // each marker: the text, what it reads as, and the text with its first block typed in
  const MARKERS: [string, string, string[], string][] = [
    ['a `*` bullet', '* one\n* two\n\nEnd', ['bulletList:*'], '* one\n* twozq\n\nEnd'],
    ['a `+` bullet', '+ one\n+ two\n\nEnd', ['bulletList:+'], '+ one\n+ twozq\n\nEnd'],
    [
      'a to-do list’s bullet and `[X]`',
      '+ [ ] one\n+ [X] two\n\nEnd',
      ['taskList:+', 'taskItem:X'],
      '+ [ ] one\n+ [X] twozq\n\nEnd',
    ],
    ['`1)` numbers', '1) one\n2) two\n\nEnd', ['orderedList:)'], '1) one\n2) twozq\n\nEnd'],
    [
      '`__bold__`, `_italic_` and `~strike~`',
      '__Bold__, _italic_ and ~struck~ text\n\nEnd',
      ['bold:__', 'italic:_', 'strike:~'],
      '__Bold__, _italic_ and ~struck~ textzq\n\nEnd',
    ],
    [
      'an underlined title',
      'Title\n=====\n\nEnd',
      ['heading:setext:====='],
      'Titlezq\n=====\n\nEnd',
    ],
    ['an underlined section', 'Part\n---\n\nEnd', ['heading:setext:---'], 'Partzq\n---\n\nEnd'],
    ['a heading’s closing `#`s', '## Part ##\n\nEnd', ['heading:##'], '## Partzq ##\n\nEnd'],
    [
      'a `~~~` fence',
      '~~~ts\nconst a = 1;\n~~~\n\nEnd',
      ['codeBlock:~~~'],
      '~~~ts\nconst a = 1;zq\n~~~\n\nEnd',
    ],
    [
      'a longer fence',
      '````md\n```\ninner\n```\n````\n\nEnd',
      ['codeBlock:````'],
      '````md\n```\ninner\n```zq\n````\n\nEnd',
    ],
    [
      'a `\\` line break and a `<br>`',
      'one\\\ntwo<br>three\n\nEnd',
      ['hardBreak:\\', 'hardBreak:<br>'],
      'one\\\ntwo<br>threezq\n\nEnd',
    ],
  ];

  it.each(MARKERS)(
    'reads %s, and writes it back when its block is edited',
    (_, text, markups, edited) => {
      expect(markupsOf(text)).toEqual(markups);
      expect(kept(text, 0)).toEqual({ markdown: edited, whole: null });
      // and with Windows line ends
      const windows = (markdown: string) => markdown.replace(/\n/g, '\r\n');
      expect(kept(windows(text), 0)).toEqual({ markdown: windows(edited), whole: null });
      // what was saved reads with the same markers
      expect(markupsOf(edited)).toEqual(markups);
    },
  );

  it('fences indented code once it is edited, and leaves it indented until then', () => {
    // indented code has no marker: the editor writes code fenced
    const code = 'Code:\n\n    const a = 1;\n    a += 1;\n\nEnd';
    expect(markupsOf(code)).toEqual([]);
    expect(kept(code, 1).markdown).toBe('Code:\n\n```\nconst a = 1;\na += 1;zq\n```\n\nEnd');
    // an edit elsewhere keeps its text, as any block's
    expect(kept(code, 0).markdown).toBe('Code:zq\n\n    const a = 1;\n    a += 1;\n\nEnd');
  });

  it('keeps a nested list its own bullet', () => {
    expect(kept('* one\n  + nested\n\nEnd', 0).markdown).toBe('* one\n  + nestedzq\n\nEnd');
    expect(kept('1) one\n   - [X] nested\n\nEnd', 0).markdown).toBe(
      '1) one\n   - [X] nestedzq\n\nEnd',
    );
  });

  it('keeps the markers of a note whose every block changed', () => {
    // a note of one list: edited, nothing of its text is kept, and it is still a `*` list
    expect(kept('* one\n* __two__\n', 0)).toEqual({
      markdown: '* one\n* __twozq__\n',
      whole: 'nothing-kept',
    });
    expect(kept('Title\r\n=====\r\n', 0).markdown).toBe('Titlezq\r\n=====\r\n');
  });

  it('keeps a rule as it was written when the blocks around it move', () => {
    const text = 'One\n\n* * *\n\nTwo';
    expect(markupsOf(text)).toEqual(['horizontalRule:* * *']);
    const doc = parseMarkdown(text);
    const [one, rule, two] = doc.content ?? [];
    expect(serializeKeepingSource(text, { ...doc, content: [two, rule, one] })).toBe(
      'Two\n\n* * *\n\nOne',
    );
  });

  it('gives no marker to what is written the editor’s way', () => {
    const own = [
      '- one\n- [x] two',
      '1. one',
      '**bold** *italic* ~~struck~~',
      '# Title',
      '---',
      '```ts\ncode\n```',
      'one  \ntwo',
      '| a |\n| - |\n| b<br>c |',
    ];
    for (const text of own) expect(markupsOf(text)).toEqual([]);
  });

  it('writes new content, and a document written whole, in the editor’s own spelling', () => {
    // made in the editor, not read: no markers
    const text = '* one\n\nEnd';
    const doc = parseMarkdown(text);
    const fresh = (parseMarkdown('* new\n\n__bold__').content ?? []).map(stripMarkup);
    expect(
      serializeKeepingSource(text, { ...doc, content: [...(doc.content ?? []), ...fresh] }),
    ).toBe('* one\n\nEnd\n\n- new\n\n**bold**');
    // read with markers, and written whole
    const others =
      '* one\n\n__two__ _three_ ~four~\n\n***\n\nTitle\n===\n\n~~~\ncode\n~~~\n\n1) a\n\n+ [X] b';
    const editors =
      '- one\n\n**two** *three* ~~four~~\n\n---\n\n# Title\n\n```\ncode\n```\n\n1. a\n\n- [x] b';
    expect(normalizeMarkdown(others)).toBe(editors);
    expect(serializeMarkdown(parseMarkdown(others))).toBe(editors);
    expect(hasMarkup(parseMarkdown(others))).toBe(true);
    expect(hasMarkup(stripMarkup(parseMarkdown(others)))).toBe(false);
    expect(hasMarkup(parseMarkdown(editors))).toBe(false);
  });

  it('writes a block in the editor’s spelling where its markers would read differently', () => {
    // `_it_s` is no emphasis: the closing `_` is inside a word
    const text = '_it_ s\n\nEnd';
    const doc = parseMarkdown(text);
    const [para, end] = doc.content ?? [];
    const joined = { ...para, content: [para.content![0], { type: 'text', text: 's' }] };
    const saved = writeKeepingSource(text, { ...doc, content: [joined, end] });
    expect(saved).toEqual({ markdown: '*it*s\n\nEnd', whole: null });
    expect(
      documentSchema
        .nodeFromJSON(parseMarkdown(saved.markdown))
        .eq(documentSchema.nodeFromJSON(stripMarkup({ ...doc, content: [joined, end] }))),
    ).toBe(true);

    // an underlined heading can have two lines; a `#` heading can't, and takes them as one
    const title = 'Title\n=====\n\nEnd';
    const [heading, last] = parseMarkdown(title).content ?? [];
    const twoLines = {
      ...heading,
      content: [...heading.content!, { type: 'hardBreak' }, { type: 'text', text: 'more' }],
    };
    expect(serializeKeepingSource(title, { type: 'doc', content: [twoLines, last] })).toBe(
      'Title  \nmore\n=====\n\nEnd',
    );
    expect(serializeMarkdown({ type: 'doc', content: [twoLines] })).toBe('# Title more');
    // an underline says its level: a title made a section takes `#`s
    const section = { ...heading, attrs: { ...heading.attrs, level: 3 } };
    expect(serializeKeepingSource(title, { type: 'doc', content: [section, last] })).toBe(
      '### Title\n\nEnd',
    );
    // a fence a line of the code would close
    const fenced = '~~~\ncode\n~~~\n\nEnd';
    const [block] = parseMarkdown(fenced).content ?? [];
    const closing = { ...block, content: [{ type: 'text', text: 'code\n~~~\nmore' }] };
    const written = serializeKeepingSource(fenced, { type: 'doc', content: [closing, last] });
    expect(written).toBe('```\ncode\n~~~\nmore\n```\n\nEnd');
  });

  it('keeps two lists that differ in their bullet apart when one is edited', () => {
    const text = '* Star\n+ Plus\n\nPara';
    expect(kept(text, 0).markdown).toBe('* Starzq\n+ Plus\n\nPara');
    expect(kept(text, 1).markdown).toBe('* Star\n+ Pluszq\n\nPara');
  });

  it('keeps every marker of a note written every other way, whichever block is edited', () => {
    const [, text] = Object.entries(
      import.meta.glob<string>('./fixtures/real-world/mixed-spellings.md', {
        query: '?raw',
        import: 'default',
        eager: true,
      }),
    )[0];
    const markups = markupsOf(text);
    expect(markups).not.toEqual([]);
    const blocks = parseMarkdown(text).content ?? [];
    let edited = 0;
    blocks.forEach((block, index) => {
      const doc = typed(text, index);
      if (!doc.content![index] || JSON.stringify(doc.content![index]) === JSON.stringify(block))
        return;
      const saved = writeKeepingSource(text, doc);
      expect(saved.whole).toBeNull();
      expect(markupsOf(saved.markdown), `block ${index}: ${saved.markdown}`).toEqual(markups);
      edited += 1;
    });
    expect(edited).toBeGreaterThan(5);
  });
});

// The source map says which slice of a loaded text each top-level block was read from
// (docs/editor.md, "The source map"). Nothing is written with it yet.
describe('reading the source', () => {
  const fixtures = Object.entries(
    import.meta.glob<string>('./fixtures/real-world/*.md', {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ).map(([path, text]): [string, string] => [path.split('/').pop()!, text]);
  const windows = (text: string) => text.replace(/\n/g, '\r\n');

  function sourceOf(text: string): MarkdownSource {
    const { source, reason } = readMarkdown(text);
    expect(reason).toBeNull();
    return source!;
  }

  const slices = (source: MarkdownSource) =>
    source.blocks.filter((block): block is SourceBlock => block !== null);
  const sliceText = (source: MarkdownSource, block: SourceBlock) =>
    source.text.slice(block.from, block.to);
  const definitionTexts = (source: MarkdownSource, firstOnly = false) =>
    source.definitions
      .filter((definition) => !firstOnly || definition.first)
      .map((definition) => source.text.slice(definition.from, definition.to));

  // the text between the slices, the slices and the document's blocks all line up
  function expectLinedUp(text: string) {
    const { doc } = readMarkdown(text);
    const source = sourceOf(text);
    const sliced = slices(source);
    expect(source.text).toBe(text);
    expect(source.between).toHaveLength(sliced.length + 1);
    expect(
      sliced.map((block, index) => source.between[index] + sliceText(source, block)).join('') +
        source.between[sliced.length],
    ).toBe(text);
    // a slice has no blank line at either end, and what is between two holds nothing but blank
    // lines and the definitions
    for (const block of sliced) {
      expect(sliceText(source, block)).toMatch(/\S/);
      expect(sliceText(source, block)).not.toMatch(/^[^\S\n]*[\r\n]|[\r\n][^\S\n]*$/);
    }
    const outside = definitionTexts(source).reduce(
      (rest, definition) => rest.replace(definition, ''),
      source.between.join('\n'),
    );
    expect(outside.trim()).toBe('');
    // the blocks are the document's, in order; null is an empty paragraph
    expect(
      source.blocks.flatMap((block) =>
        block ? block.nodes.map((node) => node.type.name) : ['paragraph'],
      ),
    ).toEqual(doc.content?.map((node) => node.type));
    return source;
  }

  it.each(fixtures)('lines %s up with its blocks, with either line end', (_name, text) => {
    expect(text).not.toContain('\r');
    const unix = expectLinedUp(text);
    const crlf = expectLinedUp(windows(text));
    expect(unix.lineEnd).toBe('\n');
    expect(crlf.lineEnd).toBe('\r\n');
    // the same blocks, read from the same text but for its line ends
    expect(slices(crlf).map((block) => sliceText(crlf, block))).toEqual(
      slices(unix).map((block) => windows(sliceText(unix, block))),
    );
    expect(crlf.blocks.length).toBe(unix.blocks.length);
    slices(crlf).forEach((block, index) => {
      const same = slices(unix)[index];
      expect(block.nodes.every((node, k) => node.eq(same.nodes[k]))).toBe(true);
    });
  });

  // No block of the fixtures reads differently alone (nor did any of 32,000 in docs/ and the
  // READMEs of node_modules), given the definitions its reference links use: a slice is a whole
  // block. What a block reads as can still depend on its neighbour (indented code straight after
  // a paragraph is a line of that paragraph), which is for a save that moves blocks to check.
  it.each(fixtures)('reads each block of %s the same alone', (_name, text) => {
    const source = sourceOf(text);
    const definitions = definitionTexts(source, true);
    for (const block of slices(source)) {
      const alone = sliceText(source, block);
      const [read, ...others] = slices(
        sourceOf(definitions.length > 0 ? `${alone}\n\n${definitions.join('\n')}` : alone),
      );
      expect(others).toEqual([]);
      expect(read.nodes.map((node) => node.toJSON())).toEqual(
        block.nodes.map((node) => node.toJSON()),
      );
      expect(read.nodes.every((node, index) => node.eq(block.nodes[index]))).toBe(true);
    }
  });

  it('gives each block its lines, and the blank lines and line ends to the text between', () => {
    const text = '# Title\nStraight under.\n\n- a\n- b\n\n\n```ts\ncode\n\n```\n';
    const source = expectLinedUp(text);
    expect(slices(source).map((block) => sliceText(source, block))).toEqual([
      '# Title',
      'Straight under.',
      '- a\n- b',
      '```ts\ncode\n\n```',
    ]);
    expect(source.between).toEqual(['', '\n', '\n\n', '\n\n\n', '\n']);
    expect(source.blocks.map((block) => block?.nodes[0].type.name ?? null)).toEqual([
      'heading',
      'paragraph',
      'bulletList',
      'codeBlock',
    ]);
  });

  it('leaves the blank lines a to-do list was read with out of its slice', () => {
    // the to-do list's tokenizer takes the blank lines before it, so none is an empty paragraph
    const source = expectLinedUp('Above\n\n\n\n- [ ] to do\n  - [x] nested\n\nBelow');
    expect(source.blocks.map((block) => block && sliceText(source, block))).toEqual([
      'Above',
      '- [ ] to do\n  - [x] nested',
      'Below',
    ]);
    expect(source.between).toEqual(['', '\n\n\n\n', '\n\n', '']);
  });

  it('gives the empty paragraphs read from blank lines no slice', () => {
    // two blank lines more than the one between blocks, and one at each end
    const text = '\n\nFirst\n\n\n\n\n\nSecond  \n\n\n';
    const source = expectLinedUp(text);
    expect(source.blocks.map((block) => block && sliceText(source, block))).toEqual([
      null,
      'First',
      null,
      null,
      'Second  ',
      null,
    ]);
    expect(source.between).toEqual(['\n\n', '\n\n\n\n\n\n', '\n\n\n']);

    // a text of blank lines alone is all between
    const blank = expectLinedUp('\n\n\n');
    expect(blank.blocks).toEqual([null]);
    expect(blank.between).toEqual(['\n\n\n']);
  });

  it('reads a paragraph that holds only an image as a paragraph, with its slice', () => {
    const source = expectLinedUp('Before\n\n![diagram](a.png "A")\n\nAfter');
    const [, image] = slices(source);
    expect(image.nodes.map((node) => node.type.name)).toEqual(['paragraph']);
    expect(image.nodes[0].firstChild?.type.name).toBe('imageLink');
    // a document the schema allows, which a bare image among its blocks was not
    expect(() => documentSchema.nodeFromJSON(readMarkdown(source.text).doc).check()).not.toThrow();
    expect(sliceText(source, image)).toBe('![diagram](a.png "A")');
  });

  it('gives a list split into to-do and bullet lists one slice', () => {
    const source = expectLinedUp('- bullet\n- [ ] to do\n- [x] done\n- last\n\nAfter');
    const [list] = slices(source);
    expect(list.nodes.map((node) => node.type.name)).toEqual([
      'bulletList',
      'taskList',
      'bulletList',
    ]);
    expect(sliceText(source, list)).toBe('- bullet\n- [ ] to do\n- [x] done\n- last');
    expect(source.blocks).toHaveLength(2);
  });

  it('keeps definitions in the text between blocks, a label defined twice too', () => {
    // marked gives no token for the second `[a]`, nor for the last one, at the end of the text
    const text = [
      'See [a] and [the docs][b].',
      '',
      '[a]: https://example.com/a',
      '[B]: <https://example.com/b> "Docs"',
      '',
      '[a]: https://example.com/other',
      '',
      'End.',
      '',
      '[a]: https://example.com/a',
      '',
    ].join('\n');
    for (const written of [text, windows(text)]) {
      const source = expectLinedUp(written);
      expect(slices(source).map((block) => sliceText(source, block))).toEqual([
        'See [a] and [the docs][b].',
        'End.',
      ]);
      expect(
        source.definitions.map(({ label, href, title, first }) => ({ label, href, title, first })),
      ).toEqual([
        { label: 'a', href: 'https://example.com/a', title: null, first: true },
        { label: 'b', href: 'https://example.com/b', title: 'Docs', first: true },
        { label: 'a', href: 'https://example.com/other', title: null, first: false },
        { label: 'a', href: 'https://example.com/a', title: null, first: false },
      ]);
      expect(definitionTexts(source)).toEqual([
        '[a]: https://example.com/a',
        '[B]: <https://example.com/b> "Docs"',
        '[a]: https://example.com/other',
        '[a]: https://example.com/a',
      ]);
    }
    // GitHub's comments, each the label `//` again
    const [, body] = fixtures.find(([name]) => name === 'github-pr-body.md')!;
    expect(sourceOf(body).definitions.filter((definition) => !definition.first)).not.toEqual([]);
  });

  it('has no map for a text whose line ends are not all of one kind', () => {
    expect(readMarkdown('One\r\n\r\nTwo\n\nThree')).toMatchObject({
      source: null,
      reason: 'mixed-line-ends',
    });
    for (const text of ['One\r\rTwo', 'One\r\n\r\nTwo\rThree']) {
      expect(readMarkdown(text)).toMatchObject({ source: null, reason: 'lone-carriage-return' });
    }
    // and still reads as it does
    expect(readMarkdown('One\r\rTwo').doc).toEqual(parseMarkdown('One\n\nTwo'));
  });

  it('has no map for a definition inside a list item, a quote, a callout or a collapsible section', () => {
    for (const text of [
      '- item [a]\n\n  [a]: https://example.com\n\nAfter',
      '> [a]: https://example.com\n\nSee [a].',
      '> [!NOTE]\n> Body\n>\n> [a]: https://example.com\n\nSee [a].',
      '<details>\n<summary>S</summary>\n\n[a]: https://example.com\n\n</details>\n\nSee [a].',
      // defined in a quote first: the one at the top level is a repeat
      '> [a]: https://example.com\n\n[a]: https://example.com/other\n\nSee [a].',
    ]) {
      expect(readMarkdown(text)).toMatchObject({ source: null, reason: 'nested-definition' });
    }
  });

  it('has no map for a text that reads as no blocks, shown as a paragraph of its lines', () => {
    const definitions = readMarkdown('[a]: https://example.com\n[b]: https://example.org');
    expect(definitions).toMatchObject({ source: null, reason: 'no-blocks' });
    expect(definitions.doc.content).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '[a]: https://example.com' },
          { type: 'hardBreak' },
          { type: 'text', text: '[b]: https://example.org' },
        ],
      },
    ]);
    expect(readMarkdown('')).toEqual({
      doc: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
      source: null,
      reason: 'no-blocks',
    });
  });

  // what a save will compare: the editor's codec makes the map's nodes with the editor's schema
  it.each(fixtures)('gives the blocks an editor holds once it loaded %s', (_name, text) => {
    const editor = new Editor({
      extensions: createDocumentExtensions(),
      content: text,
      contentType: 'markdown',
    });
    const { source } = editor.storage.documentMarkdown.codec.read(text);
    const read = source!.blocks.flatMap((block) => (block ? block.nodes : [null]));
    const held = editor.state.doc.children;
    expect(held).toHaveLength(read.length);
    held.forEach((node, index) => {
      const block = read[index];
      if (block) expect(node.eq(block)).toBe(true);
      else expect(node.type.name === 'paragraph' && node.childCount === 0).toBe(true);
    });
    editor.destroy();
  });

  it('reads the same document as parseMarkdown', () => {
    for (const [, text] of fixtures) {
      expect(readMarkdown(text).doc).toEqual(parseMarkdown(text));
      expect(readMarkdown(windows(text)).doc).toEqual(parseMarkdown(text));
    }
  });
});

// A document saved over the text it was read from: `text` read, then `doc` written keeping it,
// as the editor does on a save (docs/editor.md, "What a save changes").
const documentSchema = getSchema(createDocumentExtensions());
const documentCodec = new MarkdownCodec(documentSchema);
function serializeKeepingSource(text: string, doc: JSONContent): string {
  return writeKeepingSource(text, doc).markdown;
}
function writeKeepingSource(text: string, doc: JSONContent) {
  return documentCodec.writeKeeping(
    documentSchema.nodeFromJSON(doc),
    documentCodec.read(text).source,
  );
}

describe('saving what was read', () => {
  // written the way people and other apps write markdown, not the way the editor does
  const OTHERS = [
    '* Star bullet',
    '+ Plus bullet',
    '',
    '',
    '',
    '__Bold__ and _italic_ with <br> a break',
    '',
    'Setext title',
    '============',
    '',
    '|a|b|',
    '|-|-|',
    '|1|2|',
    '',
    '- [ ] A to-do',
    '- A bullet in the same list',
    '',
    '<div>Kept as written</div>',
    '',
    '> [!NOTE]',
    '> A callout',
    '',
    '~~~',
    'fenced with tildes',
    '~~~',
    '',
  ].join('\n');

  // the source as read, with one top-level block replaced (or removed, or more put in its place)
  function edit(text: string, index: number, ...blocks: JSONContent[]): JSONContent {
    const doc = parseMarkdown(text);
    const content = [...(doc.content ?? [])];
    content.splice(index, 1, ...blocks);
    return { ...doc, content };
  }
  const paragraph = (text: string): JSONContent => ({
    type: 'paragraph',
    content: [{ type: 'text', text }],
  });
  const heading = (text: string): JSONContent => ({
    type: 'heading',
    attrs: { level: 1 },
    content: [{ type: 'text', text }],
  });
  const blockTypes = (text: string) => (parseMarkdown(text).content ?? []).map((node) => node.type);

  it('gives back the text exactly when nothing changed', () => {
    for (const text of [
      OTHERS,
      '\n\nLeading blank lines and a trailing newline\n',
      '\n\n\n\n\n\nMore blank lines first\n\n\n\n\n\nand between\n\n\n\n',
      '\n\n\n\n\n\n',
      'Only text',
      '',
    ]) {
      expect(serializeKeepingSource(text, parseMarkdown(text))).toBe(text);
    }
  });

  it('keeps the blank lines a text opens and ends with when its first and last blocks are kept', () => {
    const text = '\n\n\n\n\n\n__First__\n\nMiddle\n\n__Last__\n\n\n\n';
    const middle = (parseMarkdown(text).content ?? []).findIndex(
      (node) => node.content?.[0]?.text === 'Middle',
    );
    const saved = serializeKeepingSource(text, edit(text, middle, paragraph('Changed')));
    expect(saved).toBe(text.replace('Middle', 'Changed'));
  });

  it('rewrites only the block that was edited, keeping the rest and the blank lines between', () => {
    // the editor reads "Setext title" as a heading: change its text
    const index = blockTypes(OTHERS).indexOf('heading');
    const heading = {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'New title' }],
    };
    const saved = serializeKeepingSource(OTHERS, edit(OTHERS, index, heading));
    expect(saved).toBe(OTHERS.replace('Setext title\n============', '# New title'));
  });

  it('writes a new block in the editor’s spelling, a blank line either side', () => {
    const index = blockTypes(OTHERS).indexOf('heading');
    const doc = parseMarkdown(OTHERS);
    const content = [...(doc.content ?? [])];
    content.splice(index, 0, paragraph('Inserted'));
    const saved = serializeKeepingSource(OTHERS, { ...doc, content });
    expect(saved).toBe(OTHERS.replace('\n\nSetext title', '\n\nInserted\n\nSetext title'));
  });

  it('closes the gap a removed block leaves with one blank line', () => {
    const index = blockTypes(OTHERS).indexOf('heading');
    const saved = serializeKeepingSource(OTHERS, edit(OTHERS, index));
    expect(saved).toBe(OTHERS.replace('Setext title\n============\n\n', ''));
    // and reads back as the document it was saved from
    expect(parseMarkdown(saved)).toEqual(edit(OTHERS, index));
  });

  it('keeps the blocks around an edit and a new block, each as written', () => {
    // loaded as A B C D E, saved as A B X D N E: the diff keeps A, B, D and E
    const text = '* A\n\n__B__\n\nC\n\n+ D\n\n_E_\n';
    const [a, b, , d, e] = parseMarkdown(text).content ?? [];
    const doc = { type: 'doc', content: [a, b, paragraph('X'), d, paragraph('N'), e] };
    expect(writeKeepingSource(text, doc)).toEqual({
      markdown: '* A\n\n__B__\n\nX\n\n+ D\n\nN\n\n_E_\n',
      whole: null,
    });
  });

  it('writes a block moved past another anew, and keeps the other', () => {
    // blocks are matched in the order they were read: of two that swap places one is kept
    const text = '* One\n\n\n__Two__';
    const [one, two] = parseMarkdown(text).content ?? [];
    // (written anew with the markers it was read with)
    expect(serializeKeepingSource(text, { type: 'doc', content: [two, one] })).toBe(
      '__Two__\n\n* One',
    );
  });

  it('reads back as what the editor holds, whichever block was edited', () => {
    const types = blockTypes(OTHERS);
    for (let index = 0; index < types.length; index++) {
      const doc = edit(OTHERS, index, paragraph(`Edited ${index}`));
      const saved = serializeKeepingSource(OTHERS, doc);
      expect(parseMarkdown(saved)).toEqual(doc);
      // the edited block alone is rewritten (an empty paragraph, an extra blank line, is no text)
      if (types[index] === 'paragraph' && !parseMarkdown(OTHERS).content?.[index].content) continue;
      expect(saved).toContain(`Edited ${index}`);
      // the two lists it opens with, kept as written when the edit is elsewhere
      if (index > 1) expect(saved).toContain('* Star bullet\n+ Plus bullet');
    }
  });

  it('writes the document in its own spelling where a kept block would read differently', () => {
    // an indented code block, kept as written after a list put in the paragraph's place, would
    // continue the list's item
    const text = 'Para\n\n    indented code';
    const list = {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [paragraph('Item')] }],
    };
    const doc = edit(text, 0, list);
    expect(blockTypes(`- Item\n\n    indented code`)).toEqual(['bulletList']);
    const saved = serializeKeepingSource(text, doc);
    expect(saved).toBe(serializeMarkdown(doc));
    // a list and the code, fenced: the markers it was read with (four spaces' indent) are gone
    expect(blockTypes(saved)).toEqual(['bulletList', 'codeBlock']);
  });

  it('keeps two lists that differ only in their bullet apart, which its own spelling can’t', () => {
    const text = '* Star\n+ Plus\n\nPara';
    const doc = edit(text, 2, paragraph('Edited'));
    expect(doc.content?.map((node) => node.type)).toEqual([
      'bulletList',
      'bulletList',
      'paragraph',
    ]);
    // the editor writes both with "-": read back, they are one list
    expect(blockTypes(serializeMarkdown(doc))).toEqual(['bulletList', 'paragraph']);
    expect(serializeKeepingSource(text, doc)).toBe('* Star\n+ Plus\n\nEdited');
  });

  it('writes a block changed in place with the text around it there', () => {
    const text = '### Discussion\n* a\n* b\n\n### Next\n* c\n';
    const doc = edit(text, 1, ...(parseMarkdown('- a\n- changed').content ?? []));
    expect(serializeKeepingSource(text, doc)).toBe(
      '### Discussion\n- a\n- changed\n\n### Next\n* c\n',
    );
    // unless that text would join it to its neighbour: a list can follow a paragraph straight
    // on, another paragraph can't
    const list = 'First\n* a\n\nLast';
    expect(serializeKeepingSource(list, edit(list, 1, paragraph('Second')))).toBe(
      'First\n\nSecond\n\nLast',
    );
  });

  it('keeps the file’s final newline when its last block changes', () => {
    const text = '__Kept__\n\nLast\n';
    expect(serializeKeepingSource(text, edit(text, 1, paragraph('Changed')))).toBe(
      '__Kept__\n\nChanged\n',
    );
  });

  it('keeps the text before the first block and after the last when they change', () => {
    const text = '\n# Title\n\nBody\n\n[docs]: https://example.com\n';
    expect(serializeKeepingSource(text, edit(text, 0, heading('Changed')))).toBe(
      '\n# Changed\n\nBody\n\n[docs]: https://example.com\n',
    );
    expect(serializeKeepingSource(text, edit(text, 1, paragraph('Changed')))).toBe(
      '\n# Title\n\nChanged\n\n[docs]: https://example.com\n',
    );
  });

  it('keeps a block that reads as an empty paragraph after one that changed', () => {
    // a link with no text reads as nothing but an empty paragraph
    const text = 'Shim:\n\n[](#top)\n```js\ncode\n```';
    expect(serializeKeepingSource(text, edit(text, 0, paragraph('Changed:')))).toBe(
      'Changed:\n\n[](#top)\n```js\ncode\n```',
    );
  });

  it('keeps the blank line a text ends with when the block before it goes', () => {
    // the blank line reads as an empty paragraph, which must stay
    const text = 'a\n\n---\n_Generated_\n\n';
    const removed = edit(text, 2);
    const saved = serializeKeepingSource(text, removed);
    expect(saved).toBe('a\n\n---\n\n');
    expect(parseMarkdown(saved)).toEqual(removed);
  });

  it('puts a new block between two kept ones with the text that was between them', () => {
    const text = 'Body\n\n[//]: # (start)\n\n* Item';
    expect(serializeKeepingSource(text, edit(text, 0, paragraph('Body'), paragraph('New')))).toBe(
      'Body\n\n[//]: # (start)\n\nNew\n\n* Item',
    );
  });

  it('keeps a paragraph that holds only an image', () => {
    const text = '![diagram](diagram.png)\n\n* a';
    expect(serializeKeepingSource(text, edit(text, 1, paragraph('Changed')))).toBe(
      '![diagram](diagram.png)\n\nChanged',
    );
  });

  it('keeps link reference definitions, so the kept links still read', () => {
    const text = '* A [link][docs]\n\n[docs]: https://example.com\n\nEnd';
    expect(serializeKeepingSource(text, parseMarkdown(text))).toBe(text);
    // with the text around the block that changed
    expect(serializeKeepingSource(text, edit(text, 1, paragraph('Changed')))).toBe(
      '* A [link][docs]\n\n[docs]: https://example.com\n\nChanged',
    );
    // where it stood, when a block next to it goes
    const gone = 'Use [it][docs] here.\n\n[docs]: https://example.com\n\nGone\n\n* Last\n';
    const removed = edit(gone, 1);
    const saved = serializeKeepingSource(gone, removed);
    expect(saved).toBe('Use [it][docs] here.\n\n[docs]: https://example.com\n\n* Last\n');
    expect(parseMarkdown(saved)).toEqual(removed);
    // and at the end when the blocks on both sides of it go
    const apart = 'Use [it][docs] here.\n\nGone\n\n[docs]: https://example.com\n\nToo\n\n* Last\n';
    const both = edit(apart, 1);
    both.content?.splice(1, 1);
    const moved = serializeKeepingSource(apart, both);
    expect(moved).toBe('Use [it][docs] here.\n\n* Last\n\n[docs]: https://example.com\n');
    expect(parseMarkdown(moved)).toEqual(both);
    // the definitions a text ends with stay there when its last block goes
    const ending = 'Use [it][docs] here.\n\nGone\n\n[docs]: https://example.com\n';
    expect(serializeKeepingSource(ending, edit(ending, 1))).toBe(
      'Use [it][docs] here.\n\n[docs]: https://example.com\n',
    );
    // a label defined again, as GitHub's comments do (`[//]: # (start)`), which marked ignores
    const comments = 'Body\n\n[//]: # (start)\n[//]: # (end)\n\n* Item';
    expect(serializeKeepingSource(comments, parseMarkdown(comments))).toBe(comments);
    expect(serializeKeepingSource(comments, edit(comments, 0, paragraph('Changed')))).toBe(
      'Changed\n\n[//]: # (start)\n[//]: # (end)\n\n* Item',
    );
  });

  it('keeps a label defined twice, differently, while its link reads as it did', () => {
    const twice = '[a][x]\n\n[x]: https://one.example\n[x]: https://two.example\n\nEnd\n';
    expect(serializeKeepingSource(twice, edit(twice, 1, paragraph('Changed')))).toBe(
      twice.replace('End', 'Changed'),
    );
    // the first definition gone with the text around it, the link would read with the second:
    // the document is written whole, the link in full
    const apart = '[x]: https://one.example\n\nGone\n\n[a][x]\n\n[x]: https://two.example\n\nEnd';
    const removed = edit(apart, 0);
    const written = writeKeepingSource(apart, removed);
    expect(parseMarkdown(written.markdown)).toEqual(removed);
    expect(written.markdown).toContain('https://one.example');
  });

  it('keeps the text around a block the editor holds otherwise than it reads', () => {
    // a paragraph being typed ends with a space; a heading has no text yet. Neither makes the save give up the text of the blocks around it.
    const text = '* One\n\n__Two__\n\n+ Three\n';
    const typing = writeKeepingSource(text, edit(text, 1, paragraph('Typing ')));
    expect(typing).toEqual({ markdown: '* One\n\nTyping\n\n+ Three\n', whole: null });
    // (the editor writes a heading with no text as nothing, which reads as a blank line)
    const empty = { type: 'heading', attrs: { level: 2 } };
    expect(writeKeepingSource(text, edit(text, 1, empty))).toEqual({
      markdown: '* One\n\n\n\n+ Three\n',
      whole: null,
    });
    // an empty paragraph, as Enter leaves one, is a blank line more
    const entered = edit(text, 1, parseMarkdown(text).content![1], { type: 'paragraph' });
    expect(writeKeepingSource(text, entered)).toEqual({
      markdown: '* One\n\n__Two__\n\n\n\n+ Three\n',
      whole: null,
    });
  });

  it('says why it wrote the whole document', () => {
    const text = '* One\n\n__Two__';
    const all = { type: 'doc', content: [paragraph('Other'), paragraph('Blocks')] };
    expect(writeKeepingSource(text, all)).toEqual({
      markdown: 'Other\n\nBlocks',
      whole: 'nothing-kept',
    });
    const mixed = '* One\r\n\n__Two__\n';
    expect(writeKeepingSource(mixed, parseMarkdown(mixed)).whole).toBe('no-source');
    // indented code kept after a list put in the paragraph's place would continue its item
    const code = 'Para\n\n    indented code';
    const list = parseMarkdown('- Item').content![0];
    expect(writeKeepingSource(code, edit(code, 0, list)).whole).toBe('readback-mismatch');
  });

  it('keeps Windows line ends', () => {
    const text = '* One\r\n\r\n__Two__\r\n';
    expect(serializeKeepingSource(text, parseMarkdown(text))).toBe(text);
    expect(serializeKeepingSource(text, edit(text, 1, paragraph('Changed')))).toBe(
      '* One\r\n\r\nChanged\r\n',
    );
  });

  it('writes the whole document in its own spelling when it can’t line the text up with it', () => {
    // a definition inside a quote would go with the quote when it is rewritten
    const quoted = '> [docs]: https://example.com\n\n* A [link][docs]\n\nEnd';
    const doc = edit(quoted, 2, paragraph('Changed'));
    expect(serializeKeepingSource(quoted, doc)).toBe(serializeMarkdown(doc));
    // line ends that mix \r\n and \n
    const mixed = '* One\r\n\n__Two__\n';
    expect(serializeKeepingSource(mixed, parseMarkdown(mixed))).toBe(
      serializeMarkdown(parseMarkdown(mixed)),
    );
  });

  it('changes nothing else in a text written in the editor’s spelling', () => {
    // as the editor writes it: the same markdown the second time round
    const text = [
      '- Star bullet',
      '',
      '**Bold** and *italic*',
      '',
      '| a   | b   |',
      '| --- | --- |',
      '| 1   | 2   |',
    ].join('\n');
    const doc = edit(text, 0, paragraph('First'));
    expect(serializeKeepingSource(text, doc)).toBe(serializeMarkdown(doc));
  });

  it('keeps an unchanged block that the editor would write differently each time', () => {
    // the editor moves the `**` out of the link, and then writes the link differently again
    const text = 'Edited\n\nSee the [***spec* repository**](https://example.com).';
    const once = normalizeMarkdown(text);
    expect(normalizeMarkdown(once)).not.toBe(once);
    const doc = edit(once, 0, paragraph('Edited again'));
    expect(serializeKeepingSource(once, doc)).toBe(once.replace('Edited', 'Edited again'));
  });
});

describe('entity links', () => {
  const markdown =
    'Blocked on [Fix \\[login\\]](devbrain://task/tsk_0192) and [Q4](devbrain://project/prj_7).';

  it('read as entity nodes and write back as the same link', () => {
    const doc = parseMarkdown(markdown);
    expect(nodesOfType(doc, 'entityLink').map((node) => node.attrs)).toEqual([
      { type: 'task', id: 'tsk_0192', label: 'Fix [login]' },
      { type: 'project', id: 'prj_7', label: 'Q4' },
    ]);
    expect(nodesOfType(doc, 'link')).toEqual([]);
    expectRoundTrip(markdown);
  });

  it('leave other schemes and unknown types as ordinary links', () => {
    const doc = parseMarkdown('[x](devbrain://calendar/cal_1)');
    expect(nodesOfType(doc, 'entityLink')).toEqual([]);
  });
});

describe('supported HTML tags', () => {
  function marksOf(markdown: string): string[] {
    return nodesOfType(parseMarkdown(markdown), 'text').flatMap(
      (node) => node.marks?.map((mark) => mark.type) ?? [],
    );
  }

  it('read <u>, <kbd>, <sub> and <sup> as formatting and write them back', () => {
    const markdown =
      'Press <kbd>⌘K</kbd>, H<sub>2</sub>O, x<sup>2</sup> and <u>under **bold**</u>.';
    expect(marksOf(markdown)).toEqual([
      'kbd',
      'subscript',
      'superscript',
      'underline',
      'bold',
      'underline',
    ]);
    expectRoundTrip(markdown);
  });

  it('leave an unclosed tag, and a tag in code, as text', () => {
    const markdown = 'An unclosed <kbd> and `<kbd>code</kbd>`.';
    expect(marksOf(markdown)).toEqual(['code']);
    expect(nodesOfType(parseMarkdown(markdown), 'rawHtmlInline')).toHaveLength(1);
    expectRoundTrip(markdown);
  });

  it('read <br> as a line break, written <br> only inside a table cell', () => {
    expectRoundTrip(
      ['| Steps      | Done |', '| ---------- | ---- |', '| one<br>two | yes  |'].join('\n'),
    );
    expect(normalizeMarkdown('Line one<br>line two')).toBe('Line one  \nline two');
  });

  it('read a collapsible section, nested ones and an open one, written as GitHub reads it', () => {
    const markdown = [
      '<details>',
      '<summary>Setup **steps** &amp; &lt;b></summary>',
      '',
      '- Install',
      '- Run `npm ci`',
      '',
      '<details open>',
      '<summary>Nested</summary>',
      '',
      'Inner',
      '',
      '</details>',
      '',
      '</details>',
    ].join('\n');
    expectRoundTrip(markdown);
    const sections = nodesOfType(parseMarkdown(markdown), 'details');
    expect(sections.map((node) => node.attrs?.open)).toEqual([false, true]);
    // GitHub shows a summary's text as it is, so it stays plain text
    expect(nodesOfType(sections[0], 'detailsSummary')[0].content).toEqual([
      { type: 'text', text: 'Setup **steps** & <b>' },
    ]);
  });

  it('read a collapsible section written on fewer lines, and an unclosed one as text', () => {
    expect(normalizeMarkdown('<details><summary>One line</summary>\nBody\n</details>')).toBe(
      ['<details>', '<summary>One line</summary>', '', 'Body', '', '</details>'].join('\n'),
    );
    const unclosed = parseMarkdown('<details>\n<summary>Never closed</summary>');
    expect(nodesOfType(unclosed, 'details')).toEqual([]);
    expect(nodesOfType(unclosed, 'rawHtmlBlock')).toHaveLength(1);
  });

  it('render as their own elements, with nothing taken from the text', () => {
    const editor = new Editor({
      extensions: createDocumentExtensions(),
      content:
        '<kbd>K</kbd> <sub>a</sub> <sup>b</sup> <u>c</u>\n\n<details>\n<summary>S</summary>\n\nBody\n\n</details>',
      contentType: 'markdown',
    });
    const dom = editor.view.dom;
    expect([...dom.querySelectorAll('kbd, sub, sup, u')].map((el) => el.outerHTML)).toEqual([
      `<kbd class="${kbdVariants()}">K</kbd>`,
      '<sub>a</sub>',
      '<sup>b</sup>',
      '<u>c</u>',
    ]);
    expect(dom.querySelector('summary')?.textContent).toBe('S');
    editor.destroy();
  });
});

describe('callouts', () => {
  it('read GitHub alerts as callouts of each kind and write them back', () => {
    const markdown = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']
      .map((kind) => `> [!${kind}]\n> Text for ${kind.toLowerCase()}.`)
      .join('\n\n');
    expectRoundTrip(markdown);
    expect(nodesOfType(parseMarkdown(markdown), 'callout').map((node) => node.attrs?.kind)).toEqual(
      ['note', 'tip', 'important', 'warning', 'caution'],
    );
  });

  it('hold any blocks in their body', () => {
    const markdown = [
      '> [!WARNING]',
      '> The migration rewrites every row:',
      '>',
      '> - Back up first',
      '> - Run it off-hours',
      '>',
      '> ```sh',
      '> npm run migrate',
      '> ```',
      '',
      'After the callout.',
    ].join('\n');
    expectRoundTrip(markdown);
    const [callout] = nodesOfType(parseMarkdown(markdown), 'callout');
    expect(callout.content?.map((node) => node.type)).toEqual([
      'paragraph',
      'bulletList',
      'codeBlock',
    ]);
  });

  it('write the marker in capitals, and leave other quotes as quotes', () => {
    expect(normalizeMarkdown('> [!tip]\n> Lower case')).toBe('> [!TIP]\n> Lower case');
    for (const quote of [
      '> [!NOTE] on the same line',
      '> [!UNKNOWN]\n> Not a kind',
      '> Just a quote',
    ]) {
      expect(nodesOfType(parseMarkdown(quote), 'callout')).toEqual([]);
      expect(nodesOfType(parseMarkdown(quote), 'blockquote')).toHaveLength(1);
    }
  });

  it('keep an empty body', () => {
    expectRoundTrip('> [!NOTE]\n>');
  });
});

describe('untrusted content', () => {
  const html = [
    'Inline <span class="x">html</span> and <img src=x onerror=alert(1)> stay as text.',
    '',
    '<div align="center">',
    'Centred',
    '</div>',
    '',
    '![diagram](https://tracker.example/pixel.png "Diagram")',
    '',
    '[run me](javascript:alert(1))',
  ].join('\n');

  it('keeps HTML, images and refused links in the markdown', () => {
    expectRoundTrip(html);
    const doc = parseMarkdown(html);
    expect(nodesOfType(doc, 'rawHtmlInline').map((node) => node.attrs?.html)).toEqual([
      '<span class="x">',
      '</span>',
      '<img src=x onerror=alert(1)>',
    ]);
    expect(nodesOfType(doc, 'rawHtmlBlock')).toHaveLength(1);
    expect(nodesOfType(doc, 'imageLink')[0].attrs).toEqual({
      src: 'https://tracker.example/pixel.png',
      alt: 'diagram',
      title: 'Diagram',
    });
  });

  it('never renders HTML, loads an image or makes an unsafe href', () => {
    const editor = new Editor({
      extensions: createDocumentExtensions(),
      content: html,
      contentType: 'markdown',
    });
    const dom = editor.view.dom;
    // (ProseMirror puts an empty `img` of its own after an inline node that ends a paragraph)
    expect(dom.querySelector('img:not(.ProseMirror-separator), div[align], span.x')).toBeNull();
    expect(dom.querySelector('img[src]')).toBeNull();
    expect(dom.querySelector('pre[data-raw-html]')?.textContent).toContain('<div align="center">');
    expect(dom.querySelector('[data-image-src]')?.textContent).toBe('diagram');
    expect([...dom.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([]);
    expect(dom.querySelector('[data-unsafe-link]')?.textContent).toBe('run me');
    editor.destroy();
  });
});

// Keeping a note's text and its markers must render nothing the editor doesn't render anyway
// (docs/security/untrusted-content.md): raw HTML stays its source, an image a chip, a refused
// link plain text, whether its block is kept as written or written anew.
describe('untrusted content through a save', () => {
  const CONSTRUCTS: [string, string][] = [
    ['a block of HTML', '<div onclick="alert(1)">\n<script>alert(1)</script>\n</div>'],
    ['an iframe', '<iframe src="https://tracker.example/frame"></iframe>'],
    [
      'inline HTML',
      'Text with <img src=x onerror=alert(1)> and <a href="javascript:alert(1)">a link</a>.',
    ],
    ['an image', '![pixel](https://tracker.example/pixel.png "Pixel")'],
    [
      'a link the editor refuses',
      '__Run__ [this](javascript:alert(1)) and [that](data:text/html,x).',
    ],
    ['a comment and a doctype', '<!-- <script>alert(1)</script> -->\n<!DOCTYPE html>'],
  ];

  function domOf(markdown: string) {
    const editor = new Editor({
      extensions: createDocumentExtensions(),
      content: markdown,
      contentType: 'markdown',
    });
    return { editor, dom: editor.view.dom };
  }

  function expectNothingRendered(dom: HTMLElement) {
    expect(
      dom.querySelector('script, iframe, div[onclick], img[src], img[onerror], a[href], object'),
    ).toBeNull();
    for (const element of dom.querySelectorAll('*')) {
      for (const attribute of element.getAttributeNames()) expect(attribute).not.toMatch(/^on/);
    }
  }

  it.each(CONSTRUCTS)(
    'keeps %s as written, and unrendered, when a block beside it is edited',
    (_, construct) => {
      const text = `* Before\n\n${construct}\n\n__After__ it\n`;
      const { editor, dom } = domOf(text);
      expectNothingRendered(dom);
      editor.chain().focus('end').insertContent('!').run();
      const saved = editor.saveMarkdown();
      expect(saved).toBe(`* Before\n\n${construct}\n\n__After__ it!\n`);
      editor.destroy();
      const reopened = domOf(saved);
      expectNothingRendered(reopened.dom);
      reopened.editor.destroy();
    },
  );

  it.each(CONSTRUCTS)(
    'renders nothing of %s when its own block is written anew',
    (_, construct) => {
      const text = `${construct}\n\n* After\n`;
      const { editor } = domOf(text);
      // the block made new: typed in where it holds text, and moved below the list either way
      const [first, list] = editor.state.doc.children;
      editor.commands.setContent({ type: 'doc', content: [list.toJSON(), first.toJSON()] });
      const moved = editor.getMarkdown();
      editor.commands.setContent(text, { contentType: 'markdown' });
      editor.chain().setTextSelection(1).insertContent('Typed ').run();
      for (const saved of [moved, editor.saveMarkdown()]) {
        const reopened = domOf(saved);
        expectNothingRendered(reopened.dom);
        // and nothing of it was lost: what it holds is still in the text
        for (const part of construct.match(
          /javascript:alert\(1\)|tracker\.example|<script>|DOCTYPE/g,
        ) ?? []) {
          expect(saved).toContain(part);
        }
        reopened.editor.destroy();
      }
      editor.destroy();
    },
  );
});

describe('highlightToText', () => {
  it('turns a search title back into its text', () => {
    expect(highlightToText('Fix <b>login</b> &amp; &lt;b&gt; &quot;now&quot; &#39;ok&#39;')).toBe(
      `Fix login & <b> "now" 'ok'`,
    );
  });
});
