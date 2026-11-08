import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskPriority, TaskStatus } from '@common/types';
import {
  ArrowUpDown,
  CircleCheck,
  Ellipsis,
  Folder,
  LayoutGrid,
  List,
  ListFilter,
  Plus,
  Star,
} from 'lucide-react';
import { Breadcrumb } from '../../ui/Breadcrumb';
import { Button } from '../../ui/Button';
import { GroupHeading } from '../../lists/GroupHeading';
import { ProjectCard } from '../../projects/ProjectCard';
import { AUTH_OVERHAUL, SAMPLE_PROJECTS } from '../../projects/ProjectCard/fixtures';
import { ProjectHeader } from '../../projects/ProjectHeader';
import { StatusIcon } from '../../entities/StatusIcon';
import { TaskList } from '../../lists/TaskList';
import type { TaskRowData } from '../../lists/TaskRow';
import { ToggleGroup } from '../../ui/ToggleGroup';
import { AppFrame, PageHeader, Spacer } from '../Calendar/AppFrame';
import {
  sampleEventLink,
  sampleLinear,
  sampleNoteLink,
  sampleTask,
} from '../../lists/TaskRow/fixtures';
import { storyDate } from '../../lib/story-dates';
import type { TaskId } from '@common/ids';

const meta = {
  title: 'Screens/Projects/Projects',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const crumbHeader = { height: 48, borderBottom: 0 } as const;
const crumbTitle = { font: 'inherit', letterSpacing: 'normal' } as const;

/** Figma "Projects (cards)" (7158:15487) */
export const Cards: Story = {
  render: () => (
    <AppFrame page="Projects">
      <PageHeader
        style={crumbHeader}
        title={
          <span style={crumbTitle}>
            <Breadcrumb
              items={[
                { label: 'Projects', href: '#' },
                { label: 'Cards', icon: LayoutGrid },
              ]}
            />
          </span>
        }
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 24px 12px' }}>
        <Button variant="outline" icon={ListFilter} value="Active">
          Filter
        </Button>
        <Spacer />
        <Button variant="outline" icon={ArrowUpDown} value="Due date">
          Sort
        </Button>
        <ToggleGroup
          aria-label="Layout"
          defaultValue="cards"
          style={{ alignSelf: 'center' }}
          items={[
            { value: 'list', icon: List, label: undefined },
            { value: 'cards', icon: LayoutGrid, label: undefined },
          ]}
        />
        <Button variant="outline" icon={Plus}>
          New Project
        </Button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 16,
          padding: '4px 24px 24px',
          alignContent: 'start',
        }}
      >
        {SAMPLE_PROJECTS.slice(0, 5).map((sample) => (
          <ProjectCard key={sample.project.title} {...sample} />
        ))}
      </div>
    </AppFrame>
  ),
};

const IN_PROGRESS: TaskRowData[] = [
  sampleTask({
    id: 'tsk_124' as TaskId,
    title: 'Implement OAuth2 PKCE flow',
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.HIGH,
    dueDate: storyDate(2),
    external: sampleLinear('ENG-124'),
    subtaskProgress: { completed: 3, total: 4 },
    link: sampleEventLink('Mitchell / Jesse 1:1', 'green'),
  }),
  sampleTask({
    id: 'tsk_131' as TaskId,
    title: 'Refactor token refresh logic',
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.HIGH,
    dueDate: storyDate(-4),
    external: sampleLinear('ENG-131'),
  }),
];

const NOT_STARTED: TaskRowData[] = [
  sampleTask({
    id: 'tsk_118' as TaskId,
    title: 'Audit token storage',
    priority: TaskPriority.HIGH,
    dueDate: storyDate(-3),
    external: sampleLinear('ENG-118'),
  }),
  sampleTask({
    id: 'tsk_guide' as TaskId,
    title: 'Write PKCE migration guide',
    priority: TaskPriority.MEDIUM,
    dueDate: storyDate(0),
    link: sampleNoteLink('PKCE design notes'),
  }),
  sampleTask({
    id: 'tsk_138' as TaskId,
    title: 'Add PKCE end-to-end tests',
    priority: TaskPriority.MEDIUM,
    dueDate: storyDate(4),
    external: sampleLinear('ENG-138'),
  }),
  sampleTask({
    id: 'tsk_133' as TaskId,
    title: 'Rotate token signing keys',
    priority: TaskPriority.MEDIUM,
    dueDate: storyDate(7),
    external: sampleLinear('ENG-133'),
  }),
  sampleTask({
    id: 'tsk_135' as TaskId,
    title: 'Update SDK docs for PKCE',
    dueDate: storyDate(8),
    external: sampleLinear('ENG-135'),
  }),
  sampleTask({
    id: 'tsk_137' as TaskId,
    title: 'Remove implicit grant endpoint',
    priority: TaskPriority.MEDIUM,
    dueDate: storyDate(9),
    external: sampleLinear('ENG-137'),
  }),
  sampleTask({
    id: 'tsk_139' as TaskId,
    title: 'Notify partners of auth change',
    dueDate: storyDate(9),
    external: sampleLinear('ENG-139'),
  }),
];

/** Figma "Project (overview)" (7159:12540) */
export const Overview: Story = {
  render: () => (
    <AppFrame page="Projects">
      <PageHeader
        style={crumbHeader}
        title={
          <span style={crumbTitle}>
            <Breadcrumb
              items={[
                { label: 'Projects', href: '#' },
                { label: 'Auth Overhaul', icon: Folder, iconColor: 'var(--swatch-blue)' },
              ]}
            />
          </span>
        }
      >
        <Spacer />
        <Button variant="ghost" size="icon-sm" icon={Star} aria-label="Add to favorites" />
        <Button variant="ghost" size="icon-sm" icon={Ellipsis} aria-label="Project menu" />
      </PageHeader>
      <div style={{ padding: '0 24px' }}>
        <ToggleGroup
          aria-label="Project section"
          variant="outline"
          defaultValue="overview"
          items={[
            { value: 'overview', label: 'Overview' },
            { value: 'tasks', label: 'Tasks' },
            { value: 'notes', label: 'Notes' },
          ]}
        />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '32px 64px' }}>
        <ProjectHeader
          {...AUTH_OVERHAUL}
          description={
            <>
              <p>
                The implicit grant is deprecated under OAuth 2.1 and the OAuth 2.0 Security Best
                Current Practice: access tokens come back in the redirect URI fragment, where
                browser history, referrer headers and scripts on the page can leak them. PKCE closes
                that gap. The client commits to a code verifier before the request and proves it
                holds it at the token exchange, so an intercepted code is useless.
              </p>
              <p>
                Our web and mobile clients still use the implicit flow, and it is a finding in every
                security review. This project moves every first-party client to the code flow with
                PKCE (S256) and retires the implicit grant by Jul 1.
              </p>
            </>
          }
        />
        <div style={{ marginTop: 24 }}>
          <GroupHeading
            label="In progress"
            icon={<StatusIcon status={TaskStatus.IN_PROGRESS} />}
            tint="var(--status-in-progress-tint)"
            count={2}
          />
          <TaskList tasks={IN_PROGRESS} />
          <GroupHeading
            label="Not started"
            icon={<StatusIcon status={TaskStatus.NOT_STARTED} />}
            count={7}
            onAddTask={() => {}}
          />
          <TaskList tasks={NOT_STARTED} />
          <GroupHeading
            label="Completed"
            icon={CircleCheck}
            iconColor="var(--status-completed)"
            tint="var(--status-completed-tint)"
            count={3}
            collapsed
          />
        </div>
      </div>
    </AppFrame>
  ),
};
