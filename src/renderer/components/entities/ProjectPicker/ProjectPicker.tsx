import type { ReactElement, ReactNode } from 'react';
import { CircleSlash, Folder } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuEmpty,
  DropdownMenuFilter,
  DropdownMenuList,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSearch,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  type DropdownMenuContentProps,
} from '../../ui/DropdownMenu';
import { Icon } from '../../ui/Icon';
import { cssColor, type Swatch } from '../../types';

export interface PickerProject {
  id: string;
  name: string;
  /** drawn in place of `name`, such as a search result's title with its matches in bold */
  label?: ReactNode;
  /** the project's colour: a swatch name or a CSS colour */
  color: Swatch | string;
}

/** The value for "No project". */
export const NO_PROJECT = '';

/** A project's folder in its colour, for a menu's icon slot. */
export function ProjectGlyph({ color }: { color: PickerProject['color'] }) {
  return <Icon icon={Folder} style={{ color: cssColor(color) }} />;
}

interface ProjectPickerItemsBase {
  projects: readonly PickerProject[];
  /** the search's hint */
  placeholder?: string;
  /** "No project" under the list; on by default */
  showNone?: boolean;
}

export type ProjectPickerItemsProps = ProjectPickerItemsBase &
  (
    | {
        /** one project (the task's Project property); `NO_PROJECT` for none */
        multiple?: false;
        value: string | undefined;
        onValueChange?: (value: string) => void;
      }
    | {
        /** several projects (Filter › Project): each ticked one is kept */
        multiple: true;
        value: readonly string[];
        onValueChange?: (value: string[]) => void;
      }
  );

/**
 * Figma's `ProjectPicker` inside any menu popup (a `DropdownMenuContent`, or a
 * `DropdownMenuSubContent` for Filter › Project): a search, the projects with their coloured
 * folders, the current ones ticked, then "No project". The search filters the list, so wrap the
 * menu (`DropdownMenu` or `DropdownMenuSub`) in a `DropdownMenuFilter`; a page that searches for
 * what is typed instead turns the filter off (`filter={null}`) and passes the matches as
 * `projects`, each with its highlighted title as `label`.
 */
export function ProjectPickerItems(props: ProjectPickerItemsProps) {
  const { projects, placeholder = 'Search projects…', showNone = true } = props;

  const items = props.multiple ? (
    <>
      {projects.map((project) => (
        <DropdownMenuCheckboxItem
          key={project.id}
          icon={<ProjectGlyph color={project.color} />}
          label={project.name}
          checked={props.value.includes(project.id)}
          onCheckedChange={(checked) =>
            props.onValueChange?.(
              checked
                ? [...props.value, project.id]
                : props.value.filter((id) => id !== project.id),
            )
          }
        >
          {project.label ?? project.name}
        </DropdownMenuCheckboxItem>
      ))}
      {showNone && <DropdownMenuSeparator />}
      {showNone && (
        <DropdownMenuCheckboxItem
          icon={CircleSlash}
          checked={props.value.includes(NO_PROJECT)}
          onCheckedChange={(checked) =>
            props.onValueChange?.(
              checked
                ? [...props.value, NO_PROJECT]
                : props.value.filter((id) => id !== NO_PROJECT),
            )
          }
        >
          No project
        </DropdownMenuCheckboxItem>
      )}
    </>
  ) : (
    <DropdownMenuRadioGroup
      value={props.value}
      onValueChange={(value: unknown) => props.onValueChange?.(String(value))}
    >
      {projects.map((project) => (
        <DropdownMenuRadioItem
          key={project.id}
          value={project.id}
          closeOnClick
          icon={<ProjectGlyph color={project.color} />}
          label={project.name}
        >
          {project.label ?? project.name}
        </DropdownMenuRadioItem>
      ))}
      {showNone && <DropdownMenuSeparator />}
      {showNone && (
        <DropdownMenuRadioItem value={NO_PROJECT} closeOnClick icon={CircleSlash}>
          No project
        </DropdownMenuRadioItem>
      )}
    </DropdownMenuRadioGroup>
  );

  return (
    <>
      <DropdownMenuSearch aria-label="Search projects" placeholder={placeholder} />
      <DropdownMenuList>{items}</DropdownMenuList>
      <DropdownMenuEmpty>No projects match</DropdownMenuEmpty>
    </>
  );
}

export type ProjectPickerProps = ProjectPickerItemsProps & {
  /** the element that opens it: the Project pill, the Filter's Project button */
  trigger: ReactElement;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: DropdownMenuContentProps['side'];
  align?: DropdownMenuContentProps['align'];
};

/** A trigger and the 240px project picker it opens. */
export function ProjectPicker({
  trigger,
  open,
  defaultOpen,
  onOpenChange,
  side,
  align,
  ...items
}: ProjectPickerProps) {
  return (
    <DropdownMenuFilter>
      <DropdownMenu open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger render={trigger} />
        <DropdownMenuContent width="lg" side={side} align={align} aria-label="Project">
          <ProjectPickerItems {...items} />
        </DropdownMenuContent>
      </DropdownMenu>
    </DropdownMenuFilter>
  );
}
