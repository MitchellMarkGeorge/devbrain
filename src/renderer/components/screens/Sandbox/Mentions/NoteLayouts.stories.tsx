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
import { LinkedTaskRow, type LinkedTaskRowData } from '../../../lists/LinkedTaskRow';
import { Popover, PopoverContent, PopoverTrigger } from '../../../ui/Popover';
import { SheetDivider, SheetHeader } from '../../../ui/Sheet';
import { TaskList } from '../../../lists/TaskList';
import { storyDate } from '../../../lib/story-dates';
import { MentionList } from './MentionsSection';
import { DetailScreen, DockedSheet, NoteHead } from './frame';
import { ADR_MENTIONS, ADR_TASKS, ADR_TITLE } from './data';

const meta = {
  title: 'Sandbox/Mentions/Note layouts',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const TASK_ROWS: LinkedTaskRowData[] = [
  { title: 'Implement OAuth2 PKCE flow', status: TaskStatus.IN_PROGRESS, dueDate: storyDate(2) },
  { title: 'Write PKCE migration guide', status: TaskStatus.NOT_STARTED, dueDate: storyDate(6) },
];

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
      {TASK_ROWS.map((t) => (
        <LinkedTaskRow key={t.title} task={t} onOpen={() => undefined} />
      ))}
    </div>
  );
}

/**
 * A: a side panel. The text keeps the page; Tasks and Mentioned in sit in a quiet column on the
 * right, each line under its title.
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
            <MentionList selfLabel="this note" mentions={ADR_MENTIONS} layout="stacked" />
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
 * B: pills in the note's header. "2 tasks" and "4 mentions" sit with the project; each opens
 * its list in a popover. Nothing under the text.
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
            <Popover>
              <PopoverTrigger render={<EntityPill glyph={CircleCheck} />}>
                2 tasks · 1 in progress
              </PopoverTrigger>
              <PopoverContent size="auto" style={{ width: 360 }}>
                <TaskRows />
              </PopoverContent>
            </Popover>
            <Popover defaultOpen>
              <PopoverTrigger render={<EntityPill glyph={AtSign} />}>
                {ADR_MENTIONS.length} mentions
              </PopoverTrigger>
              <PopoverContent size="auto" style={{ width: 380 }} initialFocus={false}>
                <MentionList selfLabel="this note" mentions={ADR_MENTIONS} layout="stacked" />
              </PopoverContent>
            </Popover>
          </>
        }
      />
      <Body />
    </DetailScreen>
  ),
};

type SheetView = 'tasks' | 'mentions';

/** A header pill that opens a view in the sheet; filled while its view is open. */
function SheetPill({
  glyph,
  active,
  onClick,
  children,
}: {
  glyph: typeof AtSign;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <EntityPill
      glyph={glyph}
      onClick={onClick}
      style={
        active ? { background: 'var(--pill-fill-hover)', color: 'var(--foreground)' } : undefined
      }
    >
      {children}
    </EntityPill>
  );
}

function NoteWithSheet({ initial }: { initial: SheetView }) {
  const [view, setView] = useState<SheetView | null>(initial);
  const toggle = (next: SheetView) => setView(view === next ? null : next);
  return (
    <DetailScreen page="Notes" title={ADR_TITLE}>
      <NoteHead
        title={ADR_TITLE}
        pills={
          <>
            {projectPill}
            <SheetPill
              glyph={CircleCheck}
              active={view === 'tasks'}
              onClick={() => toggle('tasks')}
            >
              2 tasks · 1 in progress
            </SheetPill>
            <SheetPill
              glyph={AtSign}
              active={view === 'mentions'}
              onClick={() => toggle('mentions')}
            >
              {ADR_MENTIONS.length} mentions
            </SheetPill>
          </>
        }
      />
      <Body />
      <DockedSheet
        open={view != null}
        onOpenChange={(open) => !open && setView(null)}
        header={<SheetHeader>{view === 'tasks' ? 'Tasks' : 'Mentioned in'}</SheetHeader>}
      >
        {view === 'mentions' && (
          <MentionList
            selfLabel="this note"
            mentions={ADR_MENTIONS}
            layout="stacked"
            wrap
            limit={50}
          />
        )}
        {view === 'tasks' && (
          <>
            <TaskRows />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="xs" icon={Plus}>
                New Task
              </Button>
              <Button size="xs" variant="ghost">
                Link Task
              </Button>
            </div>
          </>
        )}
      </DockedSheet>
    </DetailScreen>
  );
}

/**
 * B in the sheet: the header pills open their list in the docked sheet beside the note, rather
 * than a popover. The open pill stays filled; clicking it again closes the sheet. A row opens its
 * item in the same sheet.
 */
export const HeaderPillsSheetMentions: Story = {
  name: 'B – Header pills, mentions in the sheet',
  render: () => <NoteWithSheet initial="mentions" />,
};

export const HeaderPillsSheetTasks: Story = {
  name: 'B – Header pills, tasks in the sheet',
  render: () => <NoteWithSheet initial="tasks" />,
};

function FooterTabs() {
  const [open, setOpen] = useState<SheetView | null>('mentions');
  const toggle = (tab: SheetView) => setOpen(open === tab ? null : tab);
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
      {open === 'mentions' && <MentionList selfLabel="this note" mentions={ADR_MENTIONS} />}
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
