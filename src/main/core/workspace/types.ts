import { WorkspaceId } from '@common/ids';

export interface WorkspaceInfo {
  id: WorkspaceId;
  name: string;
  color: string | null;
  path: string;
  createdAt: number;
  lastOpenedAt: number | null;
}

export interface CreateWorkspaceOptions {
  name: string;
  color: string;
}
