import { mergeAttributes, Node } from '@tiptap/core';
import { EDITOR_ENTITY_TYPES, type EditorEntityType } from '../types';

/**
 * A link to a task, project, note or event, drawn as an EntityPill.
 *
 * In markdown it is an ordinary link with DevBrain's own scheme, `[Fix login](devbrain://task/tsk_…)`,
 * so a note stays readable in any other markdown app. The label is the title when the link was
 * made; the pill shows the current title when the host can resolve it, and the label otherwise.
 * These links are resolved in the app and never reach openUrl (docs/security/untrusted-content.md).
 */

export const ENTITY_URL_PREFIX = 'devbrain://';

// [label](devbrain://type/id), the label without brackets or line breaks
const ENTITY_LINK =
  /^\[((?:\\.|[^\\\]\n])*)\]\(devbrain:\/\/(task|project|note|event)\/([A-Za-z0-9_-]+)\)/;
const ENTITY_LINK_START = /\[(?:\\.|[^\\\]\n])*\]\(devbrain:\/\//;

export function entityUrl(type: EditorEntityType, id: string): string {
  return `${ENTITY_URL_PREFIX}${type}/${id}`;
}

function escapeLabel(label: string): string {
  return label.replace(/[\\[\]]/g, (char) => `\\${char}`);
}

function unescapeLabel(label: string): string {
  return label.replace(/\\(.)/g, '$1');
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    entityLink: {
      insertEntityLink: (attrs: {
        type: EditorEntityType;
        id: string;
        label: string;
      }) => ReturnType;
    };
  }
}

export const EntityLink = Node.create({
  name: 'entityLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      type: { default: 'task' },
      id: { default: '' },
      label: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-entity-type]',
        getAttrs: (element) => {
          const type = element.getAttribute('data-entity-type') as EditorEntityType;
          if (!EDITOR_ENTITY_TYPES.includes(type)) return false;
          return {
            type,
            id: element.getAttribute('data-entity-id') ?? '',
            label: element.textContent ?? '',
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-entity-type': node.attrs.type,
        'data-entity-id': node.attrs.id,
      }),
      node.attrs.label,
    ];
  },

  renderText({ node }) {
    return node.attrs.label;
  },

  markdownTokenName: 'entityLink',

  markdownTokenizer: {
    name: 'entityLink',
    level: 'inline',
    start: (src) => src.search(ENTITY_LINK_START),
    tokenize(src) {
      const match = ENTITY_LINK.exec(src);
      if (!match) return undefined;
      return {
        type: 'entityLink',
        raw: match[0],
        label: unescapeLabel(match[1]),
        entityType: match[2],
        id: match[3],
      };
    },
  },

  parseMarkdown(token) {
    return {
      type: 'entityLink',
      attrs: { type: token.entityType, id: token.id, label: token.label },
    };
  },

  renderMarkdown(node) {
    const { type, id, label } = node.attrs ?? {};
    return `[${escapeLabel(label ?? '')}](${entityUrl(type, id)})`;
  },

  addCommands() {
    return {
      insertEntityLink:
        (attrs) =>
        ({ chain }) =>
          chain()
            .insertContent([
              { type: this.name, attrs },
              { type: 'text', text: ' ' },
            ])
            .run(),
    };
  },
});
