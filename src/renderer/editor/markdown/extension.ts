import { commands, Extension, type JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { MarkdownCodec } from './codec';
import { stripMarkup } from './markup';
import type { MarkdownSource } from './source';

declare module '@tiptap/core' {
  interface Editor {
    /** The whole document as markdown, in the editor's own spelling (DocumentMarkdown). */
    getMarkdown: () => string;
    /**
     * The markdown to store for the document (DocumentMarkdown): the text it was loaded from
     * exactly while it is still what was loaded, and otherwise that text with only the blocks
     * that changed written anew (`codec.writeKeeping`).
     */
    saveMarkdown: () => string;
    /**
     * Markdown from outside the note as content to put in it (DocumentMarkdown): the document
     * it reads as, without the markers it was written with (`*` bullets, `__bold__`), which are
     * not the note's own. A paste reads with it.
     */
    markdownToContent: (markdown: string) => JSONContent;
    /**
     * A piece of content (a document, or some of its nodes) as markdown in the editor's own
     * spelling (DocumentMarkdown). A copy writes with it.
     */
    contentToMarkdown: (content: JSONContent | JSONContent[]) => string;
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
  // the text the content was last read from, when it was loaded as markdown
  loaded: LoadedMarkdown | null;
}

interface LoadedMarkdown {
  text: string;
  // its source map; null when it has none, and a save writes the whole document
  source: MarkdownSource | null;
  // the document it was loaded as
  doc: ProseMirrorNode;
}

/**
 * The editor's markdown, with DevBrain's markdown layer (codec.ts), as methods on the editor:
 *
 * - `getMarkdown()`: the whole document in the editor's own spelling;
 * - `saveMarkdown()`: the markdown to store, keeping the text the document was loaded from;
 * - `markdownToContent(text)` and `contentToMarkdown(content)`: markdown from outside as
 *   content to insert, and content as markdown to hand out (the clipboard's paste and copy).
 *
 * And `contentType: 'markdown'`, which reads a string as markdown: the editor's first `content`,
 * and `setContent`'s. Either way the document is loaded as the codec's JSON, through TipTap's own
 * `setContent`, and the text is remembered with its source map, for `saveMarkdown()`.
 *
 * The codec itself is in `editor.storage.documentMarkdown`, for what needs more than these (a
 * text's source map).
 */
export const DocumentMarkdown = Extension.create<Record<string, never>, DocumentMarkdownStorage>({
  name: 'documentMarkdown',

  addStorage() {
    return {
      codec: null as unknown as MarkdownCodec,
      loaded: null,
    };
  },

  addCommands() {
    return {
      setContent: (content, options) => (props) => {
        if (options?.contentType !== 'markdown' || typeof content !== 'string') {
          const set = commands.setContent(content, options)(props);
          // another document: nothing of the text loaded before is kept
          if (set && props.dispatch) this.storage.loaded = null;
          return set;
        }
        const { doc, source } = this.storage.codec.read(content);
        const set = commands.setContent(doc, options)(props);
        // the document as the editor holds it, which is not always the JSON's own (an image
        // alone at the top level is put in a paragraph)
        if (set && props.dispatch)
          this.storage.loaded = { text: content, source, doc: props.tr.doc };
        return set;
      },
    };
  },

  onBeforeCreate() {
    const editor = this.editor;
    const storage = this.storage;
    const codec = new MarkdownCodec(editor.schema);
    storage.codec = codec;
    editor.getMarkdown = () => codec.serialize(editor.getJSON());
    editor.saveMarkdown = () => {
      const { loaded } = storage;
      if (!loaded) return editor.getMarkdown();
      // as loaded (opened, or undone back to it): the text itself, whether or not it has a map
      if (editor.state.doc.eq(loaded.doc)) return loaded.text;
      return codec.serializeKeeping(editor.state.doc, loaded.source);
    };
    editor.markdownToContent = (markdown) => stripMarkup(codec.parse(markdown));
    editor.contentToMarkdown = (content) =>
      codec.serialize(Array.isArray(content) ? { type: 'doc', content } : content);
    // the document is made from the options after this hook
    const { content, contentType } = editor.options;
    if (contentType === 'markdown' && typeof content === 'string') {
      const { doc, source } = codec.read(content);
      editor.setOptions({ content: doc });
      storage.loaded = { text: content, source, doc: editor.schema.nodeFromJSON(doc) };
    }
  },
});
