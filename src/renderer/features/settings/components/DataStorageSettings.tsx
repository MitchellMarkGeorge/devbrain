import { useSuspenseQuery } from '@tanstack/react-query';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SettingsGroup,
  SettingsRow,
  SettingsSection,
} from '@renderer/components';
import { usePlatformWords } from '@renderer/components/lib/platform';
import { ipc, trpc } from '@renderer/ipc';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';
import { useTransfers } from '../hooks/use-transfers';

/** Settings › Data & storage, for every workspace: where DevBrain keeps them (Figma `7158:11416`). */
export function DataStorageSettings() {
  const settings = useSuspenseQuery(trpc.settings.get.queryOptions()).data;
  const showError = useMutationErrorToast();
  const { fileManager } = usePlatformWords();
  return (
    <SettingsSection title="Storage">
      <SettingsGroup>
        <SettingsRow
          label="Data folder"
          description="Where DevBrain keeps your workspaces."
          value={settings.devBrainPath}
          control={
            <Button
              onClick={() =>
                ipc.settings.showDataFolder
                  .mutate()
                  .catch((error: unknown) => showError(error, 'Couldn’t show the folder'))
              }
            >
              Show in {fileManager}
            </Button>
          }
        />
      </SettingsGroup>
    </SettingsSection>
  );
}

/**
 * Settings › Import & export, under Current workspace: tasks and notes into the open workspace,
 * and out of it (Figma `7158:11416`'s Import & export).
 */
export function ImportExportSettings() {
  // the app menu's File › Import and Export run the same (useTransferCommands)
  const transfers = useTransfers();
  const disabled = transfers.running;
  return (
    <SettingsSection title="Import & export">
      <SettingsGroup>
        <SettingsRow
          label="Import tasks"
          description="From a CSV or JSON file."
          control={
            <Button disabled={disabled} onClick={() => void transfers.importTasks()}>
              Choose File
            </Button>
          }
        />
        <SettingsRow
          label="Import notes"
          description="From Markdown files."
          control={
            <Button disabled={disabled} onClick={() => void transfers.importNotes()}>
              Choose Files
            </Button>
          }
        />
        <SettingsRow
          label="Export tasks"
          description="Download as CSV or JSON."
          control={
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button disabled={disabled}>Export</Button>} />
              <DropdownMenuContent width="sm" align="end">
                <DropdownMenuItem onClick={() => void transfers.exportTasks('csv')}>
                  CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void transfers.exportTasks('json')}>
                  JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
        <SettingsRow
          label="Export notes"
          description="Download as Markdown files."
          control={
            <Button disabled={disabled} onClick={() => void transfers.exportNotes()}>
              Export
            </Button>
          }
        />
      </SettingsGroup>
    </SettingsSection>
  );
}
