import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import type {
  NoteExportResult,
  NoteImportSummary,
  TaskExportResult,
  TaskFileFormat,
  TaskImportSummary,
} from '@common/types';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@renderer/components';
import { ipc, trpc } from '@renderer/ipc';
import { KeyScope, useCommands, type Command } from '@renderer/keyboard';
import { useModals, type ModalProps } from '@renderer/app/modals';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';
import styles from '../components/SettingsPage.module.css';

// Importing and exporting the open workspace's tasks and notes, as Settings › Import & export's
// buttons and the app menu's File › Import and Export both run it (docs/import-export.md): the
// transfer route, which asks for the file with the system dialog, then the summary dialog for an
// import, a toast with Show in Finder for an export, or an error toast. One at a time, wherever it
// was started: each opens a system dialog.

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

/** The last part of a path: the file or folder's own name. */
function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** An export's toast, as Figma `7423:37520` draws it (Show in Finder is the toast's action). */
export function exportToastText(
  result: { kind: 'tasks'; result: TaskExportResult } | { kind: 'notes'; result: NoteExportResult },
): { tone: 'success' | 'warning'; title: string; description: string } {
  const name = baseName(result.result.path);
  if (result.kind === 'tasks') {
    return {
      tone: 'success',
      title: `Exported ${plural(result.result.count, 'task')}`,
      description: `Saved ${name}.`,
    };
  }
  const left = result.result.errors.length;
  return {
    tone: left > 0 ? 'warning' : 'success',
    title: `Exported ${plural(result.result.count, 'note')}`,
    description:
      left > 0
        ? `Saved to ${name}. ${plural(left, 'note')} couldn’t be read and ${left === 1 ? 'was' : 'were'} left out.`
        : `Saved to ${name}.`,
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

/** The transfers, whichever entry point started one; for the key that counts them. */
const TRANSFER_KEY = ['settings.transfer'] as const;

export interface Transfers {
  /** a transfer is running (its system dialog is up, or core is reading or writing) */
  running: boolean;
  importTasks(): Promise<void>;
  importNotes(): Promise<void>;
  exportTasks(format: TaskFileFormat): Promise<void>;
  exportNotes(): Promise<void>;
}

/**
 * Runs an import or export and shows what it did. A call while another transfer runs (from the
 * page or the menu) does nothing. Show in Finder asks main to show the file or folder the export
 * wrote (`transfer.showExport`, with the path its route returned).
 */
export function useTransfers(): Transfers {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const modals = useModals();
  const showError = useMutationErrorToast();
  const running = useIsMutating({ mutationKey: TRANSFER_KEY }) > 0;
  const { mutateAsync } = useMutation({
    mutationKey: TRANSFER_KEY,
    mutationFn: (work: () => Promise<unknown>) => work(),
  });

  // null when it failed (shown as a toast) or another transfer is running
  const run = async <T,>(what: string, work: () => Promise<T>): Promise<T | null> => {
    if (queryClient.isMutating({ mutationKey: TRANSFER_KEY }) > 0) return null;
    try {
      return (await mutateAsync(work)) as T;
    } catch (error) {
      showError(error, `Couldn’t ${what}`);
      return null;
    }
  };

  const showImport = (kind: 'tasks' | 'notes', summary: TaskImportSummary | NoteImportSummary) => {
    // read when shown, not watched: the open workspace's info is always in the cache (main
    // reports every change to it), and the layout needn't observe it
    const workspace = queryClient.getQueryData(trpc.workspaces.current.queryKey());
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

  const showExport = (text: ReturnType<typeof exportToastText>, path: string) =>
    toast({
      ...text,
      action: {
        label: 'Show in Finder',
        onClick: () =>
          void ipc.transfer.showExport
            .mutate({ path })
            .catch((error: unknown) => showError(error, 'Couldn’t show the export')),
      },
    });

  return {
    running,
    async importTasks() {
      const summary = await run('import tasks', () => ipc.transfer.importTasks.mutate());
      if (summary) showImport('tasks', summary);
    },
    async importNotes() {
      const summary = await run('import notes', () => ipc.transfer.importNotes.mutate());
      if (summary) showImport('notes', summary);
    },
    async exportTasks(format) {
      const result = await run('export tasks', () => ipc.transfer.exportTasks.mutate({ format }));
      if (result) showExport(exportToastText({ kind: 'tasks', result }), result.path);
    },
    async exportNotes() {
      const result = await run('export notes', () => ipc.transfer.exportNotes.mutate());
      if (result) showExport(exportToastText({ kind: 'notes', result }), result.path);
    },
  };
}

/**
 * Registers the transfers as commands while a workspace is open, so the app menu's File › Import
 * and Export (`app.command`) run the Settings page's own flow. They have no keys, and ⌘K lists
 * only Go to, so they show nowhere else. Called by the workspace layout.
 */
export function useTransferCommands(): void {
  const transfers = useTransfers();
  const command = (id: string, title: string, run: () => Promise<void>): Command => ({
    id,
    title,
    scope: 'global',
    run: () => run(),
    enabled: () => !transfers.running,
  });
  useCommands([
    command('transfer.importTasks', 'Import tasks', transfers.importTasks),
    command('transfer.importNotes', 'Import notes', transfers.importNotes),
    command('transfer.exportTasksCsv', 'Export tasks as CSV', () => transfers.exportTasks('csv')),
    command('transfer.exportTasksJson', 'Export tasks as JSON', () =>
      transfers.exportTasks('json'),
    ),
    command('transfer.exportNotes', 'Export notes', transfers.exportNotes),
  ]);
}
