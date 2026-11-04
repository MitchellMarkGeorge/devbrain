import { mergeAttributes, Node } from '@tiptap/core';
import type { CalloutKind } from '../../components/ui/Callout';

/**
 * A callout, written as GitHub's alert syntax, which GitHub draws as an alert and other markdown
 * apps as a quote:
 *
 *   > [!WARNING]
 *   > The migration rewrites every row; run it off-hours.
 *
 * The marker is alone on the first line, in capitals; the body is every `>` line after it, as
 * markdown. The design system's Callout draws it (CalloutView in the editor).
 */

const MARKER = /^ {0,3}> ?\[!(note|tip|important|warning|caution)\][ \t]*(?:\n|$)/i;
const QUOTE_LINE = /^ {0,3}>/;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      // wraps the current block in a callout
      setCallout: (kind?: CalloutKind) => ReturnType;
      setCalloutKind: (kind: CalloutKind) => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: 'note',
        parseHTML: (element) => element.getAttribute('data-callout'),
        renderHTML: (attrs) => ({ 'data-callout': attrs.kind }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]', contentElement: '[data-callout-body]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes), ['div', { 'data-callout-body': '' }, 0]];
  },

  markdownTokenName: 'callout',

  markdownTokenizer: {
    name: 'callout',
    level: 'block',
    start: (src) => src.search(/^ {0,3}> ?\[!/im),
    tokenize(src, _tokens, lexer) {
      const marker = MARKER.exec(src);
      if (!marker) return undefined;
      const lines = src.slice(marker[0].length).split('\n');
      const body: string[] = [];
      for (const line of lines) {
        if (!QUOTE_LINE.test(line)) break;
        body.push(line.replace(/^ {0,3}> ?/, ''));
      }
      const consumed = [marker[0].replace(/\n$/, ''), ...lines.slice(0, body.length)].join('\n');
      const rest = src.slice(consumed.length);
      return {
        type: 'callout',
        raw: consumed + (rest.startsWith('\n') ? '\n' : ''),
        kind: marker[1].toLowerCase(),
        tokens: lexer.blockTokens(body.join('\n')),
      };
    },
  },

  parseMarkdown(token, helpers) {
    const body = helpers.parseChildren(token.tokens ?? []);
    return {
      type: 'callout',
      attrs: { kind: token.kind },
      content: body.length ? body : [{ type: 'paragraph' }],
    };
  },

  renderMarkdown(node, helpers) {
    const kind = String(node.attrs?.kind ?? 'note').toUpperCase();
    const body = helpers.renderChildren(node.content ?? [], '\n\n');
    const lines = body.split('\n').map((line) => (line ? `> ${line}` : '>'));
    return [`> [!${kind}]`, ...lines].join('\n');
  },

  addCommands() {
    return {
      setCallout:
        (kind = 'note') =>
        ({ commands }) =>
          commands.wrapIn(this.name, { kind }),
      setCalloutKind:
        (kind) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { kind }),
    };
  },
});
