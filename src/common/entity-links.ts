/**
 * DevBrain's links to its own tasks, projects, notes and events in markdown: an ordinary link with
 * DevBrain's own scheme, `[Fix login](devbrain://task/tsk_…)`, so a note stays readable in any
 * other markdown app. The editor draws one as a pill (renderer `extensions/entity-link.ts`); core
 * reads them out of saved markdown to know what mentions what (`core/mentions`). Both read them
 * with `entityLinkTokenizer`, plugged into `marked`, so a link the editor shows as a pill is one
 * core counts, and one in code is neither.
 */

export const ENTITY_URL_PREFIX = 'devbrain://';

/** the item types a link can name */
export const ENTITY_LINK_TYPES = ['task', 'project', 'note', 'event'] as const;
export type EntityLinkType = (typeof ENTITY_LINK_TYPES)[number];

// [label](devbrain://type/id), the label without unescaped brackets or line breaks. Groups: the
// escaped label, the type, the id
const LINK = String.raw`\[((?:\\.|[^\\\]\n])*)\]\(devbrain:\/\/(task|project|note|event)\/([A-Za-z0-9_-]+)\)`;

// a link at the start of the text, and where one may start (the tokenizer's `start`)
const ENTITY_LINK = new RegExp(`^${LINK}`);
const ENTITY_LINK_START = /\[(?:\\.|[^\\\]\n])*\]\(devbrain:\/\//;

export function entityUrl(type: EntityLinkType, id: string): string {
  return `${ENTITY_URL_PREFIX}${type}/${id}`;
}

export function escapeLinkLabel(label: string): string {
  return label.replace(/[\\[\]]/g, (char) => `\\${char}`);
}

function unescapeLinkLabel(label: string): string {
  return label.replace(/\\(.)/g, '$1');
}

/** An entity link as `entityLinkTokenizer` reads it: a `marked` token of type `entityLink`. */
export interface EntityLinkToken {
  type: 'entityLink';
  raw: string;
  label: string;
  entityType: EntityLinkType;
  id: string;
}

/**
 * The inline tokenizer that reads an entity link, in the shape of a `marked` extension's: the
 * editor's markdown layer plugs it in with its own (`entityLinkMarkdown`), and core with `marked`
 * alone (`core/mentions/extract.ts`).
 */
export const entityLinkTokenizer = {
  name: 'entityLink',
  level: 'inline',
  start: (src: string): number => src.search(ENTITY_LINK_START),
  tokenize(src: string): EntityLinkToken | undefined {
    const match = ENTITY_LINK.exec(src);
    if (!match) return undefined;
    return {
      type: 'entityLink',
      raw: match[0],
      label: unescapeLinkLabel(match[1]),
      entityType: match[2] as EntityLinkType,
      id: match[3],
    };
  },
} as const;
