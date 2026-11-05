/**
 * DevBrain's menus, as Figma's "R2 Batch 1: Menus & pickers" draws them: each a composition of
 * DropdownMenu parts (no menu needs a component of its own). The screens' stories open them over
 * a page; `MenuGallery` shows them side by side.
 */
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import {
  ArrowUpDown,
  Calendar,
  ChevronsUp,
  Circle,
  CircleAlert,
  CircleSlash,
  Clock,
  Code,
  Copy,
  CornerDownRight,
  Folder,
  Link,
  Plus,
  Repeat,
  RotateCcw,
  SquareArrowOutUpRight,
  SquarePen,
  Star,
  Trash2,
  Unlink,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuFilter,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  type DropdownMenuContentProps,
  type DropdownMenuSubTriggerProps,
} from '../../ui/DropdownMenu';
import { PriorityIcon } from '../../entities/PriorityIcon';
import { PriorityMenuContent } from '../../entities/PriorityMenu';
import { ProjectGlyph, ProjectPickerItems, type PickerProject } from '../../entities/ProjectPicker';
import { StatusIcon } from '../../entities/StatusIcon';
import { StatusMenuContent } from '../../entities/StatusMenu';

export const PROJECTS: PickerProject[] = [
  { id: 'auth', name: 'Auth Overhaul', color: 'blue' },
  { id: 'api', name: 'API Gateway v2', color: 'amber' },
  { id: 'ui', name: 'User Interface Revamp', color: 'indigo' },
  { id: 'ml', name: 'ML Platform', color: 'pink' },
  { id: 'ai', name: 'AI Action Items', color: 'green' },
];

const TRASH = '⌘⌫';

/**
 * A menu held open at a point of its container (a positioned element): the stand-in for a
 * right-click or a trigger the screen draws elsewhere. Not modal, so several can stay open.
 */
export function OpenMenu({
  x,
  y,
  children,
  trigger,
}: {
  x: number;
  y: number;
  /** the menu's popup: a DropdownMenuContent */
  children: ReactNode;
  /** a visible trigger at (x, y) instead of an invisible point */
  trigger?: ReactElement;
}) {
  const anchor: CSSProperties = { position: 'absolute', left: x, top: y };
  return (
    <DropdownMenu open modal={false}>
      {trigger ? (
        <div style={anchor}>
          <DropdownMenuTrigger render={trigger} />
        </div>
      ) : (
        <DropdownMenuTrigger
          aria-label="Menu"
          style={{ ...anchor, width: 1, height: 1, padding: 0, border: 0, opacity: 0 }}
        />
      )}
      {children}
    </DropdownMenu>
  );
}

type ContentProps = Omit<DropdownMenuContentProps, 'children'>;

