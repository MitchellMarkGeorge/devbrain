import { TaskStatus } from '@common/types';
import type { TaskId } from '@common/ids';
import { storyAgo } from '../../lib/story-dates';
import { sampleEventLink, sampleProject } from '../../lists/TaskRow/fixtures';
import { sampleNote, type SampleNote } from '../../notes/NoteCard/fixtures';

/** The notes of the Figma "Notes (list)" and "Notes (cards)" screens, newest first. */
const DAY = 60 * 24;
const AUTH = sampleProject('Auth Overhaul', 'blue');

export const NOTES: SampleNote[] = [
  sampleNote({
    title: 'PKCE design notes',
    preview:
      'S256 challenge, 96-char verifier and a 10-minute code TTL, behind a feature flag for the first two weeks.',
    link: {
      type: 'task',
      id: 'tsk_pkce_guide' as TaskId,
      title: 'Write PKCE migration guide',
      status: TaskStatus.IN_PROGRESS,
    },
    project: AUTH,
  }),
  sampleNote({
    title: 'Architecture ADR #4 — PKCE',
    updatedAt: storyAgo(DAY),
    preview:
      'We adopt PKCE for every first-party client and retire the implicit flow by the end of July.',
    project: AUTH,
  }),
  sampleNote({
    title: 'Auth provider eval matrix',
    updatedAt: storyAgo(3 * DAY),
    preview: 'Auth0, Cognito and Keycloak compared on cost, SSO support and migration effort.',
  }),
  sampleNote({
    title: 'API Gateway rate limits',
    updatedAt: storyAgo(4 * DAY),
    preview:
      '600 requests a minute per key, a burst of 100, and a Retry-After header on every 429.',
    project: sampleProject('API Gateway v2', 'amber'),
  }),
  sampleNote({
    title: 'Mitchell / Jesse 1:1 notes',
    updatedAt: storyAgo(7 * DAY),
    preview: 'PKCE rollout timing, the token storage audit and the mobile fallback plan.',
    link: sampleEventLink('Mitchell / Jesse 1:1', 'green'),
  }),
  sampleNote({
    title: 'Sprint 14 retro',
    updatedAt: storyAgo(10 * DAY),
    preview: 'Fewer carry-overs this sprint; reviews still wait too long for a second approver.',
    project: sampleProject('AI Action Items', 'green'),
  }),
];
