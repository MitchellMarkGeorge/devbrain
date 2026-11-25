import { describe, it, expect } from 'vitest';
import { extractMentions } from '../../mentions/extract';

const task = (label: string, id = 'tsk_1') => `[${label}](devbrain://task/${id})`;

describe('extractMentions', () => {
  it('finds each linked item once, in the order first mentioned', () => {
    const md = [
      `See ${task('PKCE')} and [ADR](devbrain://note/nte_1).`,
      `Then ${task('PKCE again')}, in [Auth](devbrain://project/prj_1) for [Review](devbrain://event/evt_1).`,
    ].join('\n');
    expect(extractMentions(md)).toEqual(['tsk_1', 'nte_1', 'prj_1', 'evt_1']);
  });

  it('finds links in every block that holds text: headings, quotes, to-dos, table cells', () => {
    const md = [
      `## ${task('heading', 'tsk_1')}`,
      '',
      `> ${task('quote', 'tsk_2')}`,
      '',
      `- [ ] ${task('to-do', 'tsk_3')}`,
      '',
      '| Task | Why |',
      '| --- | --- |',
      `| ${task('cell', 'tsk_4')} | **${task('bold', 'tsk_5')}** |`,
      '',
      `A label with \\[brackets\\]: [Design \\[review\\]](devbrain://event/evt_1)`,
    ].join('\n');
    expect(extractMentions(md)).toEqual(['tsk_1', 'tsk_2', 'tsk_3', 'tsk_4', 'tsk_5', 'evt_1']);
  });

  it('leaves out links in code blocks and code spans', () => {
    const md = [
      '```ts',
      task('in a fence', 'tsk_2'),
      '```',
      '~~~',
      task('in a tilde fence', 'tsk_3'),
      '~~~',
      `\`${task('in a span', 'tsk_4')}\` but ${task('this one')}`,
    ].join('\n');
    expect(extractMentions(md)).toEqual(['tsk_1']);
  });

  it('leaves out links in code wherever the code is: a list item, a quote, indented', () => {
    const md = [
      '- item',
      '  ```',
      `  ${task('fence in a list item', 'tsk_2')}`,
      '  ```',
      '',
      '> ```',
      `> ${task('fence in a quote', 'tsk_3')}`,
      '> ```',
      '',
      `    ${task('indented code', 'tsk_4')}`,
      '',
      `Text ${task('this one')}`,
    ].join('\n');
    expect(extractMentions(md)).toEqual(['tsk_1']);
  });

  it('ends a fence only at one of the same character at least as long', () => {
    const md = ['````', '```', task('still code', 'tsk_2'), '````', task('after')].join('\n');
    expect(extractMentions(md)).toEqual(['tsk_1']);
  });

  it('leaves out links in raw HTML, but reads a <details> body as the markdown it is', () => {
    const md = [
      `<div>${task('in HTML', 'tsk_2')}</div>`,
      '',
      '<details>',
      '<summary>Steps</summary>',
      '',
      `Then ${task('in the body')}`,
      '',
      '</details>',
    ].join('\n');
    expect(extractMentions(md)).toEqual(['tsk_1']);
  });

  it('leaves out a link whose id is not of its type', () => {
    expect(extractMentions(`[x](devbrain://task/prj_1) and [y](devbrain://task/tsk)`)).toEqual([]);
  });

  it('finds nothing in text without links', () => {
    expect(extractMentions('')).toEqual([]);
    expect(extractMentions('[a link](https://example.com) and plain text')).toEqual([]);
  });
});
