import type { JSONContent } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import { encodeEntities } from './entities';
import { stripMarkup, withListsApart } from './markup';
import type { RuleTable } from './rules';
import type { RenderContext, RenderHelpers } from './types';

/**
 * The editor's JSON to markdown: each node is written by its rule (rules.ts), and the serializer
 * writes the marks on a run of text nodes itself, opening and closing each where its span starts
 * and ends:
 *
 * - Marks nest by their rank in the schema: the higher priority mark outside (a link around its
 *   bold text), and a mark that ends sooner inside one that goes on. They close in the reverse
 *   of the order they opened in.
 * - Spaces at a mark's edges are moved outside it (`** bold**` isn't bold in markdown).
 * - Where two marks overlap without nesting, the mark that has to reopen does so as HTML when its
 *   rule has a tag for it (`<strong>`), as markdown can't cross them.
 * - A mark is written around a placeholder for its text, and split at it into its opening and its
 *   closing.
 *
 * Text is written escaped (`encodeText`): markdown's own characters with a backslash, and `&`, `<`
 * and `>` only where they could read as markup, so "A & B" stays as it is.
 */

type Mark = NonNullable<JSONContent['marks']>[number];
type OpeningMode = 'markdown' | 'html';

// a mark is rendered around this, then split at it into its opening and its closing
const PLACEHOLDER = '\uE000__DEVBRAIN_MARKDOWN_PLACEHOLDER__\uE001';

function sameAttrs(a?: Record<string, unknown>, b?: Record<string, unknown>): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(
    (key) => Object.prototype.hasOwnProperty.call(b, key) && Object.is(a[key], b[key]),
  );
}

function wrapInBlock(prefix: string, content: string): string {
  const output = content
    .split('\n')
    .flatMap((line) => [line, ''])
    .map((line) => `${prefix}${line}`)
    .join('\n');
  return output.slice(0, output.length - 1);
}

/**
 * Text is written with every `&`, `<` and `>` as an HTML entity, so "A & B" would be saved as
 * "A &amp; B". This keeps an entity only where the character could be read back as markup:
 * `&` before something that looks like an entity, `<` before a tag-like character or where a `>`
 * after it would make the text between them read as a tag's (`marked` reads no `**` in
 * `<0 a **b** >`; `closedLater` says a `>` follows this text in its block), and `>` at the start
 * of a line (where it could start a quote, written `\>`).
 */
