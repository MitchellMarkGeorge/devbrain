import type { Meta, StoryObj } from '@storybook/react-vite';
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
import { GroupHeading } from '../../ui/GroupHeading';
import { ProjectCard } from '../../ui/ProjectCard';
import { ProjectHeader } from '../../ui/ProjectHeader';
import { StatusIcon } from '../../ui/StatusIcon';
import { TaskList } from '../../ui/TaskList';
import type { Task } from '../../ui/TaskRow/types';
import { ToggleGroup } from '../../ui/ToggleGroup';
import { AppFrame, PageHeader, Spacer } from '../Calendar/AppFrame';

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
        <ProjectCard
          name="AI Action Items"
          color="green"
          due="Due Jun 26"
          done={3}
          total={6}
          status="active"
        />
        <ProjectCard
          name="API Gateway v2"
          color="amber"
          due="Due Jun 30"
          done={4}
          total={10}
          status="active"
        />
        <ProjectCard
          name="Auth Overhaul"
          color="blue"
          due="Due Jul 1"
          done={3}
          total={12}
          status="active"
        />
        <ProjectCard
          name="ML Platform"
          color="pink"
          due="Due Jul 10"
          done={6}
          total={10}
          status="on-hold"
        />
        <ProjectCard
          name="User Interface Revamp"
          color="indigo"
          due="Due Jul 15"
          done={0}
          total={8}
          status="not-started"
        />
      </div>
    </AppFrame>
  ),
};

const IN_PROGRESS: Task[] = [
  {
    id: '124',
    title: 'Implement OAuth2 PKCE flow',
    status: 'in-progress',
    key: 'ENG-124',
    subtasks: [3, 4],
    event: 'Mitchell / Jesse 1:1',
    eventColor: 'green',
    priority: 'high',
    date: 'Jun 24',
  },
  {
    id: '131',
    title: 'Refactor token refresh logic',
    status: 'in-progress',
    key: 'ENG-131',
    priority: 'high',
    date: 'Jun 18',
    dateTone: 'overdue',
  },
];

const NOT_STARTED: Task[] = [
  {
    id: '118',
    title: 'Audit token storage',
    status: 'overdue',
    key: 'ENG-118',
    priority: 'high',
    date: 'Jun 19',
    dateTone: 'overdue',
  },
  {
    id: 'guide',
    title: 'Write PKCE migration guide',
    status: 'not-started',
    note: 'PKCE design notes',
    priority: 'medium',
    date: 'Today',
    dateTone: 'today',
  },
  {
    id: '138',
    title: 'Add PKCE end-to-end tests',
    status: 'not-started',
    key: 'ENG-138',
    priority: 'medium',
    date: 'Jun 26',
  },
  {
    id: '133',
    title: 'Rotate token signing keys',
    status: 'not-started',
    key: 'ENG-133',
    priority: 'medium',
    date: 'Jun 29',
  },
  {
    id: '135',
    title: 'Update SDK docs for PKCE',
    status: 'not-started',
    key: 'ENG-135',
    priority: 'low',
    date: 'Jun 30',
  },
  {
    id: '137',
    title: 'Remove implicit grant endpoint',
    status: 'not-started',
    key: 'ENG-137',
    priority: 'medium',
    date: 'Jul 1',
  },
  {
    id: '139',
    title: 'Notify partners of auth change',
    status: 'not-started',
    key: 'ENG-139',
    priority: 'low',
    date: 'Jul 1',
  },
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
          title="Auth Overhaul"
          status="active"
          start="Jun 1"
          due="Jul 1"
          done={3}
          total={12}
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
            icon={<StatusIcon status="in-progress" />}
            tint="var(--status-in-progress-tint)"
            count={2}
          />
          <TaskList tasks={IN_PROGRESS} />
          <GroupHeading
            label="Not started"
            icon={<StatusIcon status="not-started" />}
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
