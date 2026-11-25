/*
 * Sandbox: ways to give a note's Tasks and Mentioned in their place without taking room under the
 * editor. Mock data only.
 */
import { useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskStatus } from '@common/types';
import { AtSign, CircleCheck, Plus } from 'lucide-react';
import { Button } from '../../../ui/Button';
import { DetailSection } from '../../../detail/DetailSection';
import { EditorContent } from '../../../editor/EditorContent';
import { EntityPill } from '../../../entities/EntityPill';
import { IconButton } from '../../../ui/IconButton';
import { LinkedTaskRow } from '../../../lists/LinkedTaskRow';
import { SheetDivider, SheetHeader, SheetItemTitle } from '../../../ui/Sheet';
import { Badge } from '../../../ui/Badge';
import { Heading } from '../../../layout/Heading';
import { StatusIcon } from '../../../entities/StatusIcon';
import { PKCE_DESCRIPTION } from '../../TaskDetail/data';
import { TaskList } from '../../../lists/TaskList';
import { MentionList, MentionsPill, TasksPill } from './MentionsSection';
import { DetailScreen, DockedSheet, NoteHead } from './frame';
import {
  ADR_MENTIONS,
  ADR_TASK_ROWS,
  ADR_TASKS,
  ADR_TITLE,
  PKCE_MENTIONS,
  PKCE_TITLE,
} from './data';
import { MentionsSection } from './MentionsSection';

const meta = {
  title: 'Sandbox/Mentions/Note layouts',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Body() {
  return (
    <EditorContent style={{ marginTop: 32 }}>
      <p>
        Status: accepted. The implicit flow returns tokens in the URL fragment, where they leak into
        browser history, logs and referrer headers.
      </p>
      <h2>Decision</h2>
      <p>Every first-party client moves to the authorization code flow with PKCE:</p>
      <ul>
        <li>Use the S256 challenge method and reject plain challenges.</li>
        <li>Generate a new 96-character code verifier for every sign-in.</li>
        <li>Expire authorization codes after 10 minutes.</li>
      </ul>
      <h2>Consequences</h2>
      <p>
        Mobile clients need a fallback for in-app browsers that block the custom-scheme redirect.
        The implicit flow stays behind a feature flag for one release, then is removed.
      </p>
    </EditorContent>
  );
}

const projectPill = (
  <EntityPill entity={{ type: 'project', title: 'Auth Overhaul', color: 'blue' }} />
);

function TaskRows() {
  return (
    <div>
      {ADR_TASK_ROWS.map((t) => (
        <LinkedTaskRow key={t.title} task={t} onOpen={() => undefined} />
      ))}
    </div>
  );
}

/**
 * A: a side panel. The text keeps the page; Tasks and Mentioned in sit in a quiet column on the
 * right.
 */
export const SidePanel: Story = {
  name: 'A – Side panel',
  render: () => (
    <DetailScreen
      page="Notes"
      title={ADR_TITLE}
      aside={
        <aside
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            flex: 'none',
            width: 320,
            padding: '48px 16px 16px',
            borderLeft: '1px solid var(--border)',
          }}
        >
          <DetailSection
            title="Tasks"
            count={2}
            action={<IconButton size="sm" tone="muted" icon={Plus} label="New task" />}
          >
            <TaskRows />
          </DetailSection>
          <DetailSection title="Mentioned in" count={ADR_MENTIONS.length}>
            <MentionList mentions={ADR_MENTIONS} />
          </DetailSection>
        </aside>
      }
    >
      <NoteHead title={ADR_TITLE} pills={projectPill} />
      <Body />
    </DetailScreen>
  ),
};

/**
 * B (chosen): pills in the note's header. "2 tasks" and "4 mentions" sit with the project; each
 * opens its list in a popover. Nothing under the text, and a task page does the same.
 */
export const HeaderPills: Story = {
  name: 'B – Header pills',
  render: () => (
    <DetailScreen page="Notes" title={ADR_TITLE}>
      <NoteHead
        title={ADR_TITLE}
        pills={
          <>
            {projectPill}
            <TasksPill tasks={ADR_TASK_ROWS} label="2 tasks · 1 in progress" />
            <MentionsPill mentions={ADR_MENTIONS} defaultOpen />
          </>
        }
      />
      <Body />
    </DetailScreen>
  ),
};

type Tab = 'tasks' | 'mentions';

