import { Extension, type JSONContent } from '@tiptap/core';

/**
 * The markers a block or a mark was written with, where markdown has more than one spelling and
 * the text used another than the editor's: `*` and `+` bullets, `1)` numbers, `[X]`, `__bold__`,
 * `_italic_`, `~strike~`, an underlined heading or one with closing `#`s, `***` and `___` rules,
 * `~~~` and longer fences, indented code, a `\` or `<br>` line break.
 *
 * Each is kept in a `markup` attribute of its node or mark: null for the editor's own spelling,
 * which everything made in the editor has. The rule that reads the node sets it (`parse`) and
 * writes it back (`render`), so a block an edit rewrites keeps the spelling it was read with
 * (docs/editor.md, "What a save changes"). The attribute is never drawn, nor read from HTML.
 *
 * A marker can read differently where it now stands (`_it_s` is no emphasis, `*it*s` is), so a
 * save writes a block with its markers only where they read as the editor's own spelling would
 * (keeping.ts). `stripMarkup` gives that spelling, which is also what the clipboard, a document
 * written whole and `editor.getMarkdown()` use.
 */

/** The nodes and marks that have a `markup` attribute. */
export const MARKUP_TYPES = [
  'bulletList',
  'orderedList',
  'taskList',
  'taskItem',
  'heading',
  'horizontalRule',
  'codeBlock',
  'hardBreak',
  'bold',
  'italic',
  'strike',
];

export const DocumentMarkup = Extension.create({
  name: 'documentMarkup',

  addGlobalAttributes() {
    return [
      {
        types: MARKUP_TYPES,
        attributes: {
          markup: { default: null, rendered: false, keepOnSplit: true, parseHTML: () => null },
        },
      },
    ];
  },
});

/** `attrs` with the marker a rule read, when the text used one of its own. */
export function withMarkup(
  attrs: Record<string, unknown> | undefined,
  markup: string | null | undefined,
): Record<string, unknown> | undefined {
  return markup ? { ...attrs, markup } : attrs;
}

/** The marker a node or mark was read with, or null for the editor's own. */
export function markupOf(attrs: Record<string, unknown> | undefined): string | null {
  const markup = attrs?.markup;
  return typeof markup === 'string' && markup !== '' ? markup : null;
}

type WithAttrs = { attrs?: Record<string, unknown> };

function strip<T extends WithAttrs>(item: T): T {
  if (!item.attrs || !('markup' in item.attrs) || item.attrs.markup === null) return item;
  return { ...item, attrs: { ...item.attrs, markup: null } };
}

/** `node` without the markers it was read with: as the editor spells what is made in it. */
export function stripMarkup(node: JSONContent): JSONContent {
  const stripped = strip(node);
  const marks = node.marks?.map(strip);
  const content = node.content?.map(stripMarkup);
  const changed =
    stripped !== node ||
    marks?.some((mark, index) => mark !== node.marks![index]) ||
    content?.some((child, index) => child !== node.content![index]);
  if (!changed) return node;
  return { ...stripped, ...(marks && { marks }), ...(content && { content }) };
}

/** Whether `node` or anything in it was read with a marker. */
export function hasMarkup(node: JSONContent): boolean {
  return (
    markupOf(node.attrs) !== null ||
    (node.marks ?? []).some((mark) => markupOf(mark.attrs) !== null) ||
    (node.content ?? []).some(hasMarkup)
  );
}
