/* Sandbox mock data: what mentions the PKCE task, its ADR note and the Design Review event. */
import { TaskStatus } from '@common/types';
import type { PillEntity } from '../../../entities/EntityPill';
import type { Mention, UnlinkedMention } from './MentionsSection';

const AUTH = { title: 'Auth Overhaul', color: 'blue' };

export const PKCE_TASK: PillEntity = {
  type: 'task',
  title: 'Implement OAuth2 PKCE flow',
  status: TaskStatus.IN_PROGRESS,
};

export const PKCE_MENTIONS: Mention[] = [
  {
    id: 'm1',
    source: { type: 'event', title: 'Mitchell / Jesse 1:1', color: 'green' },
    where: 'Event note',
    updated: '2h ago',
    kind: 'todo',
    snippet: ['Pair on ', { self: true }, ' before Thursday so the mobile fallback can start'],
  },
  {
    id: 'm2',
    source: { type: 'note', title: 'Architecture ADR #4 — PKCE', project: AUTH },
    updated: 'Yesterday',
    kind: 'text',
    snippet: [
      'Every first-party client moves to the code flow with PKCE. ',
      { self: true },
      ' carries it out; the implicit flow stays behind a flag for one release.',
    ],
    more: 2,
  },
  {
    id: 'm3',
    source: { type: 'note', title: 'Security review — June', project: AUTH },
    updated: 'Jun 18',
    kind: 'todo',
    snippet: [
      'Close finding SR-12 (tokens in the URL fragment) once ',
      { self: true },
      ' ships to mobile',
    ],
  },
  {
    id: 'm4',
    source: { type: 'task', title: 'Write PKCE migration guide', status: TaskStatus.NOT_STARTED },
    where: 'Description',
    updated: 'Jun 17',
    kind: 'text',
    snippet: [
      'Blocked on ',
      { self: true },
      ': the guide documents its verifier length and code lifetime.',
    ],
  },
  {
    id: 'm5',
    source: { type: 'note', title: 'Weekly log — wk 25' },
    updated: 'Jun 14',
    kind: 'done',
    snippet: ['Spike the S256 challenge for ', { self: true }],
  },
  {
    id: 'm6',
    source: { type: 'project', title: 'Auth Overhaul', color: 'blue' },
    where: 'Description',
    updated: 'Jun 10',
    kind: 'heading',
    snippet: ['Milestone 1: ', { self: true }],
  },
  {
    id: 'm7',
    source: { type: 'note', title: 'Auth0 call notes', project: AUTH },
    updated: 'Jun 9',
    kind: 'text',
    snippet: [
      'Auth0 confirmed refresh tokens keep working after ',
      { self: true },
      '; see ',
      {
        entity: {
          type: 'task',
          title: 'Refactor token refresh logic',
          status: TaskStatus.NOT_STARTED,
        },
      },
    ],
  },
];

export const PKCE_UNLINKED: UnlinkedMention[] = [
  {
    id: 'u1',
    source: { type: 'note', title: 'Standup notes' },
    updated: 'Today',
    snippet: ['Still waiting on review for the ', { match: 'OAuth2 PKCE flow' }, ' PR.'],
  },
  {
    id: 'u2',
    source: { type: 'event', title: 'Sprint Planning', color: 'green' },
    updated: 'Jun 15',
    snippet: ['Carry over: ', { match: 'implement OAuth2 PKCE flow' }, ' (mobile half)'],
  },
];

export const ADR_NOTE: PillEntity = { type: 'note', title: 'Architecture ADR #4 — PKCE' };

export const ADR_MENTIONS: Mention[] = [
  {
    id: 'n1',
    source: { type: 'task', title: 'Implement OAuth2 PKCE flow', status: TaskStatus.IN_PROGRESS },
    where: 'Description',
    updated: '3h ago',
    kind: 'text',
    snippet: ['Follow the decision in ', { self: true }, ': S256 only, 96-character verifier.'],
  },
  {
    id: 'n2',
    source: { type: 'note', title: 'Security review — June', project: AUTH },
    updated: 'Jun 18',
    kind: 'text',
    snippet: ['SR-12 is accepted as fixed by design in ', { self: true }, '.'],
  },
  {
    id: 'n3',
    source: { type: 'event', title: 'Auth Overhaul Design Review', color: 'blue' },
    where: 'Event note',
    updated: 'Jun 12',
    kind: 'todo',
    snippet: ['Get sign-off on ', { self: true }, ' from the platform team'],
  },
];

export const DESIGN_REVIEW: PillEntity = { type: 'event', title: 'Design Review', color: 'blue' };

export const DESIGN_REVIEW_MENTIONS: Mention[] = [
  {
    id: 'e1',
    source: {
      type: 'note',
      title: 'Billing revamp — scope',
      project: { title: 'Billing Revamp', color: 'amber' },
    },
    updated: 'Yesterday',
    kind: 'todo',
    snippet: ['Bring the empty-state options to ', { self: true }],
  },
  {
    id: 'e2',
    source: {
      type: 'task',
      title: 'Create user interface mockups',
      status: TaskStatus.NOT_STARTED,
    },
    where: 'Description',
    updated: 'Jun 19',
    kind: 'text',
    snippet: ['Mockups for the first milestone, to walk through at ', { self: true }, '.'],
  },
  {
    id: 'e3',
    source: { type: 'note', title: 'Weekly log — wk 25' },
    updated: 'Jun 14',
    kind: 'done',
    snippet: ['Send the agenda for ', { self: true }],
  },
  {
    id: 'e4',
    source: { type: 'note', title: 'Design review: empty states' },
    updated: 'Jun 8',
    kind: 'heading',
    snippet: ['Decisions from ', { self: true }],
  },
];