function FooterTabs() {
  const [open, setOpen] = useState<Tab | null>('mentions');
  const toggle = (tab: Tab) => setOpen(open === tab ? null : tab);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
      <SheetDivider />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Button
          size="xs"
          variant={open === 'tasks' ? 'secondary' : 'ghost'}
          icon={CircleCheck}
          onClick={() => toggle('tasks')}
        >
          Tasks 2
        </Button>
        <Button
          size="xs"
          variant={open === 'mentions' ? 'secondary' : 'ghost'}
          icon={AtSign}
          onClick={() => toggle('mentions')}
        >
          Mentioned in {ADR_MENTIONS.length}
        </Button>
        {open === 'tasks' && (
          <Button size="xs" icon={Plus} style={{ marginLeft: 'auto' }}>
            New Task
          </Button>
        )}
      </div>
      {open === 'tasks' && <TaskList selectionBar={false} tasks={ADR_TASKS} />}
      {open === 'mentions' && <MentionList mentions={ADR_MENTIONS} />}
    </div>
  );
}

/**
 * C: one bar under the text. Tasks and Mentioned in are tabs, closed until picked, so the note
 * ends with a single line.
 */
export const FooterBar: Story = {
  name: 'C – Footer tabs',
  render: () => (
    <DetailScreen page="Notes" title={ADR_TITLE}>
      <NoteHead title={ADR_TITLE} pills={projectPill} />
      <Body />
      <FooterTabs />
    </DetailScreen>
  ),
};

/** The note in the sheet, as the app's note sheet draws it, with its Tasks and mentions folded under it. */
function NoteSheetBody({ open }: { open: 'none' | 'mentions' }) {
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <SheetItemTitle>{ADR_TITLE}</SheetItemTitle>
        <span style={{ color: 'var(--subtle-foreground)', fontSize: 12, lineHeight: '16px' }}>
          Edited yesterday
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{projectPill}</div>
      <SheetDivider />
      <EditorContent>
        <p>
          Status: accepted. The implicit flow returns tokens in the URL fragment, where they leak
          into browser history, logs and referrer headers.
        </p>
        <h2>Decision</h2>
        <ul>
          <li>Use the S256 challenge method and reject plain challenges.</li>
          <li>Generate a new 96-character code verifier for every sign-in.</li>
          <li>Expire authorization codes after 10 minutes.</li>
        </ul>
      </EditorContent>
      <SheetDivider />
      <DetailSection
        collapsible
        defaultOpen={false}
        title="Tasks"
        count={<Badge variant="secondary">2</Badge>}
        action={<IconButton size="sm" tone="muted" icon={Plus} label="New task" />}
      >
        <TaskRows />
      </DetailSection>
      <DetailSection
        collapsible
        defaultOpen={open === 'mentions'}
        title="Mentioned in"
        count={<Badge variant="secondary">{ADR_MENTIONS.length}</Badge>}
      >
        <MentionList mentions={ADR_MENTIONS} />
      </DetailSection>
    </>
  );
}

/** The task page behind the sheet: the note was opened from its Mentioned in. */
function TaskBehind({ children }: { children: ReactNode }) {
  return (
    <DetailScreen page="Tasks" title={PKCE_TITLE}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <Heading level={1} variant="document">
          {PKCE_TITLE}
        </Heading>
        <div style={{ display: 'flex', gap: 8 }}>
          <EntityPill glyph={<StatusIcon status={TaskStatus.IN_PROGRESS} size={12} />}>
            In progress
          </EntityPill>
          <EntityPill entity={{ type: 'project', title: 'Auth Overhaul', color: 'blue' }} />
        </div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: '20px' }}>{PKCE_DESCRIPTION[0]}</p>
        <MentionsSection mentions={PKCE_MENTIONS} />
      </div>
      {children}
    </DetailScreen>
  );
}

/**
 * The note sheet (a note opened beside a page: here from the task's Mentioned in) with its Tasks
 * and Mentioned in under the note, folded to one line each until opened.
 */
export const NoteSheet: Story = {
  name: 'Note sheet – folded',
  render: () => (
    <TaskBehind>
      <DockedSheet header={<SheetHeader onOpenAsPage={() => undefined}>Note</SheetHeader>}>
        <NoteSheetBody open="none" />
      </DockedSheet>
    </TaskBehind>
  ),
};

export const NoteSheetMentionsOpen: Story = {
  name: 'Note sheet – mentions open',
  render: () => (
    <TaskBehind>
      <DockedSheet header={<SheetHeader onOpenAsPage={() => undefined}>Note</SheetHeader>}>
        <NoteSheetBody open="mentions" />
      </DockedSheet>
    </TaskBehind>
  ),
};
