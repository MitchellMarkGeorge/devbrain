/**
 * DevBrain's links to its own tasks, projects, notes and events in markdown: an ordinary link with
 * DevBrain's own scheme, `[Fix login](devbrain://task/tsk_…)`, so a note stays readable in any
 * other markdown app. The editor draws one as a pill (renderer `extensions/entity-link.ts`); core
 * reads them out of saved markdown to know what mentions what (`core/mentions`). Both read them
 * with the patterns here, so a link the editor shows as a pill is always one core counts.
 */

export const ENTITY_URL_PREFIX = 'devbrain://';

/** the item types a link can name */
export const ENTITY_LINK_TYPES = ['task', 'project', 'note', 'event'] as const;
export type EntityLinkType = (typeof ENTITY_LINK_TYPES)[number];

// [label](devbrain://type/id), the label without unescaped brackets or line breaks. Groups: the
// escaped label, the type, the id
const LINK = String.raw`\[((?:\\.|[^\\\]\n])*)\]\(devbrain:\/\/(task|project|note|event)\/([A-Za-z0-9_-]+)\)`;

/** a link at the start of the text (the editor's markdown tokenizer) */
export const ENTITY_LINK = new RegExp(`^${LINK}`);

/** where a link may start, for the tokenizer's `start` */
export const ENTITY_LINK_START = /\[(?:\\.|[^\\\]\n])*\]\(devbrain:\/\//;

/** a new global pattern matching every link in a text; each call has its own `lastIndex` */
export function entityLinkPattern(): RegExp {
  return new RegExp(LINK, 'g');
}

export function entityUrl(type: EntityLinkType, id: string): string {
  return `${ENTITY_URL_PREFIX}${type}/${id}`;
}

export function escapeLinkLabel(label: string): string {
  return label.replace(/[\\[\]]/g, (char) => `\\${char}`);
}

export function unescapeLinkLabel(label: string): string {
  return label.replace(/\\(.)/g, '$1');
}