/** A submenu item and its popup (a SubmenuTrigger needs its SubmenuRoot). */
function Submenu({
  icon,
  label,
  open,
  children,
}: {
  icon: DropdownMenuSubTriggerProps['icon'];
  label: ReactNode;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <DropdownMenuSub open={open || undefined}>
      <DropdownMenuSubTrigger icon={icon}>{label}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent width="sm">{children}</DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function DateItems() {
  return (
    <>
      <DropdownMenuItem icon={Calendar}>Today</DropdownMenuItem>
      <DropdownMenuItem icon={Calendar}>Tomorrow</DropdownMenuItem>
      <DropdownMenuItem icon={Calendar}>Next week</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={Calendar}>Pick a date…</DropdownMenuItem>
    </>
  );
}

function LinkItems() {
  return (
    <>
      <DropdownMenuItem icon={Calendar}>Event…</DropdownMenuItem>
      <DropdownMenuItem icon={SquarePen}>Note…</DropdownMenuItem>
    </>
  );
}

function ProjectItems() {
  return (
    <DropdownMenuRadioGroup defaultValue="auth">
      {PROJECTS.map((project) => (
        <DropdownMenuRadioItem
          key={project.id}
          value={project.id}
          icon={<ProjectGlyph color={project.color} />}
        >
          {project.name}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

// ---------- rows ----------

/** Right-click on a task row (TaskContextMenu). `open` names the submenu held open. */
export function TaskContextMenu({
  open,
  ...props
}: ContentProps & { open?: 'status' | 'priority' }) {
  return (
    <DropdownMenuContent sideOffset={0} {...props}>
      <DropdownMenuItem icon={SquareArrowOutUpRight} shortcut="↵">
        Open task
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuSub open={open === 'status' || undefined}>
        <DropdownMenuSubTrigger icon={Circle}>Status</DropdownMenuSubTrigger>
        <StatusMenuContent submenu status="in-progress" />
      </DropdownMenuSub>
      <DropdownMenuSub open={open === 'priority' || undefined}>
        <DropdownMenuSubTrigger icon={ChevronsUp}>Priority</DropdownMenuSubTrigger>
        <PriorityMenuContent submenu priority="high" />
      </DropdownMenuSub>
      <Submenu icon={Calendar} label="Start date">
        <DateItems />
      </Submenu>
      <Submenu icon={Calendar} label="Due date">
        <DateItems />
      </Submenu>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={Star} shortcut="F">
        Favorite
      </DropdownMenuItem>
      <DropdownMenuItem icon={CornerDownRight}>Open parent task</DropdownMenuItem>
      <DropdownMenuItem icon={Folder}>Open project</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={Trash2} shortcut={TRASH} variant="destructive">
        Move to trash
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

/** Right-click on a note card or row (NoteMenu). */
export function NoteMenu(props: ContentProps) {
  return (
    <DropdownMenuContent sideOffset={0} {...props}>
      <DropdownMenuItem icon={SquareArrowOutUpRight} shortcut="↵">
        Open note
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={Star} shortcut="F">
        Favorite
      </DropdownMenuItem>
      <Submenu icon={Link} label="Change link">
        <LinkItems />
      </Submenu>
      <Submenu icon={Folder} label="Change project">
        <ProjectItems />
      </Submenu>
      <DropdownMenuItem icon={Code}>Copy as Markdown</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={Trash2} shortcut={TRASH} variant="destructive">
        Move to trash
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

/** Right-click on a project row (ProjectMenu). */
export function ProjectMenu(props: ContentProps) {
  return (
    <DropdownMenuContent width="sm" sideOffset={0} {...props}>
      <DropdownMenuItem icon={Star} shortcut="F">
        Favorite
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={Trash2} shortcut={TRASH} variant="destructive">
        Move to trash
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

/** Right-click on a trashed item (TrashRowMenu). */
export function TrashRowMenu(props: ContentProps) {
  return (
    <DropdownMenuContent width="sm" sideOffset={0} {...props}>
      <DropdownMenuItem icon={SquareArrowOutUpRight} shortcut="↵">
        Open
      </DropdownMenuItem>
      <DropdownMenuItem icon={RotateCcw}>Restore</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={Trash2} variant="destructive">
        Delete permanently
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

/** The menu of a task page's linked event or task note pill (LinkPillMenu). */
export function LinkPillMenu({ link, ...props }: ContentProps & { link: 'event' | 'task-note' }) {
  const event = link === 'event';
  return (
    <DropdownMenuContent {...props}>
      <DropdownMenuItem icon={SquareArrowOutUpRight} shortcut="↵">
        {event ? 'Open event' : 'Open note'}
      </DropdownMenuItem>
      <DropdownMenuItem icon={Repeat}>
        {event ? 'Change linked event…' : 'Change task note…'}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={X}>{event ? 'Remove link' : 'Remove task note'}</DropdownMenuItem>
    </DropdownMenuContent>
  );
}

// ---------- toolbar ----------

/** Sort ▾ (SortMenu): what to sort by, then the order. */
export function SortMenu(props: ContentProps) {
  return (
    <DropdownMenuContent width="sm" {...props}>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup defaultValue="priority">
          <DropdownMenuRadioItem value="priority" icon={ChevronsUp}>
            Priority
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="due" icon={Calendar}>
            Due date
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="status" icon={Circle}>
            Status
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="updated" icon={Clock}>
            Last updated
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="created" icon={Plus}>
            Created
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>Order</DropdownMenuLabel>
        <DropdownMenuRadioGroup defaultValue="desc">
          <DropdownMenuRadioItem value="asc" icon={ArrowUpDown}>
            Ascending
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="desc" icon={ArrowUpDown}>
            Descending
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );
}

/** Group by ▾ (GroupByMenu). */
export function GroupByMenu(props: ContentProps) {
  return (
    <DropdownMenuContent width="sm" {...props}>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Group by</DropdownMenuLabel>
        <DropdownMenuRadioGroup defaultValue="project">
          <DropdownMenuRadioItem value="none" icon={CircleSlash}>
            None
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="project" icon={Folder}>
            Project
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="status" icon={Circle}>
            Status
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="priority" icon={ChevronsUp}>
            Priority
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="linked" icon={Link}>
            Linked event/note
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );
}

/** Filter › Status (FilterStatusMenu): several statuses, each ticked one kept. */
export function FilterStatusItems() {
  return (
    <>
      <DropdownMenuCheckboxItem icon={<StatusIcon status="not-started" />} defaultChecked>
        Not started
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem icon={<StatusIcon status="in-progress" />} defaultChecked>
        In progress
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem icon={<StatusIcon status="completed" />}>
        Completed
      </DropdownMenuCheckboxItem>
    </>
  );
}

/** Filter › Priority (FilterPriorityMenu). */
export function FilterPriorityItems() {
  return (
    <>
      <DropdownMenuCheckboxItem icon={<PriorityIcon priority="high" />} defaultChecked>
        High
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem icon={<PriorityIcon priority="medium" />} defaultChecked>
        Medium
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem icon={<PriorityIcon priority="low" />}>
        Low
      </DropdownMenuCheckboxItem>
    </>
  );
}

/** Filter › Due (DueFilterMenu). */
export function DueFilterItems() {
  return (
    <>
      <DropdownMenuCheckboxItem icon={CircleAlert}>Overdue</DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem icon={Calendar} defaultChecked>
        Today
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem icon={Calendar}>This week</DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem icon={CircleSlash}>No due date</DropdownMenuCheckboxItem>
    </>
  );
}

/** Filter ▾ (FilterMenu): each property opens its values. `open` names the one held open. */
export function FilterMenu({
  open,
  ...props
}: ContentProps & { open?: 'status' | 'priority' | 'project' | 'due' }) {
  return (
    <DropdownMenuContent width="sm" {...props}>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Filter</DropdownMenuLabel>
        <DropdownMenuSub open={open === 'status' || undefined}>
          <DropdownMenuSubTrigger icon={Circle}>Status</DropdownMenuSubTrigger>
          <DropdownMenuSubContent width="sm">
            <FilterStatusItems />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub open={open === 'priority' || undefined}>
          <DropdownMenuSubTrigger icon={ChevronsUp}>Priority</DropdownMenuSubTrigger>
          <DropdownMenuSubContent width="sm">
            <FilterPriorityItems />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuFilter>
          <DropdownMenuSub open={open === 'project' || undefined}>
            <DropdownMenuSubTrigger icon={Folder}>Project</DropdownMenuSubTrigger>
            <DropdownMenuSubContent width="lg">
              <ProjectPickerItems multiple projects={PROJECTS} value={['auth']} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuFilter>
        <Submenu icon={Link} label="Linked to">
          <LinkItems />
        </Submenu>
        <DropdownMenuSub open={open === 'due' || undefined}>
          <DropdownMenuSubTrigger icon={Calendar}>Due</DropdownMenuSubTrigger>
          <DropdownMenuSubContent width="sm">
            <DueFilterItems />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );
}

// ---------- detail pages' "…" ----------

export type DetailPage = 'task' | 'task-synced' | 'task-detached' | 'project' | 'note';

/** A page's "…" menu (DetailMenu): its own actions, Copy as Markdown, then Move to trash. */
export function DetailMenu({ page, ...props }: ContentProps & { page: DetailPage }) {
  const task = page.startsWith('task');
  return (
    <DropdownMenuContent align="end" {...props}>
      {task && (
        <>
          <DropdownMenuItem icon={Folder}>Convert to project</DropdownMenuItem>
          <Submenu icon={Link} label="Link to">
            <LinkItems />
          </Submenu>
          <Submenu icon={CornerDownRight} label="Make subtask of">
            <DropdownMenuItem icon={<StatusIcon status="in-progress" />}>
              Refactor token refresh logic
            </DropdownMenuItem>
            <DropdownMenuItem icon={<StatusIcon status="not-started" />}>
              Audit token storage
            </DropdownMenuItem>
          </Submenu>
          <DropdownMenuItem icon={Copy} shortcut="⌘D">
            Duplicate
          </DropdownMenuItem>
        </>
      )}
      {page === 'project' && (
        <>
          <DropdownMenuItem icon={Plus}>New task</DropdownMenuItem>
          <DropdownMenuItem icon={SquarePen}>New note</DropdownMenuItem>
          <Submenu icon={Circle} label="Change colour">
            {PROJECTS.map((project) => (
              <DropdownMenuItem key={project.id} icon={<ProjectGlyph color={project.color} />}>
                {project.color[0].toUpperCase() + project.color.slice(1)}
              </DropdownMenuItem>
            ))}
          </Submenu>
        </>
      )}
      {page === 'note' && (
        <>
          <Submenu icon={Link} label="Link to">
            <LinkItems />
          </Submenu>
          <Submenu icon={Folder} label="Change project">
            <ProjectItems />
          </Submenu>
          <DropdownMenuItem icon={Copy} shortcut="⌘D">
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem icon={SquareArrowOutUpRight}>Show in Finder</DropdownMenuItem>
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={Code}>Copy as Markdown</DropdownMenuItem>
      {(page === 'task-synced' || page === 'task-detached') && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={SquareArrowOutUpRight}>Open in Linear</DropdownMenuItem>
          <DropdownMenuItem icon={Copy}>Copy Linear URL</DropdownMenuItem>
          {page === 'task-synced' ? (
            <DropdownMenuItem icon={Unlink}>Detach from Linear</DropdownMenuItem>
          ) : (
            <DropdownMenuItem icon={RotateCcw}>Reattach to Linear</DropdownMenuItem>
          )}
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={Trash2} shortcut={TRASH} variant="destructive">
        Move to trash
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
