// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import {
  createDocumentExtensions,
  normalizeMarkdown,
  parseMarkdown,
  relaxEntities,
  serializeMarkdown,
} from '@renderer/editor/markdown';
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
