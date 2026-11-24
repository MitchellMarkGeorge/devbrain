import { describe, expect, it } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import {
  createDocumentExtensions,
  normalizeMarkdown,
  parseMarkdown,
  readMarkdown,
  relaxEntities,
  serializeMarkdown,
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

  it('keeps the slice of a paragraph that holds only an image, which reads as the image', () => {
    const source = expectLinedUp('Before\n\n![diagram](a.png "A")\n\nAfter');
    const [, image] = slices(source);
    expect(image.nodes.map((node) => node.type.name)).toEqual(['imageLink']);
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
    expect(dom.querySelector('img, div[align], span.x')).toBeNull();
    expect(dom.querySelector('pre[data-raw-html]')?.textContent).toContain('<div align="center">');
    expect(dom.querySelector('[data-image-src]')?.textContent).toBe('diagram');
    expect([...dom.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([]);
    expect(dom.querySelector('[data-unsafe-link]')?.textContent).toBe('run me');
    editor.destroy();
  });
});

describe('highlightToText', () => {
  it('turns a search title back into its text', () => {
    expect(highlightToText('Fix <b>login</b> &amp; &lt;b&gt; &quot;now&quot; &#39;ok&#39;')).toBe(
      `Fix login & <b> "now" 'ok'`,
    );
  });
});
