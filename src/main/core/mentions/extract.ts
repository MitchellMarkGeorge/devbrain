import { isId } from '@common/ids';
import { entityLinkTokenizer, type EntityLinkToken } from '@common/entity-links';
import type { MentionTargetId } from '@common/types';
import { Marked, type TokenizerExtension } from 'marked';

/**
 * Markdown read as the editor reads it, as far as links go: GitHub-flavoured markdown, with the
 * editor's own entity-link tokenizer. The editor's other tokenizers (callouts, `<details>`, raw
 * HTML) aren't plugged in: they decide how a block is drawn, not whether a link in it is code.
 */
const marked = new Marked({ gfm: true });
const extension: TokenizerExtension = {
  name: entityLinkTokenizer.name,
  level: entityLinkTokenizer.level,
  start: entityLinkTokenizer.start,
  tokenizer: (src) => entityLinkTokenizer.tokenize(src),
};
marked.use({ extensions: [extension] });

/**
 * The items `markdown` mentions through `devbrain://` links, each once, in the order of their
 * first mention. A link in code (a block, a span) or in raw HTML is text, as the editor shows it:
 * `marked` reads no links there, so it isn't a mention. Nor is a link whose id doesn't have its
 * type's shape.
 */
export function extractMentions(markdown: string): MentionTargetId[] {
  const found = new Set<MentionTargetId>();
  marked.walkTokens(marked.lexer(markdown), (token) => {
    if (token.type !== 'entityLink') return;
    const link = token as unknown as EntityLinkToken;
    if (isId(link.entityType, link.id)) found.add(link.id as MentionTargetId);
  });
  return [...found];
}
