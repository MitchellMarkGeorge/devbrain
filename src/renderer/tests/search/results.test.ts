import { describe, expect, it } from 'vitest';
import type { SearchEntityType, SearchResult } from '@common/types';
import {
  countResults,
  groupResults,
  isSearchHtml,
  nextFilter,
  PER_GROUP,
} from '../../pages/search/results';

const result = (entityType: SearchEntityType, n: number): SearchResult =>
  ({
    entityId: `${entityType}_${n}`,
    entityType,
    title: `${entityType} ${n}`,
    body: '',
    rank: -n,
    status: null,
    color: null,
    external: null,
  }) as SearchResult;

const RESULTS = [
  result('event', 1),
  result('task', 1),
  result('note', 1),
  ...Array.from({ length: 7 }, (_, i) => result('task', i + 2)),
];

describe('countResults', () => {
  it('counts every result and each type', () => {
    expect(countResults(RESULTS)).toEqual({ all: 10, task: 8, note: 1, project: 0, event: 1 });
  });
});

describe('groupResults', () => {
  it('lists the types with matches in order for All, PER_GROUP of each, with full counts', () => {
    const groups = groupResults(RESULTS, 'all');
    expect(groups.map(({ label, count }) => [label, count])).toEqual([
      ['Tasks', 8],
      ['Notes', 1],
      ['Events', 1],
    ]);
    expect(groups[0].results).toHaveLength(PER_GROUP);
    // best first, as search returned them
    expect(groups[0].results[0].entityId).toBe('task_1');
  });

  it("lists every match of one type under that type's filter", () => {
    const groups = groupResults(RESULTS, 'task');
    expect(groups).toHaveLength(1);
    expect(groups[0].results).toHaveLength(8);
  });

  it('gives no group for a type without matches', () => {
    expect(groupResults(RESULTS, 'project')).toEqual([]);
  });
});

describe('nextFilter', () => {
  it('steps through the filters and wraps round', () => {
    expect(nextFilter('all', 1)).toBe('task');
    expect(nextFilter('event', 1)).toBe('all');
    expect(nextFilter('all', -1)).toBe('event');
    expect(nextFilter('note', -1)).toBe('task');
  });
});

describe('isSearchHtml', () => {
  it("accepts core's escaped text with <b> around matches", () => {
    expect(isSearchHtml('Fix &lt;img&gt; &amp; &quot;co&quot; &#39;s <b>pkce</b>')).toBe(true);
    expect(isSearchHtml('')).toBe(true);
  });

  it('refuses any other markup, and a raw ampersand', () => {
    for (const html of [
      '<img src=x onerror=alert(1)>',
      '<b onclick="x">pkce</b>',
      '<B>pkce</B>',
      '<script>alert(1)</script>',
      'a & b',
      '&nbsp;',
      'a > b',
    ]) {
      expect(isSearchHtml(html), html).toBe(false);
    }
  });
});
