import type { JSONContent } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import type { Marked } from 'marked';
import { createMarked } from './lexer';
import { MarkdownParser } from './parser';
import { DOCUMENT_RULES, RuleTable } from './rules';
import { MarkdownSerializer } from './serializer';
import { readSource, type MarkdownSource, type UnmappedReason } from './source';

/** A text read for an editor: the document to load, and its source map when it has one. */
export interface MarkdownReading {
  doc: JSONContent;
  source: MarkdownSource | null;
  // why there is no map; null when there is one
  reason: UnmappedReason | null;
}

const rules = new RuleTable(DOCUMENT_RULES);
let marked: Marked | null = null;

// made on first use, and shared: its tokenizers are the rules', the same for every editor
function documentMarked(): Marked {
  marked ??= createMarked(rules.tokenizers);
  return marked;
}

/**
 * Markdown to the editor's JSON and back, for a schema made from `createDocumentExtensions`
 * (the schema gives the marks' nesting order and which marks and nodes hold code).
 */
export class MarkdownCodec {
  private readonly parser: MarkdownParser;
  private readonly serializer: MarkdownSerializer;

  constructor(private readonly schema: Schema) {
    this.parser = new MarkdownParser(rules, documentMarked());
    this.serializer = new MarkdownSerializer(rules, schema);
  }

  parse(markdown: string): JSONContent {
    return this.parser.parse(markdown);
  }

  /**
   * The text as a document an editor can load, with its source map (source.ts): the slice of the
   * text each top-level block was read from, or null when the two can't be lined up. A text that
   * reads as no blocks (only link definitions, `[docs]: https://…`) is shown as it is written, a
   * line of the paragraph each, so a note never looks empty when its file isn't; a blank text is
   * one empty paragraph. Neither has a map.
   */
  read(markdown: string): MarkdownReading {
    const parsed = this.parser.read(markdown);
    const { source, reason } = readSource(markdown, parsed, this.schema);
    if (parsed.doc.content?.length) return { doc: parsed.doc, source, reason };
    const lines = markdown.split(/\r\n|\r|\n/).filter((line) => line.trim());
    const content = lines.flatMap((line, index): JSONContent[] => [
      ...(index > 0 ? [{ type: 'hardBreak' }] : []),
      { type: 'text', text: line },
    ]);
    return { doc: { type: 'doc', content: [{ type: 'paragraph', content }] }, source, reason };
  }

  /** The document `read` gives, alone. */
  parseDocument(markdown: string): JSONContent {
    return this.read(markdown).doc;
  }

  serialize(doc: JSONContent): string {
    return this.serializer.serialize(doc);
  }
}
