import { commands, Extension } from '@tiptap/core';
import { MarkdownCodec } from './codec';

declare module '@tiptap/core' {
  interface Editor {
    /** The document as markdown (DocumentMarkdown). */
    getMarkdown: () => string;
  }
  interface EditorOptions {
    /** `markdown` reads a string `content` as markdown (DocumentMarkdown). */
    contentType?: 'json' | 'html' | 'markdown';
  }
  interface SetContentOptions {
    /** `markdown` reads a string `content` as markdown (DocumentMarkdown). */
    contentType?: 'json' | 'html' | 'markdown';
  }
  interface Storage {
    documentMarkdown: DocumentMarkdownStorage;
  }
}

export interface DocumentMarkdownStorage {
  // set as the editor is made, before its document is
  codec: MarkdownCodec;
}

/**
 * The editor's markdown, with DevBrain's markdown layer (codec.ts): `editor.getMarkdown()`, the
 * codec in `editor.storage.documentMarkdown` for anything else to read or write markdown with
 * (the clipboard), and `contentType: 'markdown'`, which reads a string as markdown: the editor's
 * first `content`, and `setContent`'s. Either way the document is loaded as the codec's JSON, through
 * TipTap's own `setContent`.
 */
export const DocumentMarkdown = Extension.create<Record<string, never>, DocumentMarkdownStorage>({
  name: 'documentMarkdown',

  addStorage() {
    return { codec: null as unknown as MarkdownCodec };
  },

  addCommands() {
    return {
      setContent: (content, options) => (props) => {
        const markdown = options?.contentType === 'markdown' && typeof content === 'string';
        const json = markdown ? this.storage.codec.parseDocument(content) : content;
        return commands.setContent(json, options)(props);
      },
    };
  },

  onBeforeCreate() {
    const editor = this.editor;
    const codec = new MarkdownCodec(editor.schema);
    this.storage.codec = codec;
    editor.getMarkdown = () => codec.serialize(editor.getJSON());
    // the document is made from the options after this hook
    const { content, contentType } = editor.options;
    if (contentType === 'markdown' && typeof content === 'string') {
      editor.setOptions({ content: codec.parseDocument(content) });
    }
  },
});
