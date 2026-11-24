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

// a code fence's first characters, after its indentation (up to three spaces)
const FENCE_START = /^( {0,3})(`{3,}|~{3,})/;

// a code block's fence when it isn't three backticks (indented code has no marker: rewritten, it
// is fenced)
function codeBlockMarkup(token: { raw: string }): string | null {
  const fence = FENCE_START.exec(token.raw)?.[2];
  return fence && fence !== '```' ? fence : null;
}

// The code of a fenced block without its fence's indentation: each line loses as many spaces as
// the fence has before it, as GitHub reads it. `marked` does this for a backtick fence and not
// for a `~~~` one.
function fencedCode(raw: string, text: string): string {
  const [, indent, fence] = FENCE_START.exec(raw) ?? [];
  if (!indent || !fence?.startsWith('~')) return text;
  const indented = new RegExp(`^ {1,${indent.length}}`);
  return text
    .split('\n')
    .map((line) => line.replace(indented, ''))
    .join('\n');
}

// whether a line of `code` would close a block fenced with `fence`
function closesFence(code: string, fence: string): boolean {
  const closing = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`);
  return code.split('\n').some((line) => closing.test(line));
}

// three backticks, or more where a line of `code` starts with as many: it would close the block
function backtickFence(code: string): string {
  const runs = code.match(/^ {0,3}`{3,}/gm) ?? [];
  const longest = Math.max(2, ...runs.map((run) => run.trimStart().length));
  return '`'.repeat(longest + 1);
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
      const content = helpers.parseInline(tokens);
      // a line end the paragraph ends with is no part of it (a link closed on the next line)
      const last = content.at(-1);
      if (last?.type === 'text' && /\n[ \t\n]*$/.test(last.text ?? '')) {
        const text = (last.text ?? '').replace(/[ \t]*\n[ \t\n]*$/, '');
        if (text) content[content.length - 1] = { ...last, text };
        else content.pop();
      }
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
      // a line break that ends the paragraph reads as nothing, and so do the spaces it ends
      // with: neither is written
      return h
        .renderChildren(content)
        .replace(/(?: {2}|\\|<br\s*\/?>)\n$/i, '')
        .replace(/[ \t\n]+$/, '');
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
      const markup = markupOf(node.attrs);
      const lines = h.renderChildren(node.content);
      // a `#` heading is one line: the line ends in its text (an underlined heading can have
      // several lines) are the spaces they read as
      const title = lines.replace(/[^\S\n]*\n[^\S\n]*/g, ' ');
      const underline = markup?.startsWith(SETEXT) ? markup.slice(SETEXT.length) : null;
      // an underline says its level (`=` is 1, `-` is 2), and is under lines of text, none blank
      const underlined = /\S/.test(lines) && lines.split('\n').every((line) => line.trim() !== '');
      if (underline && (underline[0] === '=' ? 1 : 2) === level && underlined) {
        return `${lines}\n${underline}`;
      }
      const closing = markup && /^#+$/.test(markup) && title.trim() !== '' ? ` ${markup}` : '';
      // `#`s that end the title would read as the heading's closing ones
      const text = title.replace(/(^|[ \t])(#+)$/, '$1\\$2');
      return `${'#'.repeat(level)} ${text}${closing}`;
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
      // fenced (the fence itself may be indented up to three spaces: past its list item's text,
      // say), or indented four spaces
      if (!FENCE_START.test(token.raw || '') && token.codeBlockStyle !== 'indented') return [];
      const text = fencedCode(token.raw || '', token.text || '');
      return helpers.createNode(
        'codeBlock',
        withMarkup({ language: token.lang || null }, codeBlockMarkup(token)),
        text ? [helpers.createTextNode(text)] : [],
      );
    },
    render: (node, h) => {
      const language = node.attrs?.language || '';
      const markup = markupOf(node.attrs);
      if (!node.content) return `\`\`\`${language}\n\n\`\`\``;
      const code = h.renderChildren(node.content);
      // its own fence (`~~~`, or a longer one), unless a line of the code would close it; or
      // backticks, one more than the longest run a line of the code starts with
      const fence =
        markup && FENCE.test(markup) && !closesFence(code, markup) && fenceFits(markup, language)
          ? markup
          : backtickFence(code);
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
    render: (node, _h, context) => {
      const markup = markupOf(node.attrs);
      const tag = markup && /^<br\s*\/?>$/i.test(markup) ? markup : null;
      // a break with nothing on its line before it (the paragraph's first, or one straight after
      // another) is a tag: spaces or a backslash alone on a line would end the paragraph
      const previous = context.previousNode;
      if (!previous || previous.type === 'hardBreak') return `${tag ?? '<br>'}\n`;
      if (markup === '\\') return '\\\n';
      return tag ?? '  \n';
    },
  },
};
