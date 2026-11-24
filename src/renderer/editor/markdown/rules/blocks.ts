import { markupOf, withMarkup } from '../markup';
import type { MarkdownRule } from '../types';

/** The document, paragraphs, headings, quotes, rules, code blocks, line breaks and text. */

// an empty paragraph after another empty one; one alone is written as nothing, a blank line
const EMPTY_PARAGRAPH = '&nbsp;';
const NBSP = '\u00A0';

// ---- the markers a block keeps in its `markup` attribute (markup.ts)

// a heading written as a line of text over an underline: `setext:` and the underline
const SETEXT = 'setext:';
const FENCE = /^(?:`{3,}|~{3,})$/;
const RULE_LINE = /^(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;

// an underlined heading's underline, or the `#`s an ATX heading was closed with
function headingMarkup(raw: string): string | null {
  const text = raw.trimEnd();
  const underline = /\n {0,3}(=+|-+)$/.exec(text)?.[1];
  if (underline) return SETEXT + underline;
  return /^ {0,3}#{1,6}[ \t]/.test(text) ? (/[ \t](#+)$/.exec(text)?.[1] ?? null) : null;
}

// a code block's fence when it isn't three backticks (indented code has no marker: rewritten, it
// is fenced)
function codeBlockMarkup(token: { raw: string }): string | null {
  const fence = /^(`{3,}|~{3,})/.exec(token.raw)?.[1];
  return fence && fence !== '```' ? fence : null;
}

// whether a line of `code` would close a block fenced with `fence`
function closesFence(code: string, fence: string): boolean {
  const closing = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`);
  return code.split('\n').some((line) => closing.test(line));
}

// a backtick fence can't have a backtick in its info string
function fenceFits(fence: string, language: string): boolean {
  return fence[0] !== '`' || !language.includes('`');
}

export const blockRules: Record<string, MarkdownRule> = {
  doc: {
    name: 'doc',
    render: (node, h) => (node.content ? h.renderChildren(node.content, '\n\n') : ''),
  },

  paragraph: {
    name: 'paragraph',
    parse: (token, helpers) => {
      const tokens = token.tokens || [];
      // a paragraph that is only an image reads as the image
      if (tokens.length === 1 && tokens[0].type === 'image') {
        return helpers.parseChildren([tokens[0]]);
      }
      const content = helpers.parseInline(tokens);
      const only = tokens.length === 1 ? tokens[0] : null;
      if (
        only?.type === 'text' &&
        [only.raw, only.text].some((text) => text === EMPTY_PARAGRAPH || text === NBSP) &&
        content.length === 1 &&
        content[0].type === 'text' &&
        (content[0].text === EMPTY_PARAGRAPH || content[0].text === NBSP)
      ) {
        return helpers.createNode('paragraph', undefined, []);
      }
      return helpers.createNode('paragraph', undefined, content);
    },
    render: (node, h, context) => {
      const content = Array.isArray(node.content) ? node.content : [];
      if (content.length === 0) {
        const previous = context.previousNode;
        const previousEmpty = !Array.isArray(previous?.content) || previous.content.length === 0;
        return previous?.type === 'paragraph' && previousEmpty ? EMPTY_PARAGRAPH : '';
      }
      return h.renderChildren(content);
    },
  },

  text: {
    name: 'text',
    parse: (token) => ({ type: 'text', text: token.text || '' }),
    render: (node) => node.text || '',
  },

  heading: {
    name: 'heading',
    parse: (token, helpers) =>
      helpers.createNode(
        'heading',
        withMarkup({ level: token.depth || 1 }, headingMarkup(token.raw)),
        helpers.parseInline(token.tokens || []),
      ),
    render: (node, h) => {
      const level = node.attrs?.level ? parseInt(node.attrs.level, 10) : 1;
      if (!node.content) return '';
      const title = h.renderChildren(node.content);
      const markup = markupOf(node.attrs);
      const underline = markup?.startsWith(SETEXT) ? markup.slice(SETEXT.length) : null;
      // an underline says its level (`=` is 1, `-` is 2), and is under one line of text
      if (underline && (underline[0] === '=' ? 1 : 2) === level && /^[^\n]*\S[^\n]*$/.test(title)) {
        return `${title}\n${underline}`;
      }
      const closing = markup && /^#+$/.test(markup) && title.trim() !== '' ? ` ${markup}` : '';
      return `${'#'.repeat(level)} ${title}${closing}`;
    },
  },

  blockquote: {
    name: 'blockquote',
    parse: (token, helpers) =>
      helpers.createNode('blockquote', undefined, helpers.parseBlockChildren(token.tokens || [])),
    render: (node, h) => {
      if (!node.content) return '';
      return node.content
        .map((child, index) =>
          h
            .renderChild(child, index)
            .split('\n')
            .map((line) => (line.trim() === '' ? '>' : `> ${line}`))
            .join('\n'),
        )
        .join('\n>\n');
    },
  },

  horizontalRule: {
    name: 'horizontalRule',
    token: 'hr',
    parse: (token, helpers) => {
      const line = token.raw.trim();
      return helpers.createNode(
        'horizontalRule',
        withMarkup(undefined, line === '---' ? null : line),
      );
    },
    // the line as it was written (`***`, `___`, `- - -`), where it is still a rule's
    render: (node) => {
      const markup = markupOf(node.attrs);
      return markup && RULE_LINE.test(markup) ? markup : '---';
    },
  },

  codeBlock: {
    name: 'codeBlock',
    token: 'code',
    parse: (token, helpers) => {
      // fenced, or indented four spaces
      if (
        token.raw?.startsWith('```') === false &&
        token.raw?.startsWith('~~~') === false &&
        token.codeBlockStyle !== 'indented'
      ) {
        return [];
      }
      return helpers.createNode(
        'codeBlock',
        withMarkup({ language: token.lang || null }, codeBlockMarkup(token)),
        token.text ? [helpers.createTextNode(token.text)] : [],
      );
    },
    render: (node, h) => {
      const language = node.attrs?.language || '';
      const markup = markupOf(node.attrs);
      if (!node.content) return `\`\`\`${language}\n\n\`\`\``;
      const code = h.renderChildren(node.content);
      // its own fence (`~~~`, or a longer one), unless a line of the code would close it
      const fence =
        markup && FENCE.test(markup) && !closesFence(code, markup) && fenceFits(markup, language)
          ? markup
          : '```';
      return [`${fence}${language}`, code, fence].join('\n');
    },
  },

  hardBreak: {
    name: 'hardBreak',
    token: 'br',
    // `marked`'s break is two spaces or a backslash before the line end; `<br>` is html-elements.ts's
    parse: (token) => {
      const markup = token.raw.startsWith('\\') ? '\\' : /^<br/i.test(token.raw) ? token.raw : null;
      return markup ? { type: 'hardBreak', attrs: { markup } } : { type: 'hardBreak' };
    },
    render: (node) => {
      const markup = markupOf(node.attrs);
      if (markup === '\\') return '\\\n';
      return markup && /^<br\s*\/?>$/i.test(markup) ? markup : '  \n';
    },
  },
};
