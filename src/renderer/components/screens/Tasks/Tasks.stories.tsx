import { Fragment, useState, type CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowUpDown, Folder, Group, Kanban, List, ListFilter, Plus } from 'lucide-react';
import { BoardCard } from '../../ui/BoardCard';
import { Board, BoardColumn } from '../../ui/BoardColumn';
import { Button } from '../../ui/Button';
import { GroupHeading } from '../../ui/GroupHeading';
import { SelectionBar } from '../../ui/SelectionBar';
import { TaskList } from '../../ui/TaskList';
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
    const tasks = LIST_TASKS.filter((t) => t.id !== 'eng-128').map((t) =>
      t.id === 'eng-102' ? { ...t, status: 'not-started' as const } : t,
    );
    const [selected, setSelected] = useState<string[]>(['eng-131', 'eng-118', 'pkce-guide']);
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
 * Figma "Tasks (group)" (7158:9538): grouped by project. Each `GroupHeading` takes its project's
 * colour; a selection in one group shows every group's checkboxes.
 */
export const TasksGroup: Story = {
  name: 'Tasks (group)',
  render: function GroupStory() {
    const [selected, setSelected] = useState<string[]>(['eng-131', 'eng-118']);
    return (
      <TasksFrame view="group" groupBy="Project">
        {GROUPS.map((group) => (
          <Fragment key={group.label}>
            <GroupHeading
              label={group.label}
              subtitle={group.subtitle}
              icon={Folder}
              iconColor={group.color}
              done={group.done}
              total={group.total}
              onCollapsedChange={() => {}}
            />
            <TaskList
              tasks={group.tasks}
              selected={selected}
              selecting={selected.length > 0}
              selectionBar={false}
              onSelectedChange={(ids) =>
                setSelected([
                  ...selected.filter((id) => !group.tasks.some((t) => t.id === id)),
                  ...ids,
                ])
              }
            />
          </Fragment>
        ))}
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
        <BoardColumn name="Not started" status="not-started">
          {BOARD.notStarted.map((task) => (
            <BoardCard key={task.title} task={task} />
          ))}
        </BoardColumn>
        <BoardColumn name="In progress" status="in-progress">
          {BOARD.inProgress.map((task, i) => (
            <BoardCard key={task.title} task={task} state={i === 1 ? 'hover' : undefined} />
          ))}
        </BoardColumn>
        <BoardColumn name="Completed" status="completed" add={false}>
          {BOARD.completed.map((task) => (
            <BoardCard key={task.title} task={task} />
          ))}
        </BoardColumn>
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
