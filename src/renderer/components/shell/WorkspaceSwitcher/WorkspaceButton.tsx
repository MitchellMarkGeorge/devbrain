import type { ReactNode } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../../ui/DropdownMenu';
import { Icon } from '../../ui/Icon';
import { WorkspaceTile } from '../../entities/WorkspaceTile';
import type { Swatch } from '../../types';
import { VisuallyHidden } from '../../layout/VisuallyHidden';
import styles from './WorkspaceButton.module.css';

export interface WorkspaceButtonProps {
  /** the workspace's name; its first letter goes on the tile */
  name: string;
  color?: Swatch;
  /** the workspace menu (`WorkspaceSwitcher`, or `DropdownMenuItem`s) */
  children?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * The open workspace, opening the workspace menu: the 20px tile, the name (14px medium, cut short
 * with "…" when there's no room) and an up-down chevron, pressed while the menu is open. The app
 * puts it in the title bar (`WorkspaceShell`'s `workspace`), where it takes the room the sidebar's
 * width leaves beside the window's start and the sidebar toggle.
 */
export function WorkspaceButton({
  name,
  color,
  children,
  open,
  defaultOpen,
  onOpenChange,
}: WorkspaceButtonProps) {
  return (
    <DropdownMenu open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {/* named by its content, "Workspace: Work", so the name holds the words it shows (WCAG 2.5.3) */}
      <DropdownMenuTrigger className={styles.workspace}>
        <WorkspaceTile letter={name} color={color} />
        <VisuallyHidden>Workspace: </VisuallyHidden>
        <span className={styles.name}>{name}</span>
        <Icon icon={ChevronsUpDown} size={12} className={styles.chevron} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" width="lg">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
