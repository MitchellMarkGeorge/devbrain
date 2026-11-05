import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowUpDown, ListFilter } from 'lucide-react';
import { Button } from '../../ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuFilter,
  DropdownMenuTrigger,
} from '../../ui/DropdownMenu';
import { ProjectPickerItems } from '../../entities/ProjectPicker';
import {
  DueFilterItems,
  FilterMenu,
  FilterPriorityItems,
  FilterStatusItems,
  GroupByMenu,
  OpenMenu,
  PROJECTS,
  SortMenu,
} from './menus';
import { TasksPage } from './TasksPage';

const meta = {
  title: 'Screens/Menus/Toolbar menus',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Figma "Tasks – filter by project" (7175:25639): Filter › Project, Auth Overhaul ticked. */
export const FilterByProject: Story = {
  name: 'Tasks – filter by project',
  render: () => (
    <TasksPage
      filter={
        <DropdownMenu open modal={false}>
          <DropdownMenuTrigger
            render={
              <Button icon={ListFilter} value="Open">
                Filter
              </Button>
            }
          />
          <FilterMenu open="project" />
        </DropdownMenu>
      }
    />
  ),
};

/** Figma "Tasks – sort menu" (7175:26184): Sort by Priority, Descending. */
export const SortMenuOpen: Story = {
  name: 'Tasks – sort menu',
  render: () => (
    <TasksPage
      sort={
        <DropdownMenu open modal={false}>
          <DropdownMenuTrigger
            render={
              <Button icon={ArrowUpDown} value="Priority">
                Sort
              </Button>
            }
          />
          <SortMenu align="end" />
        </DropdownMenu>
      }
    />
  ),
};

/**
 * The toolbar's menus of "R2 Batch 1": SortMenu, GroupByMenu, FilterMenu, FilterStatusMenu,
 * FilterPriorityMenu, ProjectPicker and DueFilterMenu.
 */
export const Gallery: Story = {
  render: () => (
    <div
      style={{ position: 'relative', width: 1440, height: 640, background: 'var(--background)' }}
    >
      <OpenMenu x={40} y={40}>
        <SortMenu sideOffset={0} />
      </OpenMenu>
      <OpenMenu x={280} y={40}>
        <GroupByMenu sideOffset={0} />
      </OpenMenu>
      <OpenMenu x={520} y={40}>
        <FilterMenu sideOffset={0} />
      </OpenMenu>
      <OpenMenu x={760} y={40}>
        <DropdownMenuContent width="sm" sideOffset={0}>
          <FilterStatusItems />
        </DropdownMenuContent>
      </OpenMenu>
      <OpenMenu x={1000} y={40}>
        <DropdownMenuContent width="sm" sideOffset={0}>
          <FilterPriorityItems />
        </DropdownMenuContent>
      </OpenMenu>
      <OpenMenu x={1000} y={200}>
        <DropdownMenuContent width="sm" sideOffset={0}>
          <DueFilterItems />
        </DropdownMenuContent>
      </OpenMenu>
      <DropdownMenuFilter>
        <OpenMenu x={760} y={200}>
          <DropdownMenuContent width="lg" sideOffset={0}>
            <ProjectPickerItems projects={PROJECTS} value="auth" />
          </DropdownMenuContent>
        </OpenMenu>
      </DropdownMenuFilter>
    </div>
  ),
};
