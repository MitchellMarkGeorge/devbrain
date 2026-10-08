/**
 * Seeds a local dev workspace with a moderately/realistically sized dataset —
 * projects, tasks (with subtasks), notes, and events — all linked together
 * the same way the app itself would link them, so real use cases (project
 * views, calendars, search, archiving, filtering/sorting) can be explored
 * against non-trivial data, and query performance can be meaningfully
 * measured.
 *
 * It goes through the same public service layer the app uses (Workspace →
 * ProjectService/TaskService/NoteService/EventService) rather than inserting
 * rows directly, so every business rule (completedAt consistency, the
 * note/task "one link" checks, subtask inheritance, etc.) is enforced the
 * same way it would be for real user data.
 *
 * NOTE: createdAt/updatedAt are stamped by the DB at insert time, and the
 * service layer has no way to backdate them — so every row's createdAt will
 * land at "now" (whenever this script ran). The realistic timeline instead
 * comes from the semantic date fields that *are* settable (task/project
 * startDate & dueDate, event startAt/endAt), which are spread across the
 * past and future.
 *
 * Usage:
 *   npm run seed:dev                              # create workspace at DEV_PATH (from .env)
 *   npm run seed:dev -- --reset                    # wipe and recreate it
 *   npm run seed:dev -- --path .dev2 --name Perf    # override .env for this run
 *   npm run seed:dev -- --seed 7                    # different dataset shape
 *
 * DEV_PATH and DEV_WORKSPACE_NAME are read from the repo's .env file (same
 * variables the app itself uses), falling back to `.dev` / `Dev` if either is
 * unset. --path/--name flags take precedence over both.
 *
 * When DEV_LINEAR_API_KEY is set, the workspace is also connected to that
 * Linear account through IntegrationService.connectWithApiKey, so a seeded
 * workspace starts connected. The key is stored with a dev-only cipher (see
 * devCipher below), not safeStorage, which only exists inside Electron.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config as loadEnvFile } from '@dotenvx/dotenvx';
import { initDevBrain } from '@main/core';
import type { SecretCipher } from '@main/core/integrations/credentials';
import { Provider } from '@main/core/integrations/types';
import type { Workspace } from '@main/core/workspace/workspace';
import type { Project } from '@main/core/projects/types';
import type { Task } from '@main/core/tasks/types';
import type { Note } from '@main/core/notes/types';
import type { Event } from '@main/core/events/types';
import { ProjectStatus } from '@main/core/projects/types';
import { TaskStatus, TaskPriority } from '@main/core/tasks/types';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const MIGRATIONS_PATH = path.join(REPO_ROOT, 'src/main/db/migrations');

// load the repo's .env (DEV_PATH, DEV_WORKSPACE_NAME, ...) — doesn't override
// anything already set in the environment, same as dotenvx in src/main/index.ts
loadEnvFile({ path: path.join(REPO_ROOT, '.env') });

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const hasFlag = (name: string) => argv.includes(`--${name}`);
const getOpt = (name: string, fallback: string): string => {
  const idx = argv.indexOf(`--${name}`);
  if (idx === -1 || idx === argv.length - 1) return fallback;
  return argv[idx + 1];
};

const RESET = hasFlag('reset') || hasFlag('force');
const ROOT_PATH = path.resolve(REPO_ROOT, getOpt('path', process.env.DEV_PATH ?? '.dev'));
const WORKSPACE_NAME = getOpt('name', process.env.DEV_WORKSPACE_NAME ?? 'Dev');
const SEED = Number(getOpt('seed', '42'));
// read here and in tests only; the app always takes a key through the connect flow
const LINEAR_API_KEY = process.env.DEV_LINEAR_API_KEY?.trim() || null;

// Stands in for Electron's safeStorage, which a plain Node script can't reach. It only encodes the
// credentials behind a marker, so it keeps them out of plain sight in the git-ignored dev folder
// and no more. A blob it writes can't be read by the app's real cipher (feature 14).
const DEV_CIPHER_MARKER = Buffer.from('devbrain-dev-cipher:');
const devCipher: SecretCipher = {
  isAvailable: async () => true,
  encrypt: async (plain) =>
    Buffer.concat([DEV_CIPHER_MARKER, Buffer.from(Buffer.from(plain).toString('base64'))]),
  decrypt: async (cipher) => {
    if (!cipher.subarray(0, DEV_CIPHER_MARKER.length).equals(DEV_CIPHER_MARKER)) {
      throw new Error('Not written by the dev cipher');
    }
    const encoded = cipher.subarray(DEV_CIPHER_MARKER.length).toString();
    return { result: Buffer.from(encoded, 'base64').toString(), shouldReEncrypt: false };
  },
};

// ---------------------------------------------------------------------------
// Dataset size — a few hundred rows per table: enough to exercise
// pagination/sorting/filtering and give perf numbers real teeth, without
// making a single seed run take forever.
// ---------------------------------------------------------------------------

const REGULAR_TASK_COUNT = 150;
const ONE_OFF_EVENT_COUNT = 110;
const PROJECT_NOTES_PER_PROJECT: [number, number] = [2, 4];
const FREESTANDING_NOTE_COUNT = 30;
const MEETING_NOTE_RATE = 0.25; // fraction of one-off events that get a note
const FOLLOWUP_TASK_EVENT_RATE = 0.2; // fraction of one-off events that spawn tasks
const NOTE_DERIVED_TASK_RATE = 0.25; // fraction of project/freestanding notes that spawn tasks
const TASK_NOTE_RATE = 0.2; // fraction of top-level tasks that get a "task note"
const SUBTASK_RATE = 0.35; // fraction of top-level tasks that get subtasks

// ---------------------------------------------------------------------------
// Deterministic RNG — re-running with the same --seed reproduces the same
// dataset shape, which is handy when comparing perf numbers run-over-run.
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(SEED);

function randomInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function chance(probability: number): boolean {
  return rng() < probability;
}

function pick<T>(items: readonly T[]): T {
  return items[randomInt(0, items.length - 1)];
}

function pickMany<T>(items: readonly T[], count: number): T[] {
  const pool = [...items];
  const result: T[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = randomInt(0, pool.length - 1);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
}

function shuffle<T>(items: readonly T[]): T[] {
  return pickMany(items, items.length);
}

function weightedPick<T>(pairs: Array<[T, number]>): T {
  const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of pairs) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Content pools
// ---------------------------------------------------------------------------

const PALETTE = [
  '#6366f1',
  '#22c55e',
  '#f97316',
  '#ef4444',
  '#06b6d4',
  '#a855f7',
  '#eab308',
  '#ec4899',
  '#14b8a6',
  '#64748b',
];

const PROJECT_DEFS: Array<{ title: string; description: string }> = [
  {
    title: 'API Gateway Revamp',
    description:
      'Replace the legacy reverse proxy with a purpose-built gateway that handles auth, rate limiting, and request logging in one place.',
  },
  {
    title: 'Mobile App Redesign',
    description:
      "Modernize the iOS/Android client's navigation and visual language to match the new design system.",
  },
  {
    title: 'Customer Onboarding Flow',
    description:
      'Reduce time-to-first-value for new signups by streamlining setup and cutting required steps.',
  },
  {
    title: 'Payment Integration',
    description: 'Add Stripe-based billing, invoicing, and subscription management.',
  },
  {
    title: 'Internal Analytics Dashboard',
    description:
      'Give the team visibility into usage, retention, and performance metrics without querying prod directly.',
  },
  {
    title: 'Search Infrastructure Migration',
    description: 'Move full-text search from ad-hoc LIKE queries to a dedicated FTS5-backed index.',
  },
  {
    title: 'On-call Tooling',
    description:
      'Build runbooks, alert routing, and an incident timeline tool for the on-call rotation.',
  },
  {
    title: 'Design System v2',
    description: 'Consolidate components, tokens, and docs into a single versioned package.',
  },
  {
    title: 'Data Pipeline Reliability',
    description: 'Add retries, dead-letter queues, and monitoring to the nightly ETL jobs.',
  },
  {
    title: 'Notes Editor Overhaul',
    description: 'Rebuild the markdown editor with better performance and offline support.',
  },
  {
    title: 'Calendar Sync',
    description: 'Two-way sync with Google Calendar and Outlook.',
  },
  {
    title: 'Multi-workspace Support',
    description: 'Let a single install manage multiple isolated workspaces.',
  },
  {
    title: 'Security Audit Remediation',
    description: 'Address findings from the Q2 third-party security audit.',
  },
  {
    title: 'Growth Experiments',
    description: 'Run and track a backlog of activation and retention experiments.',
  },
];

const TASK_VERBS = [
  'Implement',
  'Fix',
  'Refactor',
  'Investigate',
  'Add',
  'Remove',
  'Update',
  'Document',
  'Optimize',
  'Migrate',
  'Review',
  'Write tests for',
  'Design',
  'Configure',
  'Debug',
  'Clean up',
  'Prototype',
  'Benchmark',
];

const TASK_OBJECTS = [
  'the user authentication flow',
  'the rate limiting middleware',
  'the onboarding checklist UI',
  'the CSV export feature',
  'the flaky integration test suite',
  'database connection pooling',
  'dark mode theming',
  'the webhook retry logic',
  'pagination on the notes list',
  'drag-and-drop task reordering',
  'calendar recurring event expansion',
  'the search index rebuild job',
  'the error boundary for the editor',
  'keyboard shortcuts',
  'offline sync conflict handling',
  'PDF export for reports',
  'the Slack notification integration',
  'the audit log viewer',
  'the multi-workspace switcher',
  'the settings migration script',
  'the task archive/restore flow',
  'subtask reordering',
  'project health calculation',
  'sidebar navigation collapse state',
  'the note frontmatter parser',
  'markdown link autocompletion',
  'event RRULE expansion',
  'timezone handling for events',
  'empty states for lists',
  'loading skeletons',
  'virtualized task list rendering',
  'bulk task editing',
  'keyboard-driven quick capture',
  'note backlinks',
  'project templates',
  'the task dependency graph',
  'due date reminders',
  'the email digest job',
  'CSV import validation',
  'API rate limit headers',
  'database backup rotation',
  'migration rollback safety',
  'foreign key cascade behavior',
  'the search query tokenizer',
  'fuzzy title matching',
  'drag handle accessibility',
  'focus trap behavior in modals',
  'the undo/redo stack',
  'context menu actions',
  'inline editing for task titles',
  'the color picker component',
  'the project archive confirmation dialog',
  'the workspace switch animation',
  'the app auto-update flow',
  'crash reporting integration',
  'the telemetry opt-out setting',
  'the changelog viewer',
  'the onboarding tour',
  'the empty workspace state',
  'the nightly database vacuum job',
];

const SUBTASK_FRAGMENTS = [
  'Write unit tests',
  'Update docs',
  'Add error handling',
  'Get design sign-off',
  'Deploy to staging',
  'Add a feature flag',
  'Write the migration',
  'Add telemetry',
  'Peer review',
  'Update the changelog',
  'Write the RFC',
  'Add loading/error states',
  'Cross-browser check',
  'Accessibility pass',
  'Load test',
  'Update the API docs',
  'Add a rollback plan',
  'Get product sign-off',
  'Write the runbook entry',
  'Smoke test on staging',
];

const TASK_DESCRIPTIONS = [
  'See linked note for full context.',
  'Came up during triage — low risk, worth batching with related work.',
  'Blocking a downstream task; prioritize accordingly.',
  'Nice-to-have, but would meaningfully improve the experience.',
  'Follow-up from a bug report.',
  'Needs a design pass before implementation starts.',
  'Scoped down from the original ask to fit this cycle.',
  'Revisit once the underlying dependency is upgraded.',
];

const RECURRING_SERIES: Array<{
  title: string;
  description: string;
  rrule: string;
  hour: number;
  minute: number;
  durationMinutes: number;
  location?: string;
  meetingUrl?: string;
}> = [
  {
    title: 'Daily Standup',
    description: 'Quick round-robin: yesterday, today, blockers.',
    rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    hour: 9,
    minute: 30,
    durationMinutes: 15,
    meetingUrl: 'https://meet.internal.devteam.dev/standup',
  },
  {
    title: 'Sprint Retro',
    description: 'What went well, what didn’t, what we’ll change.',
    rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR',
    hour: 15,
    minute: 0,
    durationMinutes: 60,
    location: 'Conference Room A',
  },
  {
    title: 'Weekly Design Review',
    description: 'Walk through in-flight design work for feedback.',
    rrule: 'FREQ=WEEKLY;BYDAY=TH',
    hour: 13,
    minute: 0,
    durationMinutes: 60,
    meetingUrl: 'https://meet.internal.devteam.dev/design-review',
  },
  {
    title: '1:1 with Manager',
    description: 'Status, feedback, career chat.',
    rrule: 'FREQ=WEEKLY;BYDAY=WE',
    hour: 11,
    minute: 0,
    durationMinutes: 30,
    meetingUrl: 'https://meet.internal.devteam.dev/1-1',
  },
  {
    title: 'On-call Sync',
    description: 'Handoff notes and open incidents for the week.',
    rrule: 'FREQ=WEEKLY;BYDAY=MO',
    hour: 10,
    minute: 0,
    durationMinutes: 30,
  },
  {
    title: 'Company All-Hands',
    description: 'Company-wide update from leadership.',
    rrule: 'FREQ=MONTHLY;BYDAY=1MO',
    hour: 16,
    minute: 0,
    durationMinutes: 60,
    location: 'Main Hall',
  },
];

const ONE_OFF_EVENT_TITLES = [
  'Sprint Planning',
  'Architecture Review',
  'Interview: Senior Engineer',
  'Interview: Product Designer',
  'Customer Call: Acme Corp',
  'Customer Call: Initech',
  'On-call Handoff',
  'Incident Review',
  'Roadmap Planning',
  'Board Update Prep',
  'Team Lunch',
  'Focus Block',
  'Demo Day',
  'Security Audit Kickoff',
  'Vendor Call: Stripe',
  'Vendor Call: AWS',
  'Performance Review',
  'Hiring Debrief',
  'Offsite Planning',
  'Coffee Chat',
  'Pair Programming Session',
  'Code Freeze Review',
  'Release Planning',
  'Design Review: Notes Editor',
  'Design Review: Calendar View',
  '1:1 with Alex',
  '1:1 with Priya',
  'Backlog Grooming',
  'Postmortem: Staging Migration',
  'Q3 Planning',
];

const ALL_DAY_EVENT_TITLES = [
  'Company Offsite',
  'Public Holiday',
  'Team Offsite Planning Day',
  'Conference: Local-First Summit',
];

const LOCATIONS = [
  'Conference Room A',
  'Conference Room B',
  'HQ - 4th Floor',
  'Remote',
  null,
  null,
];

const DISCUSSION_POINTS = [
  'walked through current progress and blockers',
  'discussed tradeoffs between the two proposed approaches',
  'reviewed the latest metrics and what they imply',
  'aligned on scope for the next cycle',
  'surfaced a risk that needs a follow-up',
  'went over feedback from the last round',
  'debated timeline given current capacity',
  'looked at a few open questions from the doc',
];

const ACTION_ITEM_PHRASES = [
  'follow up with a written summary',
  'file a task to track the fix',
  'circle back once the dependency lands',
  'get sign-off before merging',
  'schedule a follow-up with the wider team',
  'update the doc with the decision',
  'ping the owner for an ETA',
];

const FREEFORM_NOTE_TOPICS = [
  'Architecture decision: SQLite over Postgres for local-first storage',
  'Sprint retro takeaways',
  'Onboarding runbook for new engineers',
  'Incident postmortem: search index corruption',
  'Reading notes: Designing Data-Intensive Applications, ch. 7',
  'Brainstorm: Q4 roadmap candidates',
  'Competitive analysis: Notion vs Linear vs us',
  'Draft: RFC for workspace sharing',
  'Meeting prep: board update',
  'Ideas for the quick-capture shortcut',
  'Notes from a customer interview',
  'Postmortem: failed migration on staging',
  'Style guide notes',
  'Release checklist draft',
  'Offsite planning doc',
  'Backlog grooming notes',
  'API design notes: pagination cursors',
  'Notes on FTS5 tokenizers',
  'Draft blog post: why we went local-first',
  'Support ticket patterns worth fixing',
  'Notes on choosing a color palette',
  'Data retention policy draft',
  'Notes on the Electron auto-update strategy',
  'Ideas for the empty states',
  'Notes on subtask inheritance rules',
];

const FILLER_SENTENCES = [
  'The current approach works but doesn’t scale past a few hundred items without a rewrite.',
  'Worth revisiting once we have real usage data instead of guessing.',
  'This mirrors a pattern we already use elsewhere, so it should be a small lift.',
  'The main risk is migration — existing data needs a backfill step.',
  'No strong opinion here; either option is fine as long as it’s documented.',
  'This came up twice in the last two weeks, so it’s probably worth prioritizing.',
  'Keeping this simple for now and revisiting if it becomes a bottleneck.',
  'The tradeoff is complexity now versus flexibility later.',
  'Flagging this so it doesn’t get lost — not urgent, but not free either.',
  'Once this lands, a few other things become much easier.',
  'The team seemed aligned on this by the end of the discussion.',
  'Still an open question — need more input before committing to a direction.',
];

// ---------------------------------------------------------------------------
// Note content builders
// ---------------------------------------------------------------------------

function bulletList(items: string[]): string {
  return items.map((item) => `- ${capitalize(item)}`).join('\n');
}

function meetingNoteContent(event: Event): string {
  const lines = [
    `**When:** ${event.startAt.toLocaleString()}`,
    event.location ? `**Where:** ${event.location}` : null,
    '',
    '### Discussion',
    bulletList(pickMany(DISCUSSION_POINTS, randomInt(2, 4))),
    '',
    '### Action items',
    bulletList(pickMany(ACTION_ITEM_PHRASES, randomInt(1, 3))),
  ];
  return lines.filter((line) => line !== null).join('\n');
}

function projectNoteContent(project: Project): string {
  return [
    `# ${project.title}`,
    '',
    '### Context',
    capitalize(pick(FILLER_SENTENCES)),
    capitalize(pick(FILLER_SENTENCES)),
    '',
    '### Approach',
    capitalize(pick(FILLER_SENTENCES)),
    '',
    '### Open questions',
    bulletList(pickMany(FILLER_SENTENCES, randomInt(1, 2))),
  ].join('\n');
}

function taskNoteContent(task: Task): string {
  const steps = pickMany(SUBTASK_FRAGMENTS, randomInt(2, 4));
  return [
    `### Implementation notes: ${task.title}`,
    capitalize(pick(FILLER_SENTENCES)),
    '',
    steps.map((step, i) => `- [${i === 0 ? 'x' : ' '}] ${step}`).join('\n'),
  ].join('\n');
}

function freeformNoteContent(topic: string): string {
  const paragraph = pickMany(FILLER_SENTENCES, randomInt(3, 5)).join(' ');
  return [`# ${topic}`, '', paragraph].join('\n');
}

// ---------------------------------------------------------------------------
// Seeding phases
// ---------------------------------------------------------------------------

async function seedProjects(workspace: Workspace): Promise<Project[]> {
  const now = new Date();
  const statusPlan: ProjectStatus[] = [
    ...Array(3).fill(ProjectStatus.NOT_STARTED),
    ...Array(3).fill(ProjectStatus.ON_HOLD),
    ...Array(6).fill(ProjectStatus.ACTIVE),
    ...Array(2).fill(ProjectStatus.COMPLETED),
  ];

  const projects: Project[] = [];
  for (let i = 0; i < PROJECT_DEFS.length; i++) {
    const { title, description } = PROJECT_DEFS[i];
    const status = statusPlan[i % statusPlan.length];

    let startDate: Date | undefined;
    let dueDate: Date;
    switch (status) {
      case ProjectStatus.COMPLETED:
        startDate = addDays(now, -randomInt(90, 150));
        dueDate = addDays(now, -randomInt(5, 30));
        break;
      case ProjectStatus.ACTIVE:
        startDate = addDays(now, -randomInt(10, 60));
        dueDate = addDays(now, randomInt(10, 90));
        break;
      case ProjectStatus.ON_HOLD:
        startDate = addDays(now, -randomInt(20, 80));
        dueDate = addDays(now, randomInt(30, 120));
        break;
      default: // NOT_STARTED
        startDate = chance(0.5) ? addDays(now, randomInt(5, 30)) : undefined;
        dueDate = addDays(now, randomInt(60, 150));
    }

    const project = await workspace.projects.createProject({
      title,
      description,
      startDate,
      dueDate,
      color: pick(PALETTE),
      status,
    });
    projects.push(project);
  }
  return projects;
}

async function seedEvents(workspace: Workspace): Promise<Event[]> {
  const now = new Date();
  const events: Event[] = [];

  // recurring series: one anchor row per series, RRULE describes the rest
  for (const series of RECURRING_SERIES) {
    const anchor = addDays(startOfDay(now), -randomInt(0, 14));
    const startAt = new Date(anchor);
    startAt.setHours(series.hour, series.minute, 0, 0);
    const endAt = addMinutes(startAt, series.durationMinutes);

    const event = await workspace.events.createEvent({
      title: series.title,
      description: series.description,
      startAt,
      endAt,
      reccurrenceRule: series.rrule,
      location: series.location,
      meetingUrl: series.meetingUrl,
      color: pick(PALETTE),
    });
    events.push(event);
  }

  // one-off meetings/events spread across roughly -60..+90 days
  for (let i = 0; i < ONE_OFF_EVENT_COUNT; i++) {
    const isAllDay = chance(0.08);
    const dayOffset = randomInt(-60, 90);
    const day = addDays(startOfDay(now), dayOffset);

    let startAt: Date;
    let endAt: Date;
    let allDay: boolean | undefined;
    let title: string;

    if (isAllDay) {
      title = pick(ALL_DAY_EVENT_TITLES);
      startAt = day;
      endAt = addMinutes(addDays(day, 1), -1);
      allDay = true;
    } else {
      title = pick(ONE_OFF_EVENT_TITLES);
      const hour = randomInt(8, 17);
      const minute = pick([0, 15, 30, 45]);
      startAt = new Date(day);
      startAt.setHours(hour, minute, 0, 0);
      endAt = addMinutes(startAt, pick([15, 30, 30, 45, 60, 60, 90]));
    }

    const event = await workspace.events.createEvent({
      title,
      description: chance(0.5) ? capitalize(pick(FILLER_SENTENCES)) : undefined,
      startAt,
      endAt,
      allDay,
      location: isAllDay ? undefined : (pick(LOCATIONS) ?? undefined),
      meetingUrl:
        !isAllDay && chance(0.4)
          ? `https://meet.internal.devteam.dev/${event_slug(title, i)}`
          : undefined,
      color: pick(PALETTE),
    });
    events.push(event);
  }

  return events;
}

function event_slug(title: string, seedIndex: number): string {
  return `${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')}-${seedIndex}`;
}

function taskTitle(): string {
  return `${pick(TASK_VERBS)} ${pick(TASK_OBJECTS)}`;
}

function pickTaskDueDate(): Date {
  return addDays(new Date(), randomInt(-45, 60));
}

function pickTaskStatus(dueDate: Date): TaskStatus {
  const isPast = dueDate.getTime() < Date.now();
  return isPast
    ? weightedPick([
        [TaskStatus.COMPLETED, 0.7],
        [TaskStatus.IN_PROGRESS, 0.2],
        [TaskStatus.NOT_STARTED, 0.1],
      ])
    : weightedPick([
        [TaskStatus.NOT_STARTED, 0.5],
        [TaskStatus.IN_PROGRESS, 0.35],
        [TaskStatus.COMPLETED, 0.15],
      ]);
}

function pickTaskPriority(): TaskPriority {
  return weightedPick([
    [TaskPriority.LOW, 0.4],
    [TaskPriority.MEDIUM, 0.35],
    [TaskPriority.HIGH, 0.25],
  ]);
}

async function seedRegularTasks(workspace: Workspace, projects: Project[]): Promise<Task[]> {
  // weight active projects highest, completed/on-hold lowest, and leave a
  // slice of tasks unassigned (personal/quick-capture tasks)
  const projectWeights: Array<[Project | null, number]> = [
    ...projects.map((project): [Project | null, number] => [
      project,
      project.status === ProjectStatus.ACTIVE
        ? 5
        : project.status === ProjectStatus.NOT_STARTED
          ? 2
          : project.status === ProjectStatus.ON_HOLD
            ? 1.5
            : 1,
    ]),
    [null, 10], // unassigned
  ];

  const tasks: Task[] = [];
  for (let i = 0; i < REGULAR_TASK_COUNT; i++) {
    const project = weightedPick(projectWeights);
    const dueDate = pickTaskDueDate();
    const status = pickTaskStatus(dueDate);
    const startDate = chance(0.6) ? addDays(dueDate, -randomInt(3, 21)) : undefined;

    const task = await workspace.tasks.createTask({
      title: taskTitle(),
      description: chance(0.6) ? pick(TASK_DESCRIPTIONS) : undefined,
      priority: pickTaskPriority(),
      status,
      dueDate,
      startDate,
      projectId: project?.id,
    });

    if (status !== TaskStatus.NOT_STARTED && chance(0.2)) {
      const repoSlug = project
        ? project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        : 'devbrain';
      await workspace.tasks.updateTask(task.id, {
        pullRequestUrl: `https://github.com/devteam/${repoSlug}/pull/${randomInt(101, 987)}`,
      });
    }

    tasks.push(task);
  }
  return tasks;
}

async function seedEventFollowups(
  workspace: Workspace,
  events: Event[],
  projects: Project[],
): Promise<{ notes: Note[]; tasks: Task[] }> {
  // only one-off events get follow-ups here — recurring anchors represent a
  // whole series, not a single occurrence, so linking a note/task to "the"
  // occurrence doesn't map cleanly onto the schema
  const oneOffEvents = events.filter((event) => event.reccurrenceRule === null);
  const shuffled = shuffle(oneOffEvents);

  const meetingNoteCount = Math.round(oneOffEvents.length * MEETING_NOTE_RATE);
  const followupTaskCount = Math.round(oneOffEvents.length * FOLLOWUP_TASK_EVENT_RATE);

  const eventsForNotes = shuffled.slice(0, meetingNoteCount);
  const eventsForTasks = shuffled.slice(meetingNoteCount, meetingNoteCount + followupTaskCount);

  const notes: Note[] = [];
  for (const event of eventsForNotes) {
    const note = await workspace.notes.createNote({
      title: `Notes: ${event.title}`,
      linkedEventId: event.id,
      projectId: chance(0.3) ? pick(projects).id : undefined,
    });
    await workspace.notes.updateNoteContent(note.id, meetingNoteContent(event));
    notes.push(note);
  }

  const tasks: Task[] = [];
  for (const event of eventsForTasks) {
    const followupCount = randomInt(1, 3);
    for (let i = 0; i < followupCount; i++) {
      const dueDate = addDays(event.startAt, randomInt(1, 10));
      const task = await workspace.tasks.createTask({
        title: `${pick(TASK_VERBS)} ${pick(TASK_OBJECTS)}`,
        description: `Follow-up from "${event.title}".`,
        priority: pickTaskPriority(),
        dueDate,
        linkedEventId: event.id,
        projectId: chance(0.4) ? pick(projects).id : undefined,
      });
      tasks.push(task);
    }
  }

  return { notes, tasks };
}

async function seedFreeformNotes(workspace: Workspace, projects: Project[]): Promise<Note[]> {
  const notes: Note[] = [];

  // project-scoped notes: a couple per project (design docs, context, etc.)
  for (const project of projects) {
    const count = randomInt(PROJECT_NOTES_PER_PROJECT[0], PROJECT_NOTES_PER_PROJECT[1]);
    for (let i = 0; i < count; i++) {
      const note = await workspace.notes.createNote({
        title: `${project.title}: ${pick(['Notes', 'Design doc', 'Context', 'Open questions', 'Plan'])}`,
        projectId: project.id,
      });
      await workspace.notes.updateNoteContent(note.id, projectNoteContent(project));
      notes.push(note);
    }
  }

  // freestanding notes: no project, no links — quick captures/reference
  for (let i = 0; i < FREESTANDING_NOTE_COUNT; i++) {
    const topic = pick(FREEFORM_NOTE_TOPICS);
    const note = await workspace.notes.createNote({ title: topic });
    // leave a few genuinely empty, like a title jotted down and never filled in
    if (chance(0.85)) {
      await workspace.notes.updateNoteContent(note.id, freeformNoteContent(topic));
    }
    notes.push(note);
  }

  return notes;
}

async function seedNoteDerivedTasks(workspace: Workspace, notes: Note[]): Promise<Task[]> {
  const candidates = shuffle(notes).slice(0, Math.round(notes.length * NOTE_DERIVED_TASK_RATE));
  const tasks: Task[] = [];

  for (const note of candidates) {
    const count = randomInt(1, 2);
    for (let i = 0; i < count; i++) {
      const task = await workspace.tasks.createTask({
        title: `${pick(TASK_VERBS)} ${pick(TASK_OBJECTS)}`,
        description: `Extracted from "${note.title}".`,
        priority: pickTaskPriority(),
        dueDate: pickTaskDueDate(),
        linkedNoteId: note.id,
        projectId: note.projectId ?? undefined,
      });
      tasks.push(task);
    }
  }

  return tasks;
}

async function seedTaskNotes(workspace: Workspace, tasks: Task[]): Promise<Note[]> {
  const candidates = shuffle(tasks).slice(0, Math.round(tasks.length * TASK_NOTE_RATE));
  const notes: Note[] = [];

  for (const task of candidates) {
    const note = await workspace.notes.createNote({
      title: task.title,
      linkedTaskId: task.id,
      projectId: task.projectId ?? undefined,
    });
    await workspace.notes.updateNoteContent(note.id, taskNoteContent(task));
    notes.push(note);
  }

  return notes;
}

async function seedSubtasks(workspace: Workspace, tasks: Task[]): Promise<Task[]> {
  const candidates = shuffle(tasks).slice(0, Math.round(tasks.length * SUBTASK_RATE));
  const subtasks: Task[] = [];

  for (const parent of candidates) {
    const count = randomInt(1, 3);
    for (let i = 0; i < count; i++) {
      const status =
        parent.status === TaskStatus.COMPLETED
          ? TaskStatus.COMPLETED
          : weightedPick<TaskStatus>([
              [TaskStatus.NOT_STARTED, 0.5],
              [TaskStatus.IN_PROGRESS, 0.3],
              [TaskStatus.COMPLETED, 0.2],
            ]);

      const subtask = await workspace.tasks.createSubtask(parent.id, {
        title: pick(SUBTASK_FRAGMENTS),
        status,
        priority: parent.priority,
      });
      subtasks.push(subtask);
    }
  }

  return subtasks;
}

// ---------------------------------------------------------------------------
// Linear
// ---------------------------------------------------------------------------

// Connects DEV_LINEAR_API_KEY's account, when it is set. A failed connect only warns: the seeded
// data is still useful without it. Returns a line for the summary; never prints the key.
async function connectLinear(workspace: Workspace): Promise<string> {
  if (!LINEAR_API_KEY) return 'not connected (DEV_LINEAR_API_KEY is unset)';

  console.log('Connecting Linear...');
  try {
    const integration = await workspace.integrations.connectWithApiKey(
      Provider.LINEAR,
      LINEAR_API_KEY,
    );
    return `connected as ${integration.accountLabel} (${integration.id})`;
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.warn(`Connecting Linear failed, so the workspace is not connected. ${message}`);
    return 'not connected (connect failed)';
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startedAt = Date.now();

  const alreadyExists = await fs
    .stat(ROOT_PATH)
    .then(() => true)
    .catch(() => false);

  if (alreadyExists && !RESET) {
    console.error(`A directory already exists at ${ROOT_PATH}.`);
    console.error('Re-run with --reset to wipe and recreate it.');
    process.exit(1);
  }

  process.env.DB_MIGRATIONS_PATH = MIGRATIONS_PATH;

  console.log(`Seeding dev workspace at ${ROOT_PATH}${RESET ? ' (--reset)' : ''} [seed=${SEED}]`);

  const devBrain = await initDevBrain({
    path: ROOT_PATH,
    overwrite: RESET,
    workspace: { cipher: devCipher, fetch },
  });
  const workspace = await devBrain.workspaces.create({
    name: WORKSPACE_NAME,
    color: pick(PALETTE),
  });

  try {
    console.log('Creating projects...');
    const projects = await seedProjects(workspace);

    console.log('Creating events...');
    const events = await seedEvents(workspace);

    console.log('Creating regular tasks...');
    const regularTasks = await seedRegularTasks(workspace, projects);

    console.log('Creating meeting notes and event follow-up tasks...');
    const eventFollowups = await seedEventFollowups(workspace, events, projects);

    console.log('Creating project and freestanding notes...');
    const freeformNotes = await seedFreeformNotes(workspace, projects);

    console.log('Creating tasks derived from notes...');
    const noteDerivedTasks = await seedNoteDerivedTasks(workspace, freeformNotes);

    const topLevelTasks = [...regularTasks, ...eventFollowups.tasks, ...noteDerivedTasks];

    console.log('Creating task notes...');
    const taskNotes = await seedTaskNotes(workspace, topLevelTasks);

    console.log('Creating subtasks...');
    const subtasks = await seedSubtasks(workspace, topLevelTasks);

    const allNotes = [...eventFollowups.notes, ...freeformNotes, ...taskNotes];
    const allTasks = [...topLevelTasks, ...subtasks];

    console.log('Indexing everything for search...');
    workspace.search.indexProjects(projects);
    workspace.search.indexEvents(events);
    workspace.search.indexTasks(allTasks);
    await workspace.search.indexNotes(allNotes);

    const linear = await connectLinear(workspace);

    workspace.close();

    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log('');
    console.log('Done.');
    console.table({
      projects: projects.length,
      events: events.length,
      'tasks (top-level)': topLevelTasks.length,
      'tasks (subtasks)': subtasks.length,
      'tasks (total)': allTasks.length,
      'notes (total)': allNotes.length,
    });
    console.log(`Linear: ${linear}`);
    console.log(`Workspace: ${WORKSPACE_NAME} (${workspace.info.id})`);
    console.log(`Path: ${ROOT_PATH}`);
    console.log(`Elapsed: ${elapsedSeconds}s`);
  } catch (err) {
    workspace.close();
    throw err;
  }
}

main().catch((err) => {
  console.error('Failed to seed dev workspace:');
  console.error(err);
  process.exit(1);
});
