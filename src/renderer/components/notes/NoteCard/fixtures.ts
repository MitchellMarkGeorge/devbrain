import type { NoteListItem } from '@common/types';
import type { TaskId } from '@common/ids';
import { TaskStatus } from '@common/types';
import { storyAgo } from '../../lib/story-dates';
import { sampleEventLink, sampleProject } from '../../lists/TaskRow/fixtures';

/** The fields of core's `NoteListItem` the note row and card read. */
export type SampleNote = Pick<NoteListItem, 'title' | 'preview' | 'updatedAt' | 'project' | 'link'>;

/** A core-shaped note for stories: edited two hours before the story's `now`, with no relations. */
export function sampleNote(fields: Partial<SampleNote> & Pick<SampleNote, 'title'>): SampleNote {
  return { preview: null, updatedAt: storyAgo(120), project: null, link: null, ...fields };
}

export const SAMPLE_NOTES: SampleNote[] = [
  sampleNote({
    title: 'Q4 planning notes',
    preview:
      'Settle the calendar sync scope, agree who owns the onboarding rewrite, and decide whether the board ships in 1.0 or waits for the list behaviours to land first.',
    project: sampleProject('Planning', 'amber'),
  }),
  sampleNote({
    title: 'Mitchell / Jesse 1:1',
    updatedAt: storyAgo(60 * 22),
    preview: 'Talked through the release plan and the open hiring loop.',
    link: sampleEventLink('Mitchell / Jesse 1:1', 'indigo'),
  }),
  sampleNote({
    title: 'Sync engine design',
    updatedAt: storyAgo(60 * 24 * 28),
    preview:
      'Every provider writes through one change log, so a task edited offline replays in order once the network is back. Conflicts favour the most recent edit at the field level.',
    project: sampleProject('DevBrain 1.0', 'blue'),
  }),
];

/** A note made for a task: its task pill. */
export const PKCE_NOTE: SampleNote = sampleNote({
  title: 'PKCE design notes',
  preview: 'S256 challenge, 96-char verifier, 10-minute code TTL.',
  link: {
    type: 'task',
    id: 'tsk_pkce_guide' as TaskId,
    title: 'Write PKCE migration guide',
    status: TaskStatus.IN_PROGRESS,
  },
  project: sampleProject('Auth Overhaul', 'blue'),
});
