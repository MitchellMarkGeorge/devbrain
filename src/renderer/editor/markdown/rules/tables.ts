import type { JSONContent } from '@tiptap/core';
import type { MarkdownRule, RenderHelpers } from '../types';

/**
 * GFM tables: `marked` reads them (after `|` inside code spans is escaped, which `marked` would
 * take for a column), and they are written padded into columns, with `<br>` for a line break in a
 * cell, as a cell must stay on one line.
 */

type Align = 'left' | 'right' | 'center';

function normalizeAlign(value: unknown): Align | null {
  return value === 'left' || value === 'right' || value === 'center' ? value : null;
}

// `|` inside a code span on a row's line, escaped so `marked` doesn't split the cell there
function escapeTableCellPipes(line: string): string {
  let result = '';
  let i = 0;
  while (i < line.length) {
    if (line[i] === '\\' && i + 1 < line.length) {
      result += line[i] + line[i + 1];
      i += 2;
      continue;
    }
    if (line[i] !== '`') {
      result += line[i++];
      continue;
    }
    let runLength = 0;
    while (i + runLength < line.length && line[i + runLength] === '`') runLength += 1;
    let j = i + runLength;
    let found = false;
    while (j < line.length) {
      if (line[j] !== '`') {
        j += 1;
        continue;
      }
      let closeLength = 0;
      while (j + closeLength < line.length && line[j + closeLength] === '`') closeLength += 1;
      if (closeLength === runLength) {
        const span = line.slice(i + runLength, j);
        result +=
          line.slice(i, i + runLength) +
          span.replace(/\\\||\|/g, (match) => (match === '|' ? '\\|' : match)) +
          line.slice(j, j + runLength);
        i = j + runLength;
        found = true;
        break;
      }
      j += closeLength;
    }
    if (!found) {
      result += line.slice(i, i + runLength);
      i += runLength;
    }
  }
  return result;
}

function preprocessTablePipes(src: string): string {
  return src
    .split('\n')
    .map((line) => (line.includes('|') && line.includes('`') ? escapeTableCellPipes(line) : line))
    .join('\n');
}

const DELIMITER_ROW = /^[ \t|:]*-[ \t|:-]*$/;

function collapseWhitespace(text: string): string {
  return (text || '').replaceAll('\u001F', ' ').replace(/\s+/g, ' ').trim();
}

function escapePipesInCellText(text: string): string {
  return text.replace(/\\.|\|/g, (match) => (match === '|' ? '\\|' : match));
}

// a line break with no marker of its own (markup.ts): in a cell it is always `<br>`
function withoutBreakMarkup(node: JSONContent): JSONContent {
  if (node.type === 'hardBreak') return node.attrs ? { type: 'hardBreak' } : node;
  return node.content ? { ...node, content: node.content.map(withoutBreakMarkup) } : node;
}

