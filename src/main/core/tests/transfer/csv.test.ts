import { describe, expect, it } from 'vitest';
import { formatCsv, guardCell, parseCsv, unguardCell } from '../../transfer/csv';

describe('CSV', () => {
  it('round-trips commas, quotes, line breaks and surrounding spaces', () => {
    const rows = [
      ['title', 'description'],
      ['Ship it, today', 'Line one\nLine two'],
      ['Say "hi"', '  padded  '],
      ['', 'empty first cell'],
    ];
    expect(parseCsv(formatCsv(rows))).toEqual({ records: rows, unclosedQuoteRow: null });
  });

  it('reads LF, CRLF and CR line endings, and a last line without one', () => {
    expect(parseCsv('a,b\nc,d\r\ne,f\rg,h').records).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
      ['g', 'h'],
    ]);
    expect(parseCsv('a,b\n').records).toEqual([['a', 'b']]);
  });

  it('keeps a quote in the middle of an unquoted field as text', () => {
    expect(parseCsv('5" screen,x').records).toEqual([['5" screen', 'x']]);
  });

  it('reports the record whose quoted field never closes', () => {
    expect(parseCsv('a\n"b\nc').unclosedQuoteRow).toBe(2);
  });

  it('guards cells a spreadsheet would run as formulas, and round-trips them', () => {
    for (const value of ['=1+1', '+SUM(A1)', '-2', '@cmd', "'quoted", "'=x"]) {
      expect(guardCell(value)).toBe(`'${value}`);
      expect(unguardCell(guardCell(value))).toBe(value);
    }
    expect(formatCsv([['=HYPERLINK("x")']])).toBe(`"'=HYPERLINK(""x"")"`);
    expect(parseCsv(formatCsv([['=HYPERLINK("x")']])).records).toEqual([['=HYPERLINK("x")']]);
    // plain values, and a ' a spreadsheet did not add, are left alone
    expect(guardCell('Plain')).toBe('Plain');
    expect(unguardCell("'tis")).toBe("'tis");
  });
});
