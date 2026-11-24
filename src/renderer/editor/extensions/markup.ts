import { Extension, type JSONContent, type MarkdownToken } from '@tiptap/core';

/**
 * The markers a block or a mark was written with, where markdown has more than one and the file
 * used another than the editor's: `*` or `+` bullets, `1)` numbers, `__bold__`, `_italic_`, an
 * underlined (setext) heading, `***` or `___` rules, `~~~` fences and indented code. Each is kept
 * in a `markup` attribute (null for the editor's own spelling, which new content gets) and written
 * back, so a block an edit rewrites keeps its file's spelling (docs/editor.md, "What a save
 * changes"). The attribute is never drawn or read from HTML.
 *
 * The extensions themselves are left as they are: DocumentMarkdownManager wraps their parse and
 * render handlers with `withMarkupHandlers` as it registers them, so the UI's own versions (a code
 * block's view) keep the markers too, and the schema's order of marks (which decides how they
 * nest when written) stays the same.
 *
 * Written back, a marker can read differently from where it stands (`_it_s` is no emphasis, `*it*s`
 * is), so a save checks each rewritten block that has one and writes it in the editor's spelling
 * where it would; `stripMarkup` gives that spelling.
 */
export const MarkdownMarkup = Extension.create({
  name: 'markdownMarkup',
  addGlobalAttributes() {
    return [
      {
        types: Object.keys(MARKUP),
        attributes: {
          markup: { default: null, rendered: false, keepOnSplit: true, parseHTML: () => null },
        },
      },
    ];
  },
});

type Attributes = Record<string, unknown> | undefined;

interface RenderHelpers {
  renderChild?: (node: JSONContent, index: number) => string;
}

interface Markup {
  // the marker `token` was written with, or null for the editor's own
  read(token: MarkdownToken): string | null;
  // `written`, as the extension writes `node`, with `node`'s marker in place of its own
  write(node: JSONContent, marker: string, written: string, helpers: RenderHelpers): string;
}

const raw = (token: MarkdownToken) => token.raw ?? '';

// a list's items, each written by its own handler, with `fix` applied to the start of each
function writeItems(
  node: JSONContent,
  helpers: RenderHelpers,
  written: string,
  fix: (item: string) => string,
): string {
  const renderChild = helpers.renderChild;
  if (!renderChild) return written;
  return (node.content ?? []).map((item, index) => fix(renderChild(item, index))).join('\n');
}

// the bullet a list was written with (marked starts a new list where the bullet changes)
function bulletOf(token: MarkdownToken): string | null {
  const bullet = raw(token).trimStart()[0];
  return bullet === '*' || bullet === '+' ? bullet : null;
}

// the text a code block holds
const codeOf = (node: JSONContent) =>
  (node.content ?? []).map((child) => child.text ?? '').join('');

