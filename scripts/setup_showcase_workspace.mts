import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openDevBrain } from '@main/core';
import { openElectronSettingsStore } from '@main/runtime/settings-store';
import { devCipher } from '@main/runtime/dev-cipher';
import { type Project, ProjectStatus, TaskPriority, TaskStatus } from '@common/types';
import type { Workspace } from '@main/core/workspace/workspace';

/**
 * Makes a small, hand-written workspace for the website's screenshots of the app
 * (e2e/screenshots, website/README.md): a few projects, tasks, notes and a week of meetings that
 * read like one person's real work, where `seed:dev` makes hundreds of generated rows for testing.
 * Every date is relative to the day it runs, so the screenshots always show "this week".
 *
 * It goes through the same services as the app, as `seed:dev` does.
 *
 *   tsx scripts/run-with-vite.mts scripts/setup_showcase_workspace.mts --path <folder> [--name Acme]
 *
 * The folder must not exist yet.
 */

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_PATH = path.join(SCRIPT_DIR, '..', 'src/main/db/migrations');

const argv = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
};

const ROOT_PATH = option('path');
const WORKSPACE_NAME = option('name') ?? 'Acme';

// --- Dates, relative to today ---------------------------------------------------------------

const today = new Date();
today.setHours(0, 0, 0, 0);

function day(offset: number): Date {
  const date = new Date(today);
  date.setDate(date.getDate() + offset);
  return date;
}

