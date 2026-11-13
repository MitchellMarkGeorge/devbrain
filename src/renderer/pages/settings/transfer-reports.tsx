import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import type { NoteImportSummary, TaskImportSummary, TransferReport } from '@common/types';
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
} from '../../components';
import { events, ipc, trpc } from '../../ipc';
import { KeyScope } from '../../keyboard';
import { useModals, type ModalProps } from '../../modals';
import { useMutationErrorToast } from '../app/mutation-errors';
import styles from './SettingsPage.module.css';

// What an import or export shows when it ends: the summary dialog for an import, a toast with Show
// in Finder for an export. The Settings buttons and the app menu (the transfer.completed event)
// both show them, so the two entry points behave alike.

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

/** An export's toast, as Figma `7423:37520` draws it (Show in Finder is the toast's action). */
export function exportToastText(
  report: Extract<TransferReport, { type: 'tasksExported' | 'notesExported' }>,
): { tone: 'success' | 'warning'; title: string; description: string } {
  if (report.type === 'tasksExported') {
    return {
      tone: 'success',
      title: `Exported ${plural(report.count, 'task')}`,
      description: `Saved ${report.name}.`,
    };
  }
  const left = report.errors;
  return {
    tone: left > 0 ? 'warning' : 'success',
    title: `Exported ${plural(report.count, 'note')}`,
    description:
      left > 0
        ? `Saved to ${report.name}. ${plural(left, 'note')} couldn’t be read and ${left === 1 ? 'was' : 'were'} left out.`
        : `Saved to ${report.name}.`,
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

/**
 * Shows what an import or export did, in the open workspace: an import's summary dialog (with View
 * Tasks / View Notes), or an export's toast, whose Show in Finder asks main to show the file this
 * window's last export wrote (`transfer.showExport`; the renderer never names a path).
 */
export function useShowTransferReport(): (report: TransferReport) => void {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const modals = useModals();
  const showError = useMutationErrorToast();

  return (report) => {
    if (report.type === 'tasksImported' || report.type === 'notesImported') {
      // read when shown, not watched: the open workspace's info is always in the cache (main
      // reports every change to it), and the layout needn't observe it
      const workspace = queryClient.getQueryData(trpc.workspaces.current.queryKey());
      const kind = report.type === 'tasksImported' ? 'tasks' : 'notes';
      modals.open((props) => (
        <ImportSummaryDialog
          {...props}
          kind={kind}
          summary={report.summary}
          workspaceName={workspace?.name ?? 'the workspace'}
          onView={() =>
            void navigate({
              to: kind === 'tasks' ? '/app/$workspaceId/tasks' : '/app/$workspaceId/notes',
              params: { workspaceId },
            })
          }
        />
      ));
      return;
    }
    toast({
      ...exportToastText(report),
      action: {
        label: 'Show in Finder',
        onClick: () =>
          void ipc.transfer.showExport
            .mutate()
            .catch((error: unknown) => showError(error, 'Couldn’t show the export')),
      },
    });
  };
}

/**
 * Shows what an import or export run from the app menu did (the `transfer.completed` event), as
 * the Settings buttons do. A report for another workspace than this window's is dropped: it ran in
 * a workspace this window has since left. Called by the workspace layout.
 */
export function useMenuTransferReports(): void {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const show = useShowTransferReport();
  // the newest render's `show`, without subscribing again on every render
  const latest = useRef(show);
  useEffect(() => {
    latest.current = show;
  });
  useEffect(
    () =>
      events.on('transfer.completed', (payload) => {
        if (payload.workspaceId === workspaceId) latest.current(payload.report);
      }),
    [workspaceId],
  );
}
