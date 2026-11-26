import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskPriority } from '@common/types';
import { PageToolbar } from '../../shell/Page';
import { TooltipProvider } from '../../ui/Tooltip';
import {
  DemoFilterChips,
  DemoToolbarEnd,
  DemoToolbarStart,
  useDemoFilters,
  type DemoToolbarEndProps,
  type DemoToolbarStartProps,
} from './fixtures';

/*
 * The list pages' toolbar: `ListStatusChip`, `ListFilters` and `ListDisplay` in a `PageToolbar`,
 * over sample choices (`fixtures.tsx`). Every control works.
 */

const meta = {
  title: 'Lists/ListToolbar',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Toolbar({
  width = 1100,
  height = 80,
  start,
  end,
}: {
  width?: number;
  /** room under the row for an open menu */
  height?: number;
  start: DemoToolbarStartProps;
  end?: Partial<DemoToolbarEndProps>;
}) {
  return (
    <TooltipProvider>
      <div style={{ width, minHeight: height, paddingTop: 16, background: 'var(--background)' }}>
        <PageToolbar
          start={<DemoToolbarStart {...start} />}
          end={<DemoToolbarEnd list={start.list} compact={start.compact} {...end} />}
        />
      </div>
    </TooltipProvider>
  );
}

const FILTERED = { priority: [String(TaskPriority.HIGH)], source: 'external' };

/** Nothing filtered: the Status chip, the Filter icon button, and Display at the end. */
export const Tasks: Story = { render: () => <Toolbar start={{ list: 'tasks' }} /> };

/**
 * Two filters set: each is a chip, its value opening the field's values and its × removing it.
 * "Clear", at the row's end before Display, removes both.
 */
export const Filtered: Story = {
  render: () => <Toolbar start={{ list: 'tasks', filters: FILTERED }} />,
};

/**
 * A filter holding several values, "any of these": a chip names two ("High, Medium") and from
 * three counts the rest ("Auth Overhaul +2"). Due and Source hold one value.
 */
export const SeveralValues: Story = {
  render: () => (
    <Toolbar
      start={{
        list: 'tasks',
        filters: {
          priority: [String(TaskPriority.HIGH), String(TaskPriority.MEDIUM)],
          project: ['Auth Overhaul', 'API Gateway v2', 'none'],
        },
      }}
    />
  ),
};

/**
 * The Filter menu over fields that hold several values: each field's item shows the same summary
 * as its chip. In a field's submenu the values are checkboxes (radio buttons for a field that
 * holds one value) and picking one leaves the menu open; "Any"
 * unticks them all.
 */
export const SeveralValuesMenu: Story = {
  render: () => (
    <Toolbar
      height={640}
      start={{
        list: 'tasks',
        filters: {
          priority: [String(TaskPriority.HIGH), String(TaskPriority.MEDIUM)],
          project: ['Auth Overhaul', 'API Gateway v2', 'none'],
        },
        open: 'filter',
      }}
    />
  ),
};

/** The Status chip's menu: the scopes, then each status alone. */
export const StatusMenu: Story = {
  render: () => <Toolbar height={360} start={{ list: 'tasks', open: 'status' }} />,
};

/** The Filter menu: an item for each field, showing what it is filtered to and opening its values. */
export const FilterMenu: Story = {
  render: () => (
    <Toolbar height={640} start={{ list: 'tasks', filters: FILTERED, open: 'filter' }} />
  ),
};

/**
 * Every filter set in a page too narrow for them: the row stays one line. The chips that fit are
 * drawn, and the rest fold into the button, which counts them ("Filter +3"); they are still in its
 * menu, each beside its field's name.
 */
export const ManyFilters: Story = {
  render: () => (
    <Toolbar
      width={760}
      height={120}
      start={{
        list: 'tasks',
        filters: {
          priority: [String(TaskPriority.NONE)],
          due: 'overdue',
          source: 'external',
          project: ['User Interface Revamp'],
        },
      }}
    />
  ),
};

function ChipRowToolbar({
  filters,
  open,
  width = 1100,
  height = 120,
}: {
  filters?: Record<string, string | string[]>;
  open?: boolean;
  width?: number;
  height?: number;
}) {
  const state = useDemoFilters('tasks', filters);
  return (
    <TooltipProvider>
      <div style={{ width, minHeight: height, paddingTop: 16, background: 'var(--background)' }}>
        <PageToolbar
          start={<DemoToolbarStart list="tasks" state={state} open={open ? 'filter' : undefined} />}
          end={<DemoToolbarEnd list="tasks" />}
        />
        <DemoFilterChips state={state} />
      </div>
    </TooltipProvider>
  );
}

/**
 * An alternative being tried: the chips in a row of their own under the toolbar, smaller (28px),
 * with "Clear" after them. The Filter button never moves, so its menu stays under the pointer
 * while values are ticked; it is drawn pressed while a filter is set. Not used by the app.
 */
export const ChipRow: Story = {
  name: 'Alternative — chips in their own row',
  render: () => (
    <ChipRowToolbar
      filters={{
        priority: [String(TaskPriority.HIGH), String(TaskPriority.MEDIUM)],
        due: 'today',
        project: ['Auth Overhaul', 'API Gateway v2', 'none'],
      }}
    />
  ),
};

/** The alternative with nothing set: one row, as there is no chip to draw. Tick a value to try it. */
export const ChipRowEmpty: Story = {
  name: 'Alternative — chips in their own row, none set',
  render: () => <ChipRowToolbar open height={420} />,
};

/** The alternative in a narrow page: the chips wrap onto another line instead of folding. */
export const ChipRowNarrow: Story = {
  name: 'Alternative — chips in their own row, narrow',
  render: () => (
    <ChipRowToolbar
      width={520}
      height={160}
      filters={{
        priority: [String(TaskPriority.HIGH), String(TaskPriority.MEDIUM)],
        due: 'overdue',
        source: 'external',
        project: ['User Interface Revamp'],
      }}
    />
  ),
};

/** Display: the layout, the grouping, and the sort with its direction. */
export const Display: Story = {
  render: () => <Toolbar height={260} start={{ list: 'tasks' }} end={{ open: true }} />,
};

/** The board orders and groups itself: Display names the layout and says why. */
export const Board: Story = {
  render: () => (
    <Toolbar
      height={200}
      start={{ list: 'tasks', status: 'all' }}
      end={{ layout: 'board', open: true }}
    />
  ),
};

/** A narrow window: Status and Display drop their values, and the chips fold into "Filter 2". */
export const Compact: Story = {
  render: () => <Toolbar width={640} start={{ list: 'tasks', filters: FILTERED, compact: true }} />,
};

/** Projects: one filter, so its menu has no search row; no grouping. */
export const Projects: Story = {
  render: () => <Toolbar start={{ list: 'projects' }} end={{ layout: 'cards' }} />,
};

/** Notes have no status, so the row starts with the filters. One is set: Clear is there too. */
export const Notes: Story = {
  render: () => <Toolbar start={{ list: 'notes', filters: { project: ['Auth Overhaul'] } }} />,
};

/** The filtered toolbar on the dark theme. */
export const FilteredDark: Story = {
  ...Filtered,
  name: 'Filtered — dark',
  globals: { theme: 'dark' },
};
