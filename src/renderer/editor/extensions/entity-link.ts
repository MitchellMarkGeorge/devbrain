import { mergeAttributes, Node } from '@tiptap/core';
import { entityLinkTokenizer, entityUrl, escapeLinkLabel } from '@common/entity-links';
import type { MarkdownRule } from '../markdown/types';
import { EDITOR_ENTITY_TYPES, type EditorEntityType } from '../types';

/**
 * A link to a task, project, note or event, drawn as an EntityPill.
 *
 * In markdown it is an ordinary link with DevBrain's own scheme, `[Fix login](devbrain://task/tsk_…)`,
 * so a note stays readable in any other markdown app. The label is the title when the link was
 * made; the pill shows the current title when the host can resolve it, and the label otherwise.
 * These links are resolved in the app and never reach openUrl (docs/security/untrusted-content.md).
 */

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

// read and written in markdown (markdown/rules.ts)
export const entityLinkMarkdown: MarkdownRule = {
  name: 'entityLink',

  // the tokenizer core reads mentions with too (@common/entity-links)
  tokenizer: entityLinkTokenizer,

  parse(token) {
    return {
      type: 'entityLink',
      attrs: { type: token.entityType, id: token.id, label: token.label },
    };
  },

  render(node) {
    const { type, id, label } = node.attrs ?? {};
    return `[${escapeLinkLabel(label ?? '')}](${entityUrl(type, id)})`;
  },
};
