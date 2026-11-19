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
import { usePlatformWords } from '../../lib/platform';

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
  /** reveals the open workspace's folder in the platform's file manager */
  onShowInFolder?: () => void;
}

/**
 * The workspace menu that `WorkspaceButton` opens: "Workspaces", each one with its 16px tile
 * (the open one ticked; the others open on click), then "New workspace…" and "Open folder…",
 * then "Show in Finder" for the open workspace ("Show in Explorer" on Windows, "Show in File
 * Manager" on Linux). Pass it as `WorkspaceButton`'s children.
 */
export function WorkspaceSwitcher({
  workspaces,
  current,
  onSelect,
  onCreate,
  onOpenFolder,
  onShowInFolder,
}: WorkspaceSwitcherProps) {
  const { fileManager } = usePlatformWords();
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
      <DropdownMenuItem icon={SquareArrowOutUpRight} onClick={onShowInFolder}>
        Show in {fileManager}
      </DropdownMenuItem>
    </>
  );
}
