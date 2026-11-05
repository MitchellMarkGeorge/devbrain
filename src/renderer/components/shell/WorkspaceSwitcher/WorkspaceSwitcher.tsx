import { FolderOpen, Plus, SquareArrowOutUpRight } from 'lucide-react';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '../../ui/DropdownMenu';
import { WorkspaceTile } from '../../entities/WorkspaceTile';
import type { Swatch } from '../../types';

export interface WorkspaceSummary {
  id: string;
  name: string;
  color?: Swatch;
}

export interface WorkspaceSwitcherProps {
  workspaces: WorkspaceSummary[];
  /** the open workspace's id: ticked */
  current: string;
  onSelect?: (id: string) => void;
  onCreate?: () => void;
  onOpenFolder?: () => void;
  /** reveals the open workspace's folder */
  onShowInFinder?: () => void;
}

/**
 * The workspace menu that `SidebarWorkspace` opens: "Workspaces", each one with its 16px tile
 * (the open one ticked; the others open on click), then "New workspace…" and "Open folder…",
 * then "Show in Finder" for the open workspace. Pass it as `SidebarWorkspace`'s children.
 */
export function WorkspaceSwitcher({
  workspaces,
  current,
  onSelect,
  onCreate,
  onOpenFolder,
  onShowInFinder,
}: WorkspaceSwitcherProps) {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(id: string) => {
            if (id !== current) onSelect?.(id);
          }}
        >
          {workspaces.map((workspace) => (
            <DropdownMenuRadioItem
              key={workspace.id}
              value={workspace.id}
              // picking a workspace switches to it: the menu has done its job
              closeOnClick
              icon={<WorkspaceTile letter={workspace.name} color={workspace.color} size={16} />}
            >
              {workspace.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={Plus} onClick={onCreate}>
        New workspace…
      </DropdownMenuItem>
      <DropdownMenuItem icon={FolderOpen} onClick={onOpenFolder}>
        Open folder…
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={SquareArrowOutUpRight} onClick={onShowInFinder}>
        Show in Finder
      </DropdownMenuItem>
    </>
  );
}
