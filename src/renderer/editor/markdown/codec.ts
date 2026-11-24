import type { JSONContent } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import type { Marked } from 'marked';
import { createMarked } from './lexer';
import { MarkdownParser } from './parser';
import { DOCUMENT_RULES, RuleTable } from './rules';
import { MarkdownSerializer } from './serializer';

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

  constructor(schema: Schema) {
    this.parser = new MarkdownParser(rules, documentMarked());
    this.serializer = new MarkdownSerializer(rules, schema);
  }

  parse(markdown: string): JSONContent {
    return this.parser.parse(markdown);
  }

  /**
   * The JSON as a document an editor can load. A text that reads as no blocks (only link
   * definitions, `[docs]: https://…`) is shown as it is written, a line of the paragraph each, so
   * a note never looks empty when its file isn't; a blank text is one empty paragraph.
   */
  parseDocument(markdown: string): JSONContent {
    const doc = this.parse(markdown);
    if (doc.content?.length) return doc;
    const lines = markdown.split(/\r\n|\r|\n/).filter((line) => line.trim());
    const content = lines.flatMap((line, index): JSONContent[] => [
      ...(index > 0 ? [{ type: 'hardBreak' }] : []),
      { type: 'text', text: line },
    ]);
    return { type: 'doc', content: [{ type: 'paragraph', content }] };
  }

  serialize(doc: JSONContent): string {
    return this.serializer.serialize(doc);
  }
}
