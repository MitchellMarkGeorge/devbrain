import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskPriority } from '@common/types';
import { PageToolbar } from '../../shell/Page';
import { TooltipProvider } from '../../ui/Tooltip';
import {
  DemoToolbarEnd,
  DemoToolbarStart,
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

const FILTERED = { priority: String(TaskPriority.HIGH), source: 'external' };

/** Nothing filtered: the Status chip, a quiet "+ Filter", and Display at the end. */
export const Tasks: Story = { render: () => <Toolbar start={{ list: 'tasks' }} /> };

/**
 * Two filters set: each is a chip, its value opening the field's values and its × removing it.
 * "Clear", at the row's end before Display, removes both.
 */
export const Filtered: Story = {
  render: () => <Toolbar start={{ list: 'tasks', filters: FILTERED }} />,
};

/** The Status chip's menu: the scopes, then each status alone. */
export const StatusMenu: Story = {
  render: () => <Toolbar height={360} start={{ list: 'tasks', open: 'status' }} />,
};

/** "+ Filter": an item for each field, showing the value it is filtered to and opening its values. */
export const FilterMenu: Story = {
  render: () => (
    <Toolbar height={640} start={{ list: 'tasks', filters: FILTERED, open: 'filter' }} />
  ),
};

const EVERY_FILTER = {
  priority: String(TaskPriority.NONE),
  due: 'overdue',
  source: 'external',
  project: 'User Interface Revamp',
};

/**
 * Every filter set, in a wide window's page (880px with the sidebar open): two chips are drawn,
 * and the other two fold into the button ("Filter +2"); they are still in its menu, each beside its
 * field's name.
 */
export const ManyFilters: Story = {
  render: () => (
    <Toolbar width={880} height={120} start={{ list: 'tasks', filters: EVERY_FILTER }} />
  ),
};

/** The same in a medium window's page (680px): one chip, and "Filter +3". */
export const ManyFiltersMedium: Story = {
  name: 'Many filters — medium window',
  render: () => (
    <Toolbar
      width={680}
      height={120}
      start={{ list: 'tasks', filters: EVERY_FILTER, size: 'medium' }}
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
  render: () => <Toolbar start={{ list: 'notes', filters: { project: 'Auth Overhaul' } }} />,
};

/** The filtered toolbar on the dark theme. */
export const FilteredDark: Story = {
  ...Filtered,
  name: 'Filtered — dark',
  globals: { theme: 'dark' },
};