const MARKUP: Record<string, Markup> = {
  bold: {
    read: (token) => (raw(token).startsWith('__') ? '__' : null),
    write: (_, marker, written) => written.replace(/^\*\*/, marker).replace(/\*\*$/, marker),
  },
  italic: {
    read: (token) => (raw(token).startsWith('_') ? '_' : null),
    write: (_, marker, written) => written.replace(/^\*/, marker).replace(/\*$/, marker),
  },
  bulletList: {
    read: bulletOf,
    write: (node, bullet, written, helpers) =>
      writeItems(node, helpers, written, (item) => item.replace(/^- /, `${bullet} `)),
  },
  taskList: {
    read: bulletOf,
    write: (node, bullet, written, helpers) =>
      writeItems(node, helpers, written, (item) => item.replace(/^- \[/, `${bullet} [`)),
  },
  orderedList: {
    read: (token) => {
      const first = token.items?.[0];
      return /^\s*\d+([.)])/.exec(first ? raw(first) : raw(token))?.[1] === ')' ? ')' : null;
    },
    write: (node, _, written, helpers) =>
      writeItems(node, helpers, written, (item) => item.replace(/^(\d+)\. /, '$1) ')),
  },
  heading: {
    // an underlined heading keeps its underline, as long as it was
    read: (token) => /\n *(=+|-+) *$/.exec(raw(token).trimEnd())?.[1] ?? null,
    write: (node, underline, written) => {
      const level = Number(node.attrs?.level ?? 1);
      const title = written.replace(/^#+ /, '');
      // one line of text, under a line of the heading's level
      const fits =
        (underline[0] === '=' ? 1 : 2) === level && title !== '' && !title.includes('\n');
      return fits ? `${title}\n${underline}` : written;
    },
  },
  horizontalRule: {
    read: (token) => {
      const rule = raw(token).trim();
      return rule === '---' ? null : rule;
    },
    write: (_, rule) => rule,
  },
  codeBlock: {
    read: (token) => {
      const fence = /^(`{3,}|~{3,})/.exec(raw(token))?.[1];
      if (fence) return fence === '```' ? null : fence;
      const style = (token as { codeBlockStyle?: string }).codeBlockStyle;
      return style === 'indented' ? 'indented' : null;
    },
    write: (node, markup, written) => {
      const code = codeOf(node);
      if (markup === 'indented') {
        // only code with no language, and lines that keep it one block
        if (node.attrs?.language || code.trim() === '') return written;
        return code
          .split('\n')
          .map((line) => (line === '' ? '' : `    ${line}`))
          .join('\n');
      }
      // a fence no line of the code could close
      if (code.split('\n').some((line) => line.trimStart().startsWith(markup))) return written;
      return written.replace(/^```/, markup).replace(/```$/, markup);
    },
  },
};

// what a parse handler gives, with `markup` on the node it makes or the mark it applies
function withMarkup<T>(result: T, markup: string | null): T {
  if (!markup || !result || Array.isArray(result) || typeof result !== 'object') return result;
  const value = result as { attrs?: Attributes };
  return { ...result, attrs: { ...value.attrs, markup } };
}

type ParseHandler = (token: MarkdownToken, helpers: never) => unknown;
type RenderHandler = (node: JSONContent, helpers: RenderHelpers, context: never) => string;

/**
 * An extension's markdown handlers, as `@tiptap/markdown` registers them, made to read and write
 * the markers of `nodeName` (when it has any).
 */
export function withMarkupHandlers(spec: {
  nodeName: string;
  parseMarkdown?: ParseHandler;
  renderMarkdown?: RenderHandler;
}): void {
  const markup = MARKUP[spec.nodeName];
  if (!markup) return;
  const { parseMarkdown, renderMarkdown } = spec;
  if (parseMarkdown) {
    spec.parseMarkdown = (token, helpers) =>
      withMarkup(parseMarkdown(token, helpers), markup.read(token));
  }
  if (renderMarkdown) {
    spec.renderMarkdown = (node, helpers, context) => {
      const written = renderMarkdown(node, helpers, context);
      const marker = node.attrs?.markup;
      return typeof marker === 'string' ? markup.write(node, marker, written, helpers) : written;
    };
  }
}

/** `doc` without the markers it was read with, as the editor writes new content. */
export function stripMarkup(doc: JSONContent): JSONContent {
  const strip = <T extends { attrs?: Attributes }>(item: T): T =>
    item.attrs?.markup ? { ...item, attrs: { ...item.attrs, markup: null } } : item;
  const node = strip(doc);
  return {
    ...node,
    ...(node.marks ? { marks: node.marks.map(strip) } : {}),
    ...(node.content ? { content: node.content.map(stripMarkup) } : {}),
  };
}

/** Whether `node` or anything in it keeps a marker. */
export function hasMarkup(node: JSONContent): boolean {
  return (
    Boolean(node.attrs?.markup) ||
    (node.marks ?? []).some((mark) => mark.attrs?.markup) ||
    (node.content ?? []).some(hasMarkup)
  );
}
