import type { MarkdownRule } from '../types';

/** The document, paragraphs, headings, quotes, rules, code blocks, line breaks and text. */

// an empty paragraph after another empty one; one alone is written as nothing, a blank line
const EMPTY_PARAGRAPH = '&nbsp;';
const NBSP = '\u00A0';

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
        { level: token.depth || 1 },
        helpers.parseInline(token.tokens || []),
      ),
    render: (node, h) => {
      const level = node.attrs?.level ? parseInt(node.attrs.level, 10) : 1;
      if (!node.content) return '';
      return `${'#'.repeat(level)} ${h.renderChildren(node.content)}`;
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
    parse: (_token, helpers) => helpers.createNode('horizontalRule'),
    render: () => '---',
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
        { language: token.lang || null },
        token.text ? [helpers.createTextNode(token.text)] : [],
      );
    },
    render: (node, h) => {
      const language = node.attrs?.language || '';
      if (!node.content) return `\`\`\`${language}\n\n\`\`\``;
      return [`\`\`\`${language}`, h.renderChildren(node.content), '```'].join('\n');
    },
  },

  hardBreak: {
    name: 'hardBreak',
    token: 'br',
    parse: () => ({ type: 'hardBreak' }),
    render: () => '  \n',
  },
};
