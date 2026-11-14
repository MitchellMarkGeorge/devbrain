import { useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import type { NoteImportSummary, TaskFileFormat, TaskImportSummary } from '@common/types';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SettingsGroup,
  SettingsRow,
  SettingsSection,
  toast,
} from '@renderer/components';
import { ipc, trpc } from '@renderer/ipc';
import { KeyScope } from '@renderer/keyboard';
import { useModals, type ModalProps } from '@renderer/app/modals';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';
import styles from './SettingsPage.module.css';

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** One line of the summary's list: where, and what happened to it. */
export interface ImportLine {
  where: string;
  message: string;
}

/** An import's summary, as its dialog says it (Figma `7423:37433`). */
export function importSummaryText(
  kind: 'tasks' | 'notes',
  summary: TaskImportSummary | NoteImportSummary,
  workspaceName: string,
): { title: string; description: string; lines: ImportLine[] } {
  const noun = kind === 'tasks' ? 'task' : 'note';
  const unit = kind === 'tasks' ? 'row' : 'file';
  const left = summary.skipped.length + summary.errors.length;
  const parts = [`Into ${workspaceName}.`];
  if (left > 0) parts.push(`${plural(left, unit)} ${left === 1 ? 'was' : 'were'} skipped.`);
  if (summary.warnings.length > 0) {
    parts.push(
      `${plural(summary.warnings.length, unit)} imported without something, listed below.`,
    );
  }
  const where = (issue: { row: number } | { file: string }) =>
    'row' in issue ? `Row ${issue.row}` : issue.file;
  const lines = [...summary.errors, ...summary.skipped, ...summary.warnings].map((issue) => ({
    where: where(issue),
    message: issue.message,
  }));
  return {
    title:
      summary.created === 0 ? `No ${noun}s imported` : `Imported ${plural(summary.created, noun)}`,
    description: parts.join(' '),
    lines,
  };
}

function ImportSummaryDialog({
  kind,
  summary,
  workspaceName,
  onView,
  ...modal
}: ModalProps & {
  kind: 'tasks' | 'notes';
  summary: TaskImportSummary | NoteImportSummary;
  workspaceName: string;
  onView: () => void;
}) {
  const text = importSummaryText(kind, summary, workspaceName);
  return (
    <Dialog {...modal}>
      <DialogContent>
        <KeyScope name="dialog" />
        <DialogHeader>
          <DialogTitle>{text.title}</DialogTitle>
          <DialogDescription>{text.description}</DialogDescription>
        </DialogHeader>
        {text.lines.length > 0 && (
          <ul className={styles.issues} aria-label="Not imported">
            {text.lines.map((line, index) => (
              <li key={index} className={styles.issue}>
                <span className={styles.issueWhere}>{line.where}</span>
                <span>{line.message}</span>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Close</DialogClose>
          {summary.created > 0 && (
            <Button
              onClick={() => {
                modal.onOpenChange(false);
                onView();
              }}
            >
              {kind === 'tasks' ? 'View Tasks' : 'View Notes'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The last part of a path: the file or folder's own name. */
function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** Settings › Data & storage (Figma `7158:11416`). */
export function DataStorageSettings() {
  const settings = useSuspenseQuery(trpc.settings.get.queryOptions()).data;
  const workspace = useSuspenseQuery(trpc.workspaces.current.queryOptions()).data;
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const navigate = useNavigate();
  const modals = useModals();
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

  const importFrom = async (kind: 'tasks' | 'notes') => {
    const summary = await run<TaskImportSummary | NoteImportSummary | null>(`import ${kind}`, () =>
      kind === 'tasks' ? ipc.transfer.importTasks.mutate() : ipc.transfer.importNotes.mutate(),
    );
    if (!summary) return;
    modals.open((props) => (
      <ImportSummaryDialog
        {...props}
        kind={kind}
        summary={summary}
        workspaceName={workspace?.name ?? 'the workspace'}
        onView={() =>
          void navigate({
            to: kind === 'tasks' ? '/app/$workspaceId/tasks' : '/app/$workspaceId/notes',
            params: { workspaceId },
          })
        }
      />
    ));
  };

  const exportTasks = async (format: TaskFileFormat) => {
    const result = await run('export tasks', () => ipc.transfer.exportTasks.mutate({ format }));
    if (!result) return;
    toast({
      tone: 'success',
      title: `Exported ${plural(result.count, 'task')}`,
      description: `Saved ${baseName(result.path)}.`,
    });
  };

  const exportNotes = async () => {
    const result = await run('export notes', () => ipc.transfer.exportNotes.mutate());
    if (!result) return;
    toast({
      tone: result.errors.length > 0 ? 'warning' : 'success',
      title: `Exported ${plural(result.count, 'note')}`,
      description:
        result.errors.length > 0
          ? `Saved to ${baseName(result.path)}. ${plural(result.errors.length, 'note')} couldn’t be read and ${result.errors.length === 1 ? 'was' : 'were'} left out.`
          : `Saved to ${baseName(result.path)}.`,
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