export function relaxEntities(text: string, closedLater = false): string {
  return text
    .replace(/&amp;(?![A-Za-z][A-Za-z0-9]*;|#[0-9]+;|#[xX][0-9A-Fa-f]+;)/g, '&')
    .replace(/&lt;(?![A-Za-z/!?])/g, (entity, offset: number, whole: string) => {
      const rest = whole.slice(offset + entity.length);
      if (/^\s/.test(rest)) return '<';
      return rest.includes('&gt;') || closedLater ? entity : '<';
    })
    .replace(/(^|\n)&gt;/g, '$1\\>')
    .replace(/&gt;/g, '>');
}

/**
 * A line of a paragraph's text that starts with what markdown reads as a block, escaped so it
 * stays text: "## Not a heading", "- not a list", "1. not a list" are written
 * `\## Not a heading`, `\- not a list`, `1\. not a list`, and a line of only `-` or `=`, which
 * would be a rule or make a heading of the line above it, `\---`. (`>` is escaped by
 * relaxEntities, `*` and `_` always.)
 */
export function escapeLineStart(line: string): string {
  return line
    .replace(/^(#{1,6})(?=[ \t]|$)/, '\\$1')
    .replace(/^([-+])(?=[ \t]|$)/, '\\$1')
    .replace(/^(-{2,}|=+)(?=[ \t]*$)/, '\\$1')
    .replace(/^(\d{1,9})([.)])(?=[ \t]|$)/, '$1\\$2');
}

// `text` with each of its lines that starts a line of the paragraph escaped: all but the first,
// and the first too when `atLineStart`
function escapeLineStarts(text: string, atLineStart: boolean): string {
  return text
    .split('\n')
    .map((line, index) => (index > 0 || atLineStart ? escapeLineStart(line) : line))
    .join('\n');
}

// whether this text starts a line of its paragraph: its first child, or the one after a line
// break or after text that ends a line
function startsParagraphLine(node: JSONContent, parentNode: JSONContent): boolean {
  const index = (parentNode.content ?? []).indexOf(node);
  if (index <= 0) return index === 0;
  const previous = parentNode.content![index - 1];
  return (
    previous.type === 'hardBreak' || (previous.type === 'text' && /\n$/.test(previous.text ?? ''))
  );
}

// for each text node, the whole text of each mark's run through it
function markSpanTexts(nodes: JSONContent[]): Map<string, string>[] {
  const spans = nodes.map(() => new Map<string, string>());
  const open = new Map<string, { indexes: number[]; text: string }>();
  const flush = (type: string) => {
    const run = open.get(type);
    if (!run) return;
    run.indexes.forEach((index) => spans[index].set(type, run.text));
    open.delete(type);
  };
  nodes.forEach((node, index) => {
    if (node.type !== 'text') {
      [...open.keys()].forEach(flush);
      return;
    }
    const types = new Set((node.marks || []).map((mark) => mark.type));
    [...open.keys()].filter((type) => !types.has(type)).forEach(flush);
    types.forEach((type) => {
      const run = open.get(type) || { indexes: [], text: '' };
      run.indexes.push(index);
      run.text += node.text || '';
      open.set(type, run);
    });
  });
  [...open.keys()].forEach(flush);
  return spans;
}

// the marks on this node that the next one doesn't carry on, with the same attributes
function marksToClose(current: Map<string, Mark>, next: JSONContent | null): string[] {
  return [...current.entries()]
    .filter(
      ([type, mark]) =>
        !next ||
        !(next.marks || []).some(
          (other) => other.type === type && sameAttrs(other.attrs, mark.attrs),
        ),
    )
    .map(([type]) => type);
}

// the marks on this node not already open with the same attributes
function marksToOpen(active: Map<string, Mark>, current: Map<string, Mark>) {
  return [...current.entries()]
    .filter(([type, mark]) => {
      const open = active.get(type);
      return !open || !sameAttrs(open.attrs, mark.attrs);
    })
    .map(([type, mark]) => ({ type, mark }));
}

export class MarkdownSerializer {
  private readonly indentString = '  ';
  // each mark's place in the schema, which orders marks by priority: the first is outermost
  private readonly markRanks: Map<string, number>;

  constructor(
    private readonly rules: RuleTable,
    private readonly schema: Schema,
  ) {
    this.markRanks = new Map(Object.keys(schema.marks).map((name, index) => [name, index]));
  }

  /**
   * `doc` as markdown. In the editor's own spelling unless `withMarkup`: then each node and mark
   * is written with the marker it was read with (markup.ts).
   */
  serialize(
    doc: JSONContent | JSONContent[] | null | undefined,
    { withMarkup = false }: { withMarkup?: boolean } = {},
  ): string {
    if (!doc) return '';
    const spelled = withMarkup ? doc : Array.isArray(doc) ? doc.map(stripMarkup) : stripMarkup(doc);
    const written = Array.isArray(spelled) ? withListsApart(spelled) : withListsApart([spelled])[0];
    const result = this.renderNodes(written, Array.isArray(written) ? undefined : written);
    return this.isEmptyOutput(result) ? '' : result;
  }

  // nothing but the `&nbsp;` of empty paragraphs
  private isEmptyOutput(markdown: string): boolean {
    if (!markdown || markdown.trim() === '') return true;
    return (
      markdown
        .replace(/&nbsp;/g, '')
        .replace(/\u00A0/g, '')
        .trim() === ''
    );
  }

  private isCode(name: string): boolean {
    return Boolean(this.schema.nodes[name]?.spec.code || this.schema.marks[name]?.spec.code);
  }

  /** Text as markdown: as it is inside code, escaped everywhere else. */
  private encodeText(text: string, node: JSONContent, parentNode?: JSONContent): string {
    if (
      (parentNode?.type && this.isCode(parentNode.type)) ||
      (node.marks || []).some((mark) => this.isCode(mark.type))
    ) {
      return text;
    }
    const escaped = encodeEntities(text).replace(/([\\`*_[\]~])/g, '\\$1');
    const later = parentNode?.content?.slice(parentNode.content.indexOf(node) + 1) ?? [];
    const closedLater = later.some(
      (sibling) => sibling.type === 'text' && sibling.text?.includes('>'),
    );
    const relaxed = relaxEntities(escaped, closedLater);
    if (parentNode?.type !== 'paragraph') return relaxed;
    return escapeLineStarts(relaxed, startsParagraphLine(node, parentNode));
  }

  private renderNode(
    node: JSONContent,
    parentNode: JSONContent | undefined,
    index = 0,
    level = 0,
  ): string {
    if (node.type === 'text') return this.encodeText(node.text || '', node, parentNode);
    if (!node.type) return '';
    const rule = this.rules.rendererOf(node.type);
    if (!rule?.render) return '';
    const childLevel = rule.indentsContent ? level + 1 : level;
    const helpers: RenderHelpers = {
      renderChildren: (nodes, separator) => {
        if (!Array.isArray(nodes) && nodes.content) {
          return this.renderNodes(nodes.content, node, separator || '', index, childLevel);
        }
        return this.renderNodes(nodes, node, separator || '', index, childLevel);
      },
      renderChild: (child, childIndex) => this.renderNode(child, node, childIndex, childLevel),
      indent: (content) => this.indentString + content,
      wrapInBlock,
    };
    const previousNode =
      Array.isArray(parentNode?.content) && index > 0 ? parentNode.content[index - 1] : undefined;
    const context: RenderContext = {
      index,
      level,
      parentType: parentNode?.type,
      previousNode,
      meta: { parentAttrs: parentNode?.attrs },
    };
    return rule.render(node, helpers, context) || '';
  }

  private renderNodes(
    nodes: JSONContent | JSONContent[],
    parentNode: JSONContent | undefined,
    separator = '',
    index = 0,
    level = 0,
  ): string {
    if (!Array.isArray(nodes)) {
      if (!nodes.type) return '';
      return this.renderNode(nodes, parentNode, index, level);
    }
    return this.renderInline(nodes, parentNode, separator, level);
  }

  /** Nodes one after another, the marks on their text opened and closed where they change. */
  private renderInline(
    nodes: JSONContent[],
    parentNode: JSONContent | undefined,
    separator: string,
    level: number,
  ): string {
    const result: string[] = [];
    const active = new Map<string, Mark>();
    const reopenWithHtml = new Set<string>();
    const openingModes = new Map<string, OpeningMode>();
    const spans = markSpanTexts(nodes);

    nodes.forEach((node, i) => {
      const nextNode = i < nodes.length - 1 ? nodes[i + 1] : null;
      if (!node.type) return;

      if (node.type !== 'text') {
        // close the marks around an inline node, and reopen those it carries after it
        const nodeMarks = new Set((node.marks || []).map((mark) => mark.type));
        const reopen = new Map<string, Mark>();
        const reopenModes = new Map<string, OpeningMode>();
        active.forEach((mark, type) => {
          if (nodeMarks.has(type)) {
            reopen.set(type, mark);
            reopenModes.set(type, openingModes.get(type) ?? 'markdown');
          }
        });
        let before = '';
        [...active.keys()].reverse().forEach((type) => {
          const closing = this.markClosing(
            type,
            active.get(type)!,
            openingModes.get(type),
            spans[i - 1]?.get(type),
          );
          if (closing) before = closing + before;
        });
        active.clear();
        openingModes.clear();
        let content = this.renderNode(node, parentNode, i, level);
        // a link around an image is written around it: `[![alt](src)](href)`
        const link = (node.marks || []).find((mark) => mark.type === 'link');
        if (link && this.rules.rendererOf(node.type)?.linkable) {
          content = this.markOpening('link', link) + content + this.markClosing('link', link);
          reopen.delete('link');
        }
        let after = '';
        if (node.type !== 'hardBreak') {
          reopen.forEach((mark, type) => {
            const mode = reopenModes.get(type) ?? 'markdown';
            openingModes.set(type, mode);
            const opening = this.markOpening(type, mark, mode, spans[i + 1]?.get(type));
            if (opening) after += opening;
            active.set(type, mark);
          });
        }
        result.push(before + content + after);
        return;
      }

      let text = this.encodeText(node.text || '', node, parentNode);
      let current = new Map((node.marks || []).map((mark) => [mark.type, mark]));
      let opening = this.marksToOpenInOrder(active, current, nextNode);
      let closing = marksToClose(current, nextNode);

      // whitespace alone takes no mark that only it would open
      if (text.length > 0 && text.trim().length === 0 && current.size > 0) {
        const transient = new Set(closing.filter((type) => !active.has(type)));
        if (transient.size > 0) {
          current = new Map([...current].filter(([type]) => !transient.has(type)));
          opening = this.marksToOpenInOrder(active, current, nextNode);
          closing = marksToClose(current, nextNode);
        }
      }

      const activeClosingHere = closing.filter((type) => active.has(type));
      const crossesBoundary = activeClosingHere.length > 0 && opening.length > 0;

      let middleTrailingWhitespace = '';
      if (closing.length > 0 && !crossesBoundary) {
        const match = text.match(/(\s+)$/);
        if (match) {
          middleTrailingWhitespace = match[1];
          text = text.slice(0, -middleTrailingWhitespace.length);
        }
      }

      if (!crossesBoundary) {
        // the mark opened last is closed first, whatever order the node lists its marks in
        [...active.keys()]
          .reverse()
          .filter((type) => closing.includes(type))
          .forEach((type) => {
            const close = this.markClosing(
              type,
              current.get(type)!,
              openingModes.get(type),
              spans[i]?.get(type),
            );
            if (close) text += close;
            active.delete(type);
            openingModes.delete(type);
          });
      }

      let leadingWhitespace = '';
      if (opening.length > 0) {
        const match = text.match(/^(\s+)/);
        if (match) {
          leadingWhitespace = match[1];
          text = text.slice(leadingWhitespace.length);
        }
      }

      opening.forEach(({ type, mark }) => {
        const mode: OpeningMode = reopenWithHtml.has(type) ? 'html' : 'markdown';
        const open = this.markOpening(type, mark, mode, spans[i]?.get(type));
        if (open) text = open + text;
        openingModes.set(type, mode);
        reopenWithHtml.delete(type);
      });
      if (!crossesBoundary) {
        opening
          .slice()
          .reverse()
          .forEach(({ type, mark }) => active.set(type, mark));
      }
      text = leadingWhitespace + text;

      let closeAtEnd: string[];
      if (crossesBoundary) {
        const nextTypes = new Set((nextNode?.marks || []).map((mark) => mark.type));
        opening.forEach(({ type }) => {
          if (nextTypes.has(type) && this.rules.rendererOf(type)?.htmlReopen)
            reopenWithHtml.add(type);
        });
        const activeKeys = [...active.keys()];
        const lastOpenedFirst = activeClosingHere
          .slice()
          .sort((a, b) => activeKeys.indexOf(b) - activeKeys.indexOf(a));
        closeAtEnd = [...opening.map(({ type }) => type), ...lastOpenedFirst];
      } else {
        closeAtEnd = this.marksToCloseAtEnd(active, current, nextNode);
      }

      let trailingWhitespace = '';
      if (closeAtEnd.length > 0) {
        const match = text.match(/(\s+)$/);
        if (match) {
          trailingWhitespace = match[1];
          text = text.slice(0, -trailingWhitespace.length);
        }
      }
      closeAtEnd.forEach((type) => {
        const mark = active.get(type) ?? current.get(type)!;
        const close = this.markClosing(type, mark, openingModes.get(type), spans[i]?.get(type));
        if (close) text += close;
        active.delete(type);
        openingModes.delete(type);
      });
      result.push(text + trailingWhitespace + middleTrailingWhitespace);
    });

    if (separator === '') {
      // a `!` straight before a link would make it an image
      let previous = -1;
      result.forEach((piece, i) => {
        if (!piece) return;
        if (previous >= 0 && piece.startsWith('[')) {
          const trailing = /(\\*)!$/.exec(result[previous]);
          if (trailing && trailing[1].length % 2 === 0) {
            result[previous] = `${result[previous].slice(0, -1)}\\!`;
          }
        }
        previous = i;
      });
    }
    return result.join(separator);
  }

  private marksToCloseAtEnd(
    active: Map<string, Mark>,
    current: Map<string, Mark>,
    next: JSONContent | null,
  ): string[] {
    const isLast = !next;
    const nextHasNoMarks = next && (!next.marks || next.marks.length === 0);
    const nextHasOtherMarks =
      next &&
      next.marks &&
      !this.sameMarkSets(current, new Map(next.marks.map((mark) => [mark.type, mark])));
    const close: string[] = [];
    if (isLast || nextHasNoMarks || nextHasOtherMarks) {
      if (next && next.marks) {
        [...active.entries()].reverse().forEach(([type, mark]) => {
          if (
            !next.marks!.some((other) => other.type === type && sameAttrs(other.attrs, mark.attrs))
          ) {
            close.push(type);
          }
        });
      } else if (isLast || nextHasNoMarks) {
        close.push(...[...active.keys()].reverse());
      }
    }
    return close;
  }

  private sameMarkSets(a: Map<string, Mark>, b: Map<string, Mark>): boolean {
    if (a.size !== b.size) return false;
    return [...a.entries()].every(([type, mark]) => {
      const other = b.get(type);
      return other && sameAttrs(mark.attrs, other.attrs);
    });
  }

  /**
   * The order marks open in on this text node, innermost first: those that end here inside those
   * that go on into the next node, and within each, the higher ranked (higher priority) outside.
   */
  private marksToOpenInOrder(
    active: Map<string, Mark>,
    current: Map<string, Mark>,
    next: JSONContent | null,
  ) {
    const opening = marksToOpen(active, current);
    if (opening.length <= 1) return opening;
    const nextMarks = next?.marks || [];
    const goesOn = (type: string, attrs?: Record<string, unknown>) =>
      nextMarks.some((mark) => mark.type === type && sameAttrs(mark.attrs, attrs));
    const rank = (type: string) => this.markRanks.get(type) ?? Number.MAX_SAFE_INTEGER;
    const innerFirst = (a: { type: string }, b: { type: string }) => {
      const difference = rank(b.type) - rank(a.type);
      return difference !== 0 ? difference : a.type.localeCompare(b.type);
    };
    const ending = opening.filter(({ type, mark }) => !goesOn(type, mark.attrs)).sort(innerFirst);
    const continuing = opening
      .filter(({ type, mark }) => goesOn(type, mark.attrs))
      .sort(innerFirst);
    return [...ending, ...continuing];
  }

  // the mark written around the placeholder; markText is the whole text of its run
  private renderMark(type: string, mark: Mark, markText?: string): string {
    const rule = this.rules.rendererOf(type);
    if (!rule?.render) return '';
    const synthetic: JSONContent = {
      type,
      attrs: mark.attrs || {},
      content: [{ type: 'text', text: PLACEHOLDER }],
    };
    return rule.render(
      synthetic,
      {
        renderChildren: () => PLACEHOLDER,
        renderChild: () => PLACEHOLDER,
        indent: (content) => content,
        wrapInBlock: (prefix, content) => prefix + content,
      },
      { index: 0, level: 0, parentType: 'text', meta: { markText } },
    );
  }

  private markOpening(type: string, mark: Mark, mode: OpeningMode = 'markdown', markText?: string) {
    if (mode === 'html') return this.rules.rendererOf(type)?.htmlReopen?.open || '';
    const rendered = this.renderMark(type, mark, markText);
    const at = rendered.indexOf(PLACEHOLDER);
    return at >= 0 ? rendered.substring(0, at) : '';
  }

  private markClosing(type: string, mark: Mark, mode: OpeningMode = 'markdown', markText?: string) {
    if (mode === 'html') return this.rules.rendererOf(type)?.htmlReopen?.close || '';
    const rendered = this.renderMark(type, mark, markText);
    const at = rendered.indexOf(PLACEHOLDER);
    return at >= 0 ? rendered.substring(at + PLACEHOLDER.length) : '';
  }
}
