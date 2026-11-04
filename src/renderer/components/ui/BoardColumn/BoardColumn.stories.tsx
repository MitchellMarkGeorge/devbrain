import type { Meta, StoryObj } from '@storybook/react-vite';
import { BoardCard, type BoardTask } from '../BoardCard';
import { Board, BoardColumn } from './BoardColumn';

const notStarted: BoardTask[] = [
  {
    title: 'Fix calendar sync for recurring events',
    status: 'not-started',
    priority: 'high',
    key: 'ENG-131',
    project: 'Calendar',
    projectColor: 'green',
    date: 'Today',
    dateTone: 'today',
  },
  {
    title: 'Renew the domain',
    status: 'not-started',
    priority: 'low',
    date: 'Oct 12',
  },
];

const inProgress: BoardTask[] = [
  {
    title: 'Ship the onboarding flow',
    status: 'in-progress',
    priority: 'high',
    key: 'ENG-124',
    event: 'Mitchell / Jesse 1:1',
    eventColor: 'indigo',
    project: 'DevBrain 1.0',
    projectColor: 'blue',
    subtasks: [3, 4],
    date: 'Sep 28',
    dateTone: 'overdue',
  },
  {
    title: 'Write the Q4 planning doc',
    status: 'in-progress',
    priority: 'medium',
    note: 'Q4 planning notes',
    project: 'Planning',
    projectColor: 'amber',
    date: 'Oct 3',
  },
];

const completed: BoardTask[] = [
  {
    title: 'Set up the release pipeline',
    status: 'completed',
    priority: 'medium',
    key: 'ENG-98',
    source: 'github',
    project: 'DevBrain 1.0',
    projectColor: 'blue',
    date: 'Sep 20',
  },
];

const meta = {
  title: 'Board/BoardColumn',
  component: BoardColumn,
  args: { name: 'In progress', status: 'in-progress' },
  argTypes: {
    status: {
      control: 'select',
      options: ['not-started', 'in-progress', 'completed', 'overdue', 'cancelled'],
    },
  },
} satisfies Meta<typeof BoardColumn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div style={{ width: 300 }}>
      <BoardColumn {...args}>
        {inProgress.map((t) => (
          <BoardCard key={t.title} task={t} />
        ))}
      </BoardColumn>
    </div>
  ),
};

export const Empty: Story = {
  render: (args) => (
    <div style={{ width: 300 }}>
      <BoardColumn {...args} name="Not started" status="not-started" />
    </div>
  ),
};

/** Three open columns, 24px apart; Completed has no "Add task" slot */
export const FullBoard: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={{ padding: 24, maxWidth: 1080 }}>
      <Board>
        <BoardColumn name="Not started" status="not-started">
          {notStarted.map((t) => (
            <BoardCard key={t.title} task={t} />
          ))}
        </BoardColumn>
        <BoardColumn name="In progress" status="in-progress">
          {inProgress.map((t, i) => (
            <BoardCard key={t.title} task={t} state={i === 0 ? 'hover' : undefined} />
          ))}
        </BoardColumn>
        <BoardColumn name="Completed" status="completed" add={false}>
          {completed.map((t) => (
            <BoardCard key={t.title} task={t} />
          ))}
        </BoardColumn>
      </Board>
    </div>
  ),
};