function renderTable(node: JSONContent, h: RenderHelpers): string {
  if (!node.content || node.content.length === 0) return '';
  const rows = node.content.map((row) =>
    (row.content ?? []).map((plainCell) => {
      // a line break in a cell is written `<br>`, whatever it was read as
      const cell = withoutBreakMarkup(plainCell);
      const raw =
        Array.isArray(cell.content) && cell.content.length > 1
          ? cell.content.map((child) => h.renderChildren(child)).join('\n')
          : cell.content
            ? h.renderChildren(cell.content)
            : '';
      return {
        text: escapePipesInCellText(collapseWhitespace(raw.replace(/[ \t]*\r?\n[ \t]*/g, '<br>'))),
        isHeader: cell.type === 'tableHeader',
        align: normalizeAlign(cell.attrs?.align),
      };
    }),
  );
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (columnCount === 0) return '';
  const widths = Array.from({ length: columnCount }, () => 0);
  for (const row of rows) {
    for (let i = 0; i < columnCount; i += 1) {
      const length = (row[i]?.text || '').length;
      if (length > widths[i]) widths[i] = length;
      if (widths[i] < 3) widths[i] = 3;
    }
  }
  const pad = (text: string, width: number) => text + ' '.repeat(Math.max(0, width - text.length));
  const headerRow = rows[0];
  const hasHeader = headerRow.some((cell) => cell.isHeader);
  const aligns: (Align | null)[] = Array.from({ length: columnCount }, () => null);
  for (const row of rows) {
    for (let i = 0; i < columnCount; i += 1) {
      if (!aligns[i] && row[i]?.align) aligns[i] = row[i].align;
    }
  }
  const headerTexts = Array.from({ length: columnCount }, (_, i) =>
    hasHeader ? headerRow[i]?.text || '' : '',
  );
  const lines = [
    `| ${headerTexts.map((text, i) => pad(text, widths[i])).join(' | ')} |`,
    `| ${widths
      .map((width, i) => {
        const dashes = '-'.repeat(Math.max(3, width));
        if (aligns[i] === 'left') return `:${dashes}`;
        if (aligns[i] === 'right') return `${dashes}:`;
        if (aligns[i] === 'center') return `:${dashes}:`;
        return dashes;
      })
      .join(' | ')} |`,
    ...(hasHeader ? rows.slice(1) : rows).map(
      (row) =>
        `| ${Array.from({ length: columnCount }, (_, i) => pad(row[i]?.text || '', widths[i])).join(' | ')} |`,
    ),
  ];
  return lines.join('\n');
}

export const tableRules: Record<string, MarkdownRule> = {
  table: {
    name: 'table',
    parse: (token, h) => {
      const aligns: unknown[] = Array.isArray(token.align) ? token.align : [];
      const cellOf = (type: string, cell: { tokens: never[]; align?: unknown }, index: number) => {
        const align = normalizeAlign(aligns[index] ?? cell.align);
        return h.createNode(type, align ? { align } : {}, [
          // `<br>` is how a cell breaks a line: it is no marker of the text's own there
          { type: 'paragraph', content: h.parseInline(cell.tokens).map(withoutBreakMarkup) },
        ]);
      };
      const rows: JSONContent[] = [];
      if (token.header) {
        rows.push(
          h.createNode(
            'tableRow',
            {},
            token.header.map((cell: never, i: number) => cellOf('tableHeader', cell, i)),
          ),
        );
      }
      for (const row of token.rows ?? []) {
        rows.push(
          h.createNode(
            'tableRow',
            {},
            row.map((cell: never, i: number) => cellOf('tableCell', cell, i)),
          ),
        );
      }
      return h.createNode('table', undefined, rows);
    },
    render: (node, h) => renderTable(node, h),
    tokenizer: {
      name: 'table',
      level: 'block',
      start: (src) => {
        const lines = src.split('\n');
        if (lines.length < 2) return -1;
        const delimiter = lines[1];
        if (!DELIMITER_ROW.test(delimiter) || !delimiter.includes('|')) return -1;
        return lines[0].includes('|') ? 0 : -1;
      },
      // only a table with `|` in a code span: marked reads the rest itself
      tokenize: (src, _tokens, lexer) => {
        const blankLine = src.indexOf('\n\n');
        const candidate = blankLine >= 0 ? src.slice(0, blankLine) : src;
        const lines = candidate.split('\n');
        if (lines.length < 2) return undefined;
        const delimiter = lines[1];
        if (!DELIMITER_ROW.test(delimiter) || !delimiter.includes('|')) return undefined;
        const preprocessed = preprocessTablePipes(candidate);
        if (preprocessed === candidate) return undefined;
        const table = lexer.blockTokens(preprocessed)[0];
        if (table?.type !== 'table' || !table.raw) return undefined;
        const lineCount = table.raw.split('\n').length;
        return { ...table, raw: src.split('\n').slice(0, lineCount).join('\n') };
      },
    },
  },
};
