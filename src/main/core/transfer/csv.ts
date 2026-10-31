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
 * The records of CSV text, each a list of cells, guarded cells unguarded. Accepts LF, CRLF and CR
 * line endings, and line breaks inside quoted fields (one record, as in a spreadsheet). A quote in
 * the middle of an unquoted field is kept as text. Returns the number of the record whose quoted
 * field never closes as `unclosedQuoteRow`, with the records before it.
 */
export function parseCsv(text: string): { records: string[][]; unclosedQuoteRow: number | null } {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;

  const endCell = () => {
    record.push(unguardCell(cell));
    cell = '';
  };
  const endRecord = () => {
    endCell();
    records.push(record);
    record = [];
  };

  while (i < text.length) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      cell += char;
      i += 1;
      continue;
    }
    if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === ',') {
      endCell();
    } else if (char === '\r' || char === '\n') {
      endRecord();
      if (char === '\r' && text[i + 1] === '\n') i += 1;
    } else {
      cell += char;
    }
    i += 1;
  }
  if (quoted) return { records, unclosedQuoteRow: records.length + 1 };
  // a last line without a line break; a trailing line break adds no record
  if (cell !== '' || record.length > 0) endRecord();
  return { records, unclosedQuoteRow: null };
}
