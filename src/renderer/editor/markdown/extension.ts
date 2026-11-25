import { commands, Extension, type JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { MarkdownCodec } from './codec';
import type { WholeReason } from './keeping';
import { stripMarkup } from './markup';
import type { MarkdownSource, UnmappedReason } from './source';

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
  // what `saveMarkdown()` gave last
  lastSaved: string | null;
  // what is wrong with the text the editor holds, if anything; `onProblem` hears it change
  problem: MarkdownProblem | null;
  onProblem: ((problem: MarkdownProblem | null) => void) | null;
  // How many saves wrote the whole document in the editor's spelling, by reason (keeping.ts's
  // `WholeReason`; `no-source:` and why the text has no map). Reasons only, never text: notes
  // are private.
  wholeWrites: Record<string, number>;
}

/**
 * - `unreadable`: reading the loaded text threw. It is shown as plain text, and the editor
 *   should not be edited: `saveMarkdown()` gives the text as loaded.
 * - `unsaveable`: writing the document threw. `saveMarkdown()` gives what it gave last, so the
 *   stored text stays the last good one.
 */
export type MarkdownProblem = 'unreadable' | 'unsaveable';

interface LoadedMarkdown {
  text: string;
  // its source map; null when it has none (`reason` says why), and a save writes the whole
  // document
  source: MarkdownSource | null;
  reason: UnmappedReason | null;
  // the document it was loaded as
  doc: ProseMirrorNode;
}

function setProblem(storage: DocumentMarkdownStorage, problem: MarkdownProblem | null): void {
  if (storage.problem === problem) return;
  storage.problem = problem;
  storage.onProblem?.(problem);
}

// A save that kept none of the loaded text and wrote the editor's spelling, counted by its
// reason, and logged in development the first time each reason comes up for an editor. (A note
// whose every block changed, `nothing-kept`, is no fallback: it keeps its markers.)
function countWholeWrite(
  storage: DocumentMarkdownStorage,
  whole: WholeReason | null,
  unmapped: UnmappedReason | null,
): void {
  if (!whole || whole === 'nothing-kept') return;
  const reason = whole === 'no-source' && unmapped ? `no-source:${unmapped}` : whole;
  storage.wholeWrites[reason] = (storage.wholeWrites[reason] ?? 0) + 1;
  const first = storage.wholeWrites[reason] === 1;
  if (first && import.meta.env.DEV && import.meta.env.MODE !== 'test') {
    console.info(`[markdown] a save wrote the whole document: ${reason}`);
  }
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
      lastSaved: null,
      problem: null,
      onProblem: null,
      wholeWrites: {},
    };
  },

  addCommands() {
    return {
      setContent: (content, options) => (props) => {
        if (options?.contentType !== 'markdown' || typeof content !== 'string') {
          const set = commands.setContent(content, options)(props);
          // another document: nothing of the text loaded before is kept
          if (set && props.dispatch) {
            this.storage.loaded = null;
            setProblem(this.storage, null);
          }
          return set;
        }
        const { doc, source, reason } = this.storage.codec.read(content);
        const set = commands.setContent(doc, options)(props);
        if (set && props.dispatch) {
          // the document as the editor holds it
          this.storage.loaded = { text: content, source, reason, doc: props.tr.doc };
          this.storage.lastSaved = content;
          setProblem(this.storage, reason === 'unreadable' ? 'unreadable' : null);
        }
        return set;
      },
    };
  },

  // The first content was loaded as JSON, so the document remembered for it is equal to the
  // editor's but not the same nodes. Remembering the editor's own lets `saveMarkdown` tell an
  // unchanged block by identity, as it can after `setContent`.
  onCreate() {
    const { loaded } = this.storage;
    if (loaded && this.editor.state.doc.eq(loaded.doc)) loaded.doc = this.editor.state.doc;
  },

  onBeforeCreate() {
    const editor = this.editor;
    const storage = this.storage;
    const codec = new MarkdownCodec(editor.schema);
    storage.codec = codec;
    editor.getMarkdown = () => codec.serialize(editor.getJSON());
    const saved = (): string => {
      const { loaded } = storage;
      if (!loaded) return editor.getMarkdown();
      // as loaded (opened, or undone back to it): the text itself, whether or not it has a map
      if (editor.state.doc.eq(loaded.doc)) return loaded.text;
      const written = codec.writeKeeping(editor.state.doc, loaded.source);
      countWholeWrite(storage, written.whole, loaded.reason);
      return written.markdown;
    };
    editor.saveMarkdown = () => {
      try {
        const markdown = saved();
        storage.lastSaved = markdown;
        if (storage.problem === 'unsaveable') setProblem(storage, null);
        return markdown;
      } catch {
        // Writing must never lose a note: what was given last is given again, so nothing new
        // is stored over the last good text, and the problem is reported.
        setProblem(storage, 'unsaveable');
        return storage.lastSaved ?? storage.loaded?.text ?? '';
      }
    };
    editor.markdownToContent = (markdown) => stripMarkup(codec.parse(markdown));
    editor.contentToMarkdown = (content) =>
      codec.serialize(Array.isArray(content) ? { type: 'doc', content } : content);
    // the document is made from the options after this hook
    const { content, contentType } = editor.options;
    if (contentType === 'markdown' && typeof content === 'string') {
      const { doc, source, reason } = codec.read(content);
      editor.setOptions({ content: doc });
      storage.loaded = { text: content, source, reason, doc: editor.schema.nodeFromJSON(doc) };
      storage.lastSaved = content;
      if (reason === 'unreadable') storage.problem = 'unreadable';
    }
  },
});
