/**
 * The sidebar as it is now (the pages, Recents, Favorites), with only its footer changed to the
 * one-row `SidebarFooterBar`. Nothing in the app uses it.
 */
import { Calendar, CircleCheck, Ellipsis, FileText, Folder, House, Trash2 } from 'lucide-react';
import { TaskStatus } from '@common/types';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarItem,
} from '../../shell/Sidebar';
import { StatusIcon } from '../../entities/StatusIcon';
import type { SyncState } from '../../shell/SyncStatus';
import type { PageName } from '../Shell/AppFrame';
import { SidebarFooterBar } from './SidebarFooterBar';

const NAV = [
  { label: 'Home', icon: House },
  { label: 'Tasks', icon: CircleCheck },
  { label: 'Projects', icon: Folder },
  { label: 'Notes', icon: FileText },
  { label: 'Calendar', icon: Calendar },
] as const;

export interface CurrentSidebarWithBarProps {
  active?: PageName;
  sync?: SyncState;
  /** keep Trash as an item row above the bar instead of an icon in it */
  trashRow?: boolean;
}

export function CurrentSidebarWithBar({ active, sync, trashRow }: CurrentSidebarWithBarProps) {
  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          {NAV.map((page) => (
            <SidebarItem key={page.label} icon={page.icon} active={active === page.label}>
              {page.label}
            </SidebarItem>
          ))}
        </SidebarGroup>
        <SidebarGroup label="Recents">
          <SidebarItem icon={<StatusIcon status={TaskStatus.IN_PROGRESS} />}>
            Implement OAuth2 PKCE flow
          </SidebarItem>
          <SidebarItem icon={<StatusIcon status={TaskStatus.IN_PROGRESS} />}>
            Refactor token refresh logic
          </SidebarItem>
          <SidebarItem bar="green">Mitchell / Jesse 1:1</SidebarItem>
          <SidebarItem icon={Folder}>Auth Overhaul</SidebarItem>
          <SidebarItem icon={FileText}>PKCE design notes</SidebarItem>
        </SidebarGroup>
        <SidebarGroup label="Favorites">
          <SidebarItem icon={Folder}>API Gateway v2</SidebarItem>
          <SidebarItem bar="green">Sprint Planning</SidebarItem>
          <SidebarItem icon={FileText}>Auth provider eval matrix</SidebarItem>
          <SidebarItem icon={Ellipsis}>More</SidebarItem>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {trashRow && (
          <SidebarItem icon={Trash2} active={active === 'Trash'}>
            Trash
          </SidebarItem>
        )}
        <SidebarFooterBar
          sync={sync}
          trash={!trashRow}
          active={active === 'Trash' || active === 'Settings' ? active : undefined}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
