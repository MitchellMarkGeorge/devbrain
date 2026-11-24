import { describe, expect, it } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import {
  createDocumentExtensions,
  normalizeMarkdown,
  parseMarkdown,
  relaxEntities,
  serializeKeepingSource,
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

  it('keeps blocks moved past each other as written, with a blank line between', () => {
    const text = '* One\n\n\n__Two__';
    const [one, two] = parseMarkdown(text).content ?? [];
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
    expect(parseMarkdown(saved)).toEqual(doc);
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
    // read as a bare image, which the editor puts in a paragraph
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
    // and at the end when the text around it is gone
    const gone = 'Use [it][docs] here.\n\n[docs]: https://example.com\n\nGone\n\n* Last\n';
    const removed = edit(gone, 1);
    const saved = serializeKeepingSource(gone, removed);
    expect(saved).toBe('Use [it][docs] here.\n\n* Last\n\n[docs]: https://example.com\n');
    expect(parseMarkdown(saved)).toEqual(removed);
    // a label defined again, as GitHub's comments do (`[//]: # (start)`), which marked ignores
    const comments = 'Body\n\n[//]: # (start)\n[//]: # (end)\n\n* Item';
    expect(serializeKeepingSource(comments, parseMarkdown(comments))).toBe(comments);
    expect(serializeKeepingSource(comments, edit(comments, 0, paragraph('Changed')))).toBe(
      'Changed\n\n[//]: # (start)\n[//]: # (end)\n\n* Item',
    );
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
    // a label defined twice, differently, and used
    const twice = '[a][x]\n\n[x]: https://one.example\n[x]: https://two.example\n\nEnd';
    const changed = edit(twice, 1, paragraph('Changed'));
    expect(serializeKeepingSource(twice, changed)).toBe(serializeMarkdown(changed));
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
    // the editor writes "<br> a" as a line break and a space, and that again with one more space
    const text = 'Edited\n\nA line <br> a break';
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
