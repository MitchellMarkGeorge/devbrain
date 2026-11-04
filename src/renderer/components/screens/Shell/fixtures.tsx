/** The Figma screens' sample data, shared by the screen stories. */
import { ArrowUpDown, Group, List, ListFilter, Plus, SquareKanban } from 'lucide-react';
import { Breadcrumb } from '../../ui/Breadcrumb';
import { Button } from '../../ui/Button';
import { PageHeader, PageToolbar } from '../../ui/PageHeader';
import type { Task } from '../../ui/TaskRow/types';
import { ToggleGroup } from '../../ui/ToggleGroup';

/** "Tasks (list)": the eight tasks of the Figma screen, in its order. */
export const FIGMA_TASKS: Task[] = [
  {
    id: 'pkce',
    title: 'Implement OAuth2 PKCE flow',
    status: 'in-progress',
    key: 'ENG-124',
    subtasks: [3, 4],
    event: 'Mitchell / Jesse 1:1',
    eventColor: 'green',
    project: 'Auth Overhaul',
    projectColor: 'blue',
    priority: 'high',
    date: 'Jun 24',
  },
  {
    id: 'mobile',
    title: 'Mobile fallback',
    status: 'not-started',
    key: 'ENG-128',
    parent: 'Implement OAuth2 PKCE flow',
    parentStatus: 'in-progress',
    project: 'Auth Overhaul',
    projectColor: 'blue',
    priority: 'high',
    date: 'Jun 24',
  },
  {
    id: 'refresh',
    title: 'Refactor token refresh logic',
    status: 'in-progress',
    key: 'ENG-131',
    project: 'Auth Overhaul',
    projectColor: 'blue',
    priority: 'high',
    date: 'Jun 18',
    dateTone: 'overdue',
  },
  {
    id: 'audit',
    title: 'Audit token storage',
    status: 'not-started',
    key: 'ENG-118',
    project: 'Auth Overhaul',
    projectColor: 'blue',
    priority: 'high',
    date: 'Jun 19',
    dateTone: 'overdue',
  },
  {
    id: 'guide',
    title: 'Write PKCE migration guide',
    status: 'not-started',
    note: 'PKCE design notes',
    project: 'Auth Overhaul',
    projectColor: 'blue',
    priority: 'medium',
    date: 'Today',
    dateTone: 'today',
  },
  {
    id: 'database',
    title: 'Integrate database connection',
    status: 'not-started',
    key: 'ENG-140',
    project: 'API Gateway v2',
    projectColor: 'amber',
    priority: 'medium',
    date: 'Jun 26',
  },
  {
    id: 'mockups',
    title: 'Create user interface mockups',
    status: 'not-started',
    subtasks: [1, 4],
    project: 'User Interface Revamp',
    projectColor: 'indigo',
    priority: 'low',
    date: 'Jun 30',
  },
  {
    id: 'gateway',
    title: 'Set up API Gateway',
    status: 'completed',
    key: 'ENG-102',
    project: 'API Gateway v2',
    projectColor: 'amber',
    priority: 'low',
    date: 'Jun 15',
  },
];

/** "Tasks › List": the Tasks page's header. */
export function TasksHeader() {
  return (
    <PageHeader>
      <Breadcrumb items={['Tasks', { label: 'List', icon: List }]} />
    </PageHeader>
  );
}

/** Filter at the left; Sort, the view switch and New Task at the right. */
export function TasksToolbar({ compact = false }: { compact?: boolean }) {
  return (
    <PageToolbar
      start={
        <Button icon={ListFilter} value="Open" hideValue={compact}>
          Filter
        </Button>
      }
      end={
        <>
          <Button icon={ArrowUpDown} value="Priority" hideValue={compact}>
            Sort
          </Button>
          <ToggleGroup
            aria-label="View"
            items={[
              { value: 'list', icon: List },
              { value: 'group', icon: Group },
              { value: 'board', icon: SquareKanban },
            ]}
          />
          <Button icon={Plus}>New Task</Button>
        </>
      }
    />
  );
}
