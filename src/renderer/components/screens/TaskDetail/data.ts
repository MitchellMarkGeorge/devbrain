import type { Task } from '../../lists/TaskRow/types';

/** The PKCE task's subtasks, as the Figma task screens show them. */
export const PKCE_SUBTASKS: Task[] = [
  {
    id: 'eng-125',
    title: 'Generate code verifier',
    status: 'completed',
    key: 'ENG-125',
    priority: 'medium',
    date: 'Jun 16',
  },
  {
    id: 'eng-126',
    title: 'S256 challenge',
    status: 'completed',
    key: 'ENG-126',
    priority: 'medium',
    date: 'Jun 17',
  },
  {
    id: 'eng-127',
    title: 'Token exchange endpoint',
    status: 'completed',
    key: 'ENG-127',
    priority: 'medium',
    date: 'Jun 19',
  },
  {
    id: 'eng-128',
    title: 'Mobile fallback',
    status: 'not-started',
    key: 'ENG-128',
    priority: 'high',
    date: 'Jun 24',
  },
];

export const PKCE_DESCRIPTION = [
  'Replace the implicit-flow handoff with PKCE for every first-party client, on web and mobile. Use an S256 challenge, a 96-character code verifier and a 10-minute lifetime for authorization codes.',
  'Keep the migration backwards-compatible for one release: both flows stay behind a feature flag until the mobile fallback ships, then the implicit flow is removed.',
];
