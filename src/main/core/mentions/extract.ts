import { isId } from '@common/ids';
import { entityLinkPattern, unescapeLinkLabel, type EntityLinkType } from '@common/entity-links';
import type { MentionTargetId } from '@common/types';
import { stripMarkdown } from '../shared/markdown';

/** One item a text mentions: how often, and the line of its first mention either side of it. */
export interface ExtractedMention {
  targetId: MentionTargetId;
  count: number;
  contextBefore: string;
  contextAfter: string;
}

// how much of the line is kept either side of the mention; the rest is cut with "…"
const BEFORE_LENGTH = 120;
const AFTER_LENGTH = 160;

// stands for the mention while its line is turned into plain text: a private-use character, which
// markdown gives no meaning and a note never contains
const MARK = '';

// a fence opening or closing a code block: three or more backticks or tildes
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

// inline code spans, whose text is code and never a link
const CODE_SPAN = /(`+)[^`]*?\1/g;

interface Link {
  start: number;
  end: number;
  label: string;
  type: EntityLinkType;
  id: string;
}

/**
 * The items `markdown` mentions through `devbrain://` links, in the order of their first mention.
 * Links in code (blocks and spans) are text, as the editor shows them, and aren't mentions; neither
 * is a link whose id doesn't have its type's shape.
 */
export function extractMentions(markdown: string): ExtractedMention[] {
  const found = new Map<MentionTargetId, ExtractedMention>();
  let fence: string | null = null;

  for (const line of markdown.split('\n')) {
    const opening = FENCE.exec(line)?.[1];
    if (fence !== null) {
      // a block ends at a fence of the same character, at least as long as the one that opened it
      if (opening && opening[0] === fence[0] && opening.length >= fence.length) fence = null;
      continue;
    }
    if (opening) {
      fence = opening;
      continue;
    }

    const links = linksIn(line);
    links.forEach((link, i) => {
      const targetId = link.id as MentionTargetId;
      const seen = found.get(targetId);
      if (seen) {
        seen.count += 1;
        return;
      }
      found.set(targetId, { targetId, count: 1, ...contextOf(line, links, i) });
    });
  }
  return [...found.values()];
}

/** the links in one line, outside code spans */
function linksIn(line: string): Link[] {
  const code = [...line.matchAll(CODE_SPAN)].map((m) => [m.index, m.index + m[0].length]);
  const links: Link[] = [];
  for (const match of line.matchAll(entityLinkPattern())) {
    const [raw, label, type, id] = match;
    const start = match.index;
    if (code.some(([from, to]) => start >= from && start < to)) continue;
    if (!isId(type as EntityLinkType, id)) continue;
    links.push({ start, end: start + raw.length, label, type: type as EntityLinkType, id });
  }
  return links;
}

/**
 * The line as plain text either side of link `i`: the other links become their labels, and the
 * markdown around them (list markers, a to-do's box, a heading's #, emphasis) is stripped.
 */
function contextOf(
  line: string,
  links: Link[],
  i: number,
): Pick<ExtractedMention, 'contextBefore' | 'contextAfter'> {
  let text = '';
  let at = 0;
  links.forEach((link, j) => {
    text += line.slice(at, link.start) + (j === i ? MARK : unescapeLinkLabel(link.label));
    at = link.end;
  });
  text += line.slice(at);

  const plain = stripMarkdown(text).replace(/\s+/g, ' ');
  const mark = plain.indexOf(MARK);
  // stripping keeps the mark; this is a guard, not a case that happens
  if (mark === -1) return { contextBefore: '', contextAfter: '' };
  const before = plain.slice(0, mark).trimStart();
  const after = plain.slice(mark + 1).trimEnd();
  return {
    contextBefore: before.length > BEFORE_LENGTH ? `…${before.slice(-BEFORE_LENGTH)}` : before,
    contextAfter: after.length > AFTER_LENGTH ? `${after.slice(0, AFTER_LENGTH)}…` : after,
  };
}
