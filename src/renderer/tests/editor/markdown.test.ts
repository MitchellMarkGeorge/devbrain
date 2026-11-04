// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import {
  createDocumentExtensions,
  normalizeMarkdown,
  parseMarkdown,
  relaxEntities,
} from '../../editor/markdown';
import { highlightToText } from '../../editor/highlight';

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

describe('untrusted content', () => {
  const html = [
    'Inline <span class="x">html</span> and <img src=x onerror=alert(1)> stay as text.',
    '',
    '<details>',
    '<summary>More</summary>',
    'Hidden',
    '</details>',
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
    expect(dom.querySelector('img, details, span.x')).toBeNull();
    expect(dom.querySelector('pre[data-raw-html]')?.textContent).toContain('<details>');
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