/** Monday of this week, plus `offset` days: meetings land on the week the calendar opens on */
function weekday(offset: number, hour: number, minute = 0): Date {
  const monday = day(-((today.getDay() + 6) % 7));
  const date = new Date(monday);
  date.setDate(date.getDate() + offset);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function minutesAfter(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

// --- The workspace --------------------------------------------------------------------------

const { NOT_STARTED, IN_PROGRESS, COMPLETED } = TaskStatus;
const { LOW, MEDIUM, HIGH } = TaskPriority;

function seedProjects(workspace: Workspace) {
  const create = (
    title: string,
    description: string,
    color: string,
    status: ProjectStatus,
    start: number,
    due: number,
  ): Project =>
    workspace.projects.createProject({
      title,
      description,
      color,
      status,
      startDate: day(start),
      dueDate: day(due),
    });

  return {
    billing: create(
      'Billing v2',
      'Move subscriptions to usage-based billing, with invoices customers can read.',
      '#6366f1',
      ProjectStatus.ACTIVE,
      -24,
      18,
    ),
    api: create(
      'Public API',
      'A versioned REST API with keys, rate limits and docs, for the integrations partners keep asking for.',
      '#22c55e',
      ProjectStatus.ACTIVE,
      -10,
      40,
    ),
    onboarding: create(
      'Mobile onboarding',
      'Get a new user from install to their first synced project in under two minutes.',
      '#f97316',
      ProjectStatus.ACTIVE,
      -5,
      30,
    ),
    docs: create(
      'Docs refresh',
      'Rewrite the getting-started guide and move the docs to the new site.',
      '#06b6d4',
      ProjectStatus.NOT_STARTED,
      12,
      55,
    ),
  };
}

async function seedWorkspace(workspace: Workspace) {
  const projects = seedProjects(workspace);

  type TaskDef = {
    title: string;
    project?: Project;
    status?: TaskStatus;
    priority?: (typeof TaskPriority)['LOW' | 'MEDIUM' | 'HIGH'];
    due?: number | null;
    pr?: string;
    subtasks?: { title: string; status?: TaskStatus }[];
  };
  const tasks: TaskDef[] = [
    {
      title: 'Ship proration for mid-cycle plan changes',
      project: projects.billing,
      status: IN_PROGRESS,
      priority: HIGH,
      due: 1,
      pr: 'https://github.com/acme/billing/pull/412',
      subtasks: [
        { title: 'Credit unused days on downgrade', status: COMPLETED },
        { title: 'Charge the difference on upgrade', status: IN_PROGRESS },
        { title: 'Show the proration on the invoice preview' },
      ],
    },
    {
      title: 'Backfill usage records for October',
      project: projects.billing,
      status: IN_PROGRESS,
      priority: MEDIUM,
      due: 0,
    },
    {
      title: 'Review the invoice email template',
      project: projects.billing,
      priority: MEDIUM,
      due: 2,
    },
    {
      title: 'Migrate Stripe webhooks to the new endpoint',
      project: projects.billing,
      status: COMPLETED,
      priority: HIGH,
      due: -3,
      pr: 'https://github.com/acme/billing/pull/398',
    },
    {
      title: 'Add usage meters to the pricing page',
      project: projects.billing,
      status: COMPLETED,
      priority: MEDIUM,
      due: -6,
    },
    {
      title: 'Store invoices as PDFs in object storage',
      project: projects.billing,
      status: COMPLETED,
      priority: LOW,
      due: -8,
      pr: 'https://github.com/acme/billing/pull/377',
    },
    {
      title: 'Write the billing runbook for on-call',
      project: projects.billing,
      priority: LOW,
      due: 9,
    },
    {
      title: 'Design API key scopes',
      project: projects.api,
      status: IN_PROGRESS,
      priority: HIGH,
      due: 3,
      subtasks: [
        { title: 'Read-only and read-write scopes', status: COMPLETED },
        { title: 'Per-project keys' },
      ],
    },
    {
      title: 'Rate limit by key, not by IP',
      project: projects.api,
      priority: HIGH,
      due: 6,
    },
    {
      title: 'Generate the OpenAPI spec from the routes',
      project: projects.api,
      priority: MEDIUM,
      due: 8,
    },
    {
      title: 'Pick a versioning scheme',
      project: projects.api,
      status: COMPLETED,
      priority: MEDIUM,
      due: -2,
    },
    {
      title: 'Cut the sign-up form to two fields',
      project: projects.onboarding,
      status: IN_PROGRESS,
      priority: MEDIUM,
      due: 4,
    },
    {
      title: 'Prototype the first-project template picker',
      project: projects.onboarding,
      priority: MEDIUM,
      due: 7,
    },
    {
      title: 'Instrument time to first sync',
      project: projects.onboarding,
      priority: LOW,
      due: 10,
    },
    {
      title: 'Outline the new getting-started guide',
      project: projects.docs,
      priority: LOW,
      due: 14,
    },
    { title: 'Reply to the security questionnaire', priority: HIGH, due: 1 },
    { title: 'Renew the code-signing certificate', priority: MEDIUM, due: 5 },
    { title: 'Update Node to 24 in CI', status: COMPLETED, priority: LOW, due: -1 },
    { title: 'Read the Postgres 18 release notes', priority: LOW, due: null },
  ];

  for (const def of tasks) {
    const task = workspace.tasks.createTask({
      title: def.title,
      status: def.status ?? NOT_STARTED,
      priority: def.priority ?? MEDIUM,
      dueDate: def.due === undefined || def.due === null ? null : day(def.due),
      projectId: def.project?.id,
      pullRequestUrl: def.pr,
    });
    for (const subtask of def.subtasks ?? []) {
      workspace.tasks.createSubtask(task.id, {
        title: subtask.title,
        status: subtask.status ?? NOT_STARTED,
      });
    }
  }

  // A week of meetings: a daily standup, and the one-offs around this week's work
  const standupStart = weekday(0, 9, 30);
  workspace.events.createEvent({
    title: 'Standup',
    startAt: standupStart,
    endAt: minutesAfter(standupStart, 15),
    recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    meetingUrl: 'https://meet.example.com/standup',
    color: '#14b8a6',
  });
  const meetings: { title: string; start: Date; minutes: number; color: string }[] = [
    { title: 'Sprint planning', start: weekday(0, 11), minutes: 60, color: '#6366f1' },
    { title: 'Billing v2 design review', start: weekday(1, 14), minutes: 60, color: '#6366f1' },
    { title: '1:1 with Priya', start: weekday(1, 16), minutes: 30, color: '#a855f7' },
    { title: 'Focus: API keys', start: weekday(2, 13), minutes: 120, color: '#22c55e' },
    { title: 'Customer call: Northwind', start: weekday(3, 11), minutes: 45, color: '#f97316' },
    { title: 'Onboarding usability test', start: weekday(3, 15), minutes: 60, color: '#f97316' },
    { title: 'Demo day', start: weekday(4, 15), minutes: 60, color: '#ec4899' },
    { title: 'Focus: proration', start: weekday(4, 10, 30), minutes: 90, color: '#6366f1' },
    { title: 'Architecture review', start: weekday(0, 14), minutes: 90, color: '#06b6d4' },
    { title: 'Pairing: webhooks', start: weekday(1, 10, 30), minutes: 60, color: '#6366f1' },
    { title: 'Interview: backend', start: weekday(2, 11), minutes: 60, color: '#a855f7' },
    { title: 'API docs review', start: weekday(2, 16), minutes: 45, color: '#22c55e' },
    { title: 'Focus: rate limits', start: weekday(3, 13), minutes: 90, color: '#22c55e' },
    { title: 'Retro', start: weekday(4, 13, 30), minutes: 45, color: '#14b8a6' },
  ];
  for (const meeting of meetings) {
    workspace.events.createEvent({
      title: meeting.title,
      startAt: meeting.start,
      endAt: minutesAfter(meeting.start, meeting.minutes),
      color: meeting.color,
    });
  }

  // Notes
  await workspace.notes.createNote({
    title: 'Proration rules',
    projectId: projects.billing.id,
    content: [
      'How a plan change in the middle of a billing cycle is charged, as agreed in the Billing v2 design review.',
      '',
      '> [!NOTE]',
      '> These rules apply to monthly plans. Annual plans are still open (below).',
      '',
      '## Upgrades',
      '',
      '- Charge the difference for the days left in the cycle, **today**.',
      '- The new limits apply at once.',
      '',
      '## Downgrades',
      '',
      '- Credit the unused days to the next invoice; never refund to the card.',
      '- The old limits stay until the cycle ends.',
      '',
      '## Examples',
      '',
      '| Change | Day of cycle | Charged today | Credited |',
      '| --- | --- | --- | --- |',
      '| Starter → Team | 10 of 30 | $26.67 | n/a |',
      '| Team → Starter | 20 of 30 | n/a | $13.33 |',
      '| Team → Business | 1 of 30 | $96.67 | n/a |',
      '',
      '```ts',
      'const credit = (unusedDays / cycleDays) * oldPlan.price;',
      'const charge = (unusedDays / cycleDays) * (newPlan.price - oldPlan.price);',
      '```',
      '',
      '## Open questions',
      '',
      '- [ ] Annual plans: prorate by day or by month?',
      '- [x] Taxes follow the line item, not the invoice',
      '- [x] Show the proration on the invoice preview',
    ].join('\n'),
  });
  await workspace.notes.createNote({
    title: 'Invoice email copy',
    projectId: projects.billing.id,
    content: [
      'Subject: Your Acme invoice for {month}',
      '',
      'Lead with the total and the due date; the line items follow.',
    ].join('\n'),
  });
  await workspace.notes.createNote({
    title: 'Billing v2 launch checklist',
    projectId: projects.billing.id,
    content: [
      '- [x] Webhooks on the new endpoint',
      '- [ ] Proration live behind a flag',
      '- [ ] Runbook for on-call',
      '- [ ] Announce in the changelog',
    ].join('\n'),
  });
  await workspace.notes.createNote({
    title: 'API versioning decision',
    projectId: projects.api.id,
    content: [
      'We version the public API by date in a header, as Stripe does: `Acme-Version: 2026-11-01`.',
      '',
      '- A key is pinned to the version it was created on.',
      '- Breaking changes ship as a new version; old ones keep working for 12 months.',
      '- The URL stays `/v1/…` until we need a clean break.',
    ].join('\n'),
  });
  await workspace.notes.createNote({
    title: 'Onboarding usability test: script',
    projectId: projects.onboarding.id,
    content: [
      '1. Install the app from the store link.',
      '2. Sign up, and create a first project from a template.',
      '3. Connect GitHub, and wait for the first sync.',
      '',
      'Watch for where they stop to read. Time each step.',
    ].join('\n'),
  });
  await workspace.notes.createNote({
    title: 'Weekly notes',
    content: [
      '## This week',
      '',
      '- Proration ships Friday if the design review agrees.',
      '- API keys: scopes are settled; per-project keys next.',
      '',
      '## Next week',
      '',
      '- Start the docs refresh outline.',
    ].join('\n'),
  });
  await workspace.notes.createNote({
    title: 'Postgres upgrade checklist',
    content: [
      '- [x] Read the release notes',
      '- [ ] Try `pg_upgrade --check` on a snapshot',
      '- [ ] Schedule the maintenance window',
    ].join('\n'),
  });
}

async function main() {
  if (!ROOT_PATH) {
    console.error('Usage: setup_showcase_workspace.mts --path <folder> [--name <name>]');
    process.exit(1);
  }
  const root = path.resolve(ROOT_PATH);
  if (
    await fs.stat(root).then(
      () => true,
      () => false,
    )
  ) {
    console.error(`${root} already exists`);
    process.exit(1);
  }
  const devBrain = await openDevBrain({
    settingsStore: openElectronSettingsStore,
    path: root,
    createIfMissing: true,
    workspace: { migrationsPath: MIGRATIONS_PATH, cipher: devCipher, fetch },
  });
  try {
    const created = await devBrain.workspaces.create({ name: WORKSPACE_NAME, color: '#6366f1' });
    const workspace = await devBrain.workspaces.open(created.id);
    // search indexes each row as its service creates it (Workspace)
    await seedWorkspace(workspace);
  } finally {
    await devBrain.close();
  }
  console.log(`Showcase workspace "${WORKSPACE_NAME}" at ${root}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
