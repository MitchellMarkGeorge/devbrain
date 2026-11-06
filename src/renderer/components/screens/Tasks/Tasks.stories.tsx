import { Fragment, useState, type CSSProperties } from 'react';
import { TaskStatus } from '@common/types';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowUpDown, Folder, Group, Kanban, List, ListFilter, Plus } from 'lucide-react';
import { BoardCard } from '../../board/BoardCard';
import { Board, BoardColumn } from '../../board/BoardColumn';
import { Button } from '../../ui/Button';
import { GroupHeading } from '../../lists/GroupHeading';
import { SelectionBar } from '../../lists/SelectionBar';
import { TaskList } from '../../lists/TaskList';
import { ToggleGroup, ToggleGroupItem } from '../../ui/ToggleGroup';
import { BOARD, GROUPS, LIST_TASKS } from './data';
import { AppFrame } from './frame';

const meta = {
  title: 'Screens/Tasks',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

type View = 'list' | 'group' | 'board';
const VIEW_LABEL: Record<View, string> = { list: 'List', group: 'Grouped', board: 'Board' };
const VIEW_ICON = { list: List, group: Group, board: Kanban };

/** The toolbar's right side: Sort, the list / grouped / board toggle and New Task. */
function ToolbarEnd({ view }: { view: View }) {
  return (
    <>
      <Button icon={ArrowUpDown} value="Priority">
        Sort
      </Button>
      <ToggleGroup defaultValue={view} aria-label="View">
        {(['list', 'group', 'board'] as const).map((v) => (
          <ToggleGroupItem key={v} value={v} icon={VIEW_ICON[v]} aria-label={VIEW_LABEL[v]} />
        ))}
      </ToggleGroup>
      <Button icon={Plus}>New Task</Button>
    </>
  );
}

function TasksFrame({
  view,
  filter = 'Open',
  groupBy,
  children,
  bodyStyle,
}: {
  view: View;
  filter?: string;
  groupBy?: string;
  children: React.ReactNode;
  bodyStyle?: CSSProperties;
}) {
  return (
    <AppFrame
      active="Tasks"
      breadcrumb={['Tasks', { label: VIEW_LABEL[view], icon: VIEW_ICON[view] }]}
      toolbarStart={
        <>
          <Button icon={ListFilter} value={filter}>
            Filter
          </Button>
          {groupBy && (
            <Button icon={Group} value={groupBy}>
              Group by
            </Button>
          )}
        </>
      }
      toolbarEnd={<ToolbarEnd view={view} />}
      bodyStyle={bodyStyle}
    >
      {children}
    </AppFrame>
  );
}

// the window's selection bar: centred over the page, 16px above its bottom edge
const pinnedBar: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 16,
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
};

function PinnedSelectionBar({ count, onClear }: { count: number; onClear: () => void }) {
  if (count === 0) return null;
  return (
    <div style={pinnedBar}>
      <SelectionBar
        count={count}
        floating={false}
        style={{ pointerEvents: 'auto' }}
        onClear={onClear}
      />
    </div>
  );
}

/** Figma "Tasks (list)" (7155:5231): open tasks by priority, the fourth row pointed at. */
export const TasksList: Story = {
  name: 'Tasks (list)',
  render: () => (
    <TasksFrame view="list">
      <TaskList tasks={LIST_TASKS} states={{ 3: 'hover' }} />
    </TasksFrame>
  ),
};

/**
 * Figma "Tasks (list) — several selected" (7424:38163): three neighbouring rows selected join into
 * one block, and the selection bar sits on the window's bottom edge.
 */
export const SeveralSelected: Story = {
  name: 'Tasks (list) — several selected',
  render: function SeveralSelectedStory() {
    const tasks = LIST_TASKS.filter((t) => t.id !== 'tsk_eng-128').map((t) =>
      t.id === 'tsk_eng-102' ? { ...t, status: TaskStatus.NOT_STARTED as const } : t,
    );
    const [selected, setSelected] = useState<string[]>([
      'tsk_eng-131',
      'tsk_eng-118',
      'tsk_pkce-guide',
    ]);
    return (
      <TasksFrame view="list">
        <TaskList
          tasks={tasks}
          selected={selected}
          onSelectedChange={setSelected}
          selectionBar={false}
        />
        <PinnedSelectionBar count={selected.length} onClear={() => setSelected([])} />
      </TasksFrame>
    );
  },
};

/**
 * Figma "Tasks (group)" (7158:9538): grouped by project, as one `TaskList` with `groups`. Each
 * `GroupHeading` takes its project's colour; a selection in one group shows every group's
 * checkboxes, and the current group's heading sticks as the page scrolls.
 */
export const TasksGroup: Story = {
  name: 'Tasks (group)',
  render: function GroupStory() {
    const [selected, setSelected] = useState<string[]>(['tsk_eng-131', 'tsk_eng-118']);
    return (
      <TasksFrame view="group" groupBy="Project">
        <TaskList
          groups={GROUPS.map((group) => ({
            id: group.label,
            heading: (
              <GroupHeading
                label={group.label}
                subtitle={group.subtitle}
                icon={Folder}
                iconColor={group.color}
                done={group.done}
                total={group.total}
                onCollapsedChange={() => {}}
              />
            ),
            tasks: group.tasks,
          }))}
          selected={selected}
          selectionBar={false}
          onSelectedChange={setSelected}
        />
        <PinnedSelectionBar count={selected.length} onClear={() => setSelected([])} />
      </TasksFrame>
    );
  },
};

/**
 * Figma "Tasks (board)" (7158:14338): open status columns; the second In progress card is pointed
 * at, and Completed ends without an "Add task" slot.
 */
export const TasksBoard: Story = {
  name: 'Tasks (board)',
  render: () => (
    <TasksFrame view="board" filter="All" bodyStyle={{ padding: '4px 24px 24px' }}>
      <Board>
        <BoardColumn status={TaskStatus.NOT_STARTED} tasks={BOARD.notStarted} />
        <BoardColumn
          status={TaskStatus.IN_PROGRESS}
          tasks={BOARD.inProgress}
          renderCard={(task, i) => <BoardCard task={task} state={i === 1 ? 'hover' : undefined} />}
        />
        <BoardColumn status={TaskStatus.COMPLETED} tasks={BOARD.completed} add={false} />
      </Board>
    </TasksFrame>
  ),
};

/** Figma "Tasks (list) — light" (7426:45152): the list on the light theme. */
export const TasksListLight: Story = {
  ...TasksList,
  name: 'Tasks (list) — light',
  globals: { theme: 'light' },
};

/** Figma "Tasks (board) — light" (7426:45174). */
export const TasksBoardLight: Story = {
  ...TasksBoard,
  name: 'Tasks (board) — light',
  globals: { theme: 'light' },
};
