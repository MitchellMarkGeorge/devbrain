import { CsvError, parse } from 'csv-parse/sync';

// RFC 4180 CSV, as spreadsheets read and write it: comma-separated, a field quoted when it holds a
// comma, a quote or a line break, and a quote inside a quoted field doubled.

// A cell a spreadsheet would run as a formula when it starts with one of these (CSV injection), so
// an export puts a ' in front, as spreadsheets do to show a value as text. An import takes one off
// again, so such values round-trip. A ' itself is guarded too, or a value starting with '= would
// lose its quote on the way back.
const FORMULA_START = /^[=+\-@\t\r']/;

export function guardCell(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

export function unguardCell(value: string): string {
  return value.startsWith("'") && FORMULA_START.test(value.slice(1)) ? value.slice(1) : value;
}

function quoteCell(value: string): string {
  return /[",\r\n]/.test(value) || value !== value.trim()
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

// rows as CSV text, every cell guarded, lines ending in CRLF as RFC 4180 has it
export function formatCsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => quoteCell(guardCell(cell))).join(',')).join('\r\n');
}

/**
 * The records of CSV text, each a list of cells, guarded cells unguarded, or what makes the text
 * unreadable as CSV. Parsed by csv-parse: LF, CRLF and CR line endings, line breaks inside quoted
 * fields (one record, as in a spreadsheet), rows of different lengths, and a quote in the middle of
 * an unquoted field kept as text. A blank line is a record of one empty cell, so record numbers stay
 * the spreadsheet's rows.
 */
export function parseCsv(text: string): { records: string[][]; problem: string | null } {
  try {
    const records: string[][] = parse(text, {
      bom: true,
      record_delimiter: ['\r\n', '\n', '\r'],
      relax_column_count: true,
      relax_quotes: true,
    });
    return { records: records.map((record) => record.map(unguardCell)), problem: null };
  } catch (error) {
    if (!(error instanceof CsvError)) throw error;
    // `records` counts the records read before the one that failed
    const row = error.records;
    const where = typeof row === 'number' ? `row ${row + 1}` : 'a row';
    return {
      records: [],
      problem:
        error.code === 'CSV_QUOTE_NOT_CLOSED'
          ? `${where} has a quote that never closes`
          : `${where} is not valid CSV`,
    };
  }
}
