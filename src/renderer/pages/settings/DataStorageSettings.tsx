import { useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { TaskFileFormat } from '@common/types';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SettingsGroup,
  SettingsRow,
  SettingsSection,
} from '../../components';
import { ipc, trpc } from '../../ipc';
import { useMutationErrorToast } from '../app/mutation-errors';
import { useShowTransferReport } from './transfer-reports';

/** The last part of a path: the file or folder's own name. */
function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** Settings › Data & storage (Figma `7158:11416`). */
export function DataStorageSettings() {
  const settings = useSuspenseQuery(trpc.settings.get.queryOptions()).data;
  const showReport = useShowTransferReport();
  const showError = useMutationErrorToast();
  const [busy, setBusy] = useState<string | null>(null);

  // one transfer at a time: each opens a system dialog
  const run = async <T,>(what: string, work: () => Promise<T>): Promise<T | null> => {
    setBusy(what);
    try {
      return await work();
    } catch (error) {
      showError(error, `Couldn’t ${what}`);
      return null;
    } finally {
      setBusy(null);
    }
  };

  // the same dialog and toasts as an import or export from the app menu
  const importFrom = async (kind: 'tasks' | 'notes') => {
    if (kind === 'tasks') {
      const summary = await run('import tasks', () => ipc.transfer.importTasks.mutate());
      if (summary) showReport({ type: 'tasksImported', summary });
    } else {
      const summary = await run('import notes', () => ipc.transfer.importNotes.mutate());
      if (summary) showReport({ type: 'notesImported', summary });
    }
  };

  const exportTasks = async (format: TaskFileFormat) => {
    const result = await run('export tasks', () => ipc.transfer.exportTasks.mutate({ format }));
    if (!result) return;
    showReport({
      type: 'tasksExported',
      name: baseName(result.path),
      format: result.format,
      count: result.count,
    });
  };

  const exportNotes = async () => {
    const result = await run('export notes', () => ipc.transfer.exportNotes.mutate());
    if (!result) return;
    showReport({
      type: 'notesExported',
      name: baseName(result.path),
      count: result.count,
      errors: result.errors.length,
    });
  };

  const disabled = busy !== null;
  return (
    <>
      <SettingsSection title="Storage">
        <SettingsGroup>
          <SettingsRow
            label="Data folder"
            description="Where DevBrain keeps your workspace."
            value={settings.devBrainPath}
            control={
              <Button
                onClick={() =>
                  ipc.settings.showDataFolder
                    .mutate()
                    .catch((error: unknown) => showError(error, 'Couldn’t show the folder'))
                }
              >
                Show in Finder
              </Button>
            }
          />
        </SettingsGroup>
      </SettingsSection>
      <SettingsSection title="Import & export">
        <SettingsGroup>
          <SettingsRow
            label="Import tasks"
            description="From a CSV or JSON file."
            control={
              <Button disabled={disabled} onClick={() => void importFrom('tasks')}>
                Choose File
              </Button>
            }
          />
          <SettingsRow
            label="Import notes"
            description="From Markdown files."
            control={
              <Button disabled={disabled} onClick={() => void importFrom('notes')}>
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
                  <DropdownMenuItem onClick={() => void exportTasks('csv')}>CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void exportTasks('json')}>JSON</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
          <SettingsRow
            label="Export notes"
            description="Download as Markdown files."
            control={
              <Button disabled={disabled} onClick={() => void exportNotes()}>
                Export
              </Button>
            }
          />
        </SettingsGroup>
      </SettingsSection>
    </>
  );
}
