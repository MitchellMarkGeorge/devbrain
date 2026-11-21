/* Sandbox mock data: what links to the PKCE task, its ADR note and the Design Review event. */
import { TaskStatus } from '@common/types';
import type { Backlink } from './BacklinksSection';

export const PKCE_TITLE = 'Implement OAuth2 PKCE flow';

export const PKCE_BACKLINKS: Backlink[] = [
  {
    id: 'b1',
    source: { type: 'event', title: 'Mitchell / Jesse 1:1', color: 'green' },
    updated: '2h ago',
    context: ['Pair on ', null, ' before Thursday'],
  },
  {
    id: 'b2',
    source: { type: 'note', title: 'Architecture ADR #4 — PKCE' },
    updated: 'Yesterday',
    context: ['Carried out by ', null, '; the implicit flow stays behind a flag'],
  },
  {
    id: 'b3',
    source: { type: 'note', title: 'Security review — June' },
    updated: 'Jun 18',
    context: ['Close SR-12 once ', null, ' ships to mobile'],
  },
  {
    id: 'b4',
    source: { type: 'task', title: 'Write PKCE migration guide', status: TaskStatus.NOT_STARTED },
    updated: 'Jun 17',
    context: ['Blocked on ', null],
  },
  {
    id: 'b5',
    source: { type: 'note', title: 'Weekly log — wk 25' },
    updated: 'Jun 14',
    context: ['Spiked the S256 challenge for ', null],
  },
  {
    id: 'b6',
    source: { type: 'project', title: 'Auth Overhaul', color: 'blue' },
    updated: 'Jun 10',
    context: ['Milestone 1: ', null],
  },
  {
    id: 'b7',
    source: { type: 'note', title: 'Auth0 call notes' },
    updated: 'Jun 9',
    context: ['Refresh tokens keep working after ', null],
  },
];

export const ADR_TITLE = 'Architecture ADR #4 — PKCE';

export const ADR_BACKLINKS: Backlink[] = [
  {
    id: 'n1',
    source: { type: 'task', title: PKCE_TITLE, status: TaskStatus.IN_PROGRESS },
    updated: '3h ago',
    context: ['Follow the decision in ', null, ': S256 only'],
  },
  {
    id: 'n2',
    source: { type: 'note', title: 'Security review — June' },
    updated: 'Jun 18',
    context: ['SR-12 is fixed by design in ', null],
  },
  {
    id: 'n3',
    source: { type: 'event', title: 'Auth Overhaul Design Review', color: 'blue' },
    updated: 'Jun 12',
    context: ['Get sign-off on ', null, ' from the platform team'],
  },
];

export const DESIGN_REVIEW_BACKLINKS: Backlink[] = [
  {
    id: 'e1',
    source: { type: 'note', title: 'Billing revamp — scope' },
    updated: 'Yesterday',
    context: ['Bring the empty-state options to ', null],
  },
  {
    id: 'e2',
    source: {
      type: 'task',
      title: 'Create user interface mockups',
      status: TaskStatus.NOT_STARTED,
    },
    updated: 'Jun 19',
    context: ['To walk through at ', null],
  },
  {
    id: 'e3',
    source: { type: 'note', title: 'Design review: empty states' },
    updated: 'Jun 8',
    context: ['Decisions from ', null],
  },
];
