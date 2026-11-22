import { describe, it, expect } from 'vitest';
import { extractMentions } from '../../mentions/extract';

const task = (label: string, id = 'tsk_1') => `[${label}](devbrain://task/${id})`;

describe('extractMentions', () => {
  it('finds each linked item once, in the order first mentioned, with how often', () => {
    const md = [
      `See ${task('PKCE')} and [ADR](devbrain://note/nte_1).`,
      `Then ${task('PKCE again')}, in [Auth](devbrain://project/prj_1) for [Review](devbrain://event/evt_1).`,
    ].join('\n');
    expect(extractMentions(md).map(({ targetId, count }) => [targetId, count])).toEqual([
      ['tsk_1', 2],
      ['nte_1', 1],
      ['prj_1', 1],
      ['evt_1', 1],
    ]);
  });

  it('keeps the line of the first mention as plain text either side of it', () => {
    const [mention] = extractMentions(
      `- [ ] Pair on ${task('Implement **PKCE**')} before *Thursday*, see [ADR](devbrain://note/nte_1)`,
    );
    expect(mention).toMatchObject({
      contextBefore: 'Pair on ',
      contextAfter: ' before Thursday, see ADR',
    });
  });

  it('strips a heading and a quote around the mention', () => {
    expect(extractMentions(`## Milestone 1: ${task('PKCE')}`)[0]).toMatchObject({
      contextBefore: 'Milestone 1: ',
      contextAfter: '',
    });
    expect(extractMentions(`> Blocked on ${task('PKCE')}`)[0]).toMatchObject({
      contextBefore: 'Blocked on ',
    });
  });

  it('shows another link on the line by its label, unescaped', () => {
    const [, second] = extractMentions(
      `[Design \\[review\\]](devbrain://event/evt_1) then ${task('PKCE')}`,
    );
    expect(second.contextBefore).toBe('Design [review] then ');
  });

  it('cuts a long line either side with "…"', () => {
    const [mention] = extractMentions(`${'a'.repeat(200)} ${task('PKCE')} ${'b'.repeat(200)}`);
    expect(mention.contextBefore).toMatch(/^…a+ $/);
    expect(mention.contextBefore).toHaveLength(121);
    expect(mention.contextAfter).toMatch(/^ b+…$/);
    expect(mention.contextAfter).toHaveLength(161);
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
    expect(extractMentions(md).map((m) => m.targetId)).toEqual(['tsk_1']);
  });

  it('ends a fence only at one of the same character at least as long', () => {
    const md = ['````', '```', task('still code', 'tsk_2'), '````', task('after')].join('\n');
    expect(extractMentions(md).map((m) => m.targetId)).toEqual(['tsk_1']);
  });

  it('leaves out a link whose id is not of its type', () => {
    expect(extractMentions(`[x](devbrain://task/prj_1) and [y](devbrain://task/tsk)`)).toEqual([]);
  });

  it('finds nothing in text without links', () => {
    expect(extractMentions('')).toEqual([]);
    expect(extractMentions('[a link](https://example.com) and plain text')).toEqual([]);
  });
});
