import type { EventId, NoteId, ProjectId, TaskId } from '@common/ids';
import { TaskStatus, type Mention } from '@common/types';
import { storyAgo, storyDate } from '../../lib/story-dates';

// What mentions the PKCE task, as core's mentions.list returns it, around the stories' `now`.

const hoursAgo = (hours: number) => storyAgo(hours * 60);

export const SAMPLE_MENTIONS: Mention[] = [
  {
    source: {
      type: 'note',
      id: 'nte_one_on_one' as NoteId,
      title: 'Mitchell / Jesse 1:1',
      linkedEventId: 'evt_one_on_one' as EventId,
    },
    updatedAt: hoursAgo(2),
  },
  {
    source: {
      type: 'note',
      id: 'nte_adr' as NoteId,
      title: 'Architecture ADR #4 — PKCE',
      linkedEventId: null,
    },
    updatedAt: hoursAgo(26),
  },
  {
    source: {
      type: 'task',
      id: 'tsk_guide' as TaskId,
      title: 'Write PKCE migration guide',
      status: TaskStatus.NOT_STARTED,
    },
    updatedAt: hoursAgo(50),
  },
  {
    source: {
      type: 'event',
      id: 'evt_review' as EventId,
      title: 'Security review',
      startAt: storyDate(-4),
      color: 'green',
    },
    updatedAt: storyDate(-4),
  },
  {
    source: {
      type: 'note',
      id: 'nte_log' as NoteId,
      title: 'Weekly log — wk 25',
      linkedEventId: null,
    },
    updatedAt: storyDate(-8),
  },
  {
    source: { type: 'project', id: 'prj_auth' as ProjectId, title: 'Auth Overhaul', color: 'blue' },
    updatedAt: storyDate(-12),
  },
  {
    source: {
      type: 'note',
      id: 'nte_auth0' as NoteId,
      title: 'Auth0 call notes',
      linkedEventId: null,
    },
    updatedAt: storyDate(-13),
  },
];
