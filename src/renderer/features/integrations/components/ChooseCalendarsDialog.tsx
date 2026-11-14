import { useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ExternalSourceId } from '@common/ids';
import type { Calendar, Integration } from '@common/types';
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ProviderTile,
  SwatchDot,
} from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { KeyScope } from '@renderer/keyboard';
import type { ModalProps } from '@renderer/app/modals';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';
import styles from './IntegrationsPage.module.css';

/** The calendars a source syncs from, the account's own first. */
export function calendarsOf(
  calendars: readonly Calendar[],
  sourceId: ExternalSourceId,
): Calendar[] {
  return calendars
    .filter((calendar) => calendar.sourceId === sourceId)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name));
}

export interface ChooseCalendarsDialogProps extends ModalProps {
  integration: Pick<Integration, 'accountLabel'>;
  sourceId: ExternalSourceId;
}

/**
 * Choose calendars (Figma `7175:34407`): which of the account's calendars sync. Each tick is saved
 * at once (`calendars.setSelected`), and core syncs the source to bring the calendar's events in
 * or take them out.
 */
export function ChooseCalendarsDialog({
  integration,
  sourceId,
  ...modal
}: ChooseCalendarsDialogProps) {
  const calendars = calendarsOf(useQuery(trpc.calendars.list.queryOptions()).data ?? [], sourceId);
  const showError = useMutationErrorToast('Couldn’t change the calendar');
  const select = useMutation(
    trpc.calendars.setSelected.mutationOptions({ onError: (error) => showError(error) }),
  );
  // the calendars being saved: a click on a tick inside its label can arrive twice
  const saving = useRef(new Set<string>());
  const toggle = (calendar: Calendar, value: boolean) => {
    if (saving.current.has(calendar.id)) return;
    saving.current.add(calendar.id);
    select.mutate(
      { id: calendar.id, selected: value },
      { onSettled: () => saving.current.delete(calendar.id) },
    );
  };
  // the tick being saved shows its new value until the list has it
  const selected = (calendar: Calendar) =>
    select.isPending && select.variables.id === calendar.id
      ? select.variables.selected
      : calendar.selected;
  const count = calendars.filter(selected).length;

  return (
    <Dialog {...modal}>
      <DialogContent>
        <KeyScope name="dialog" />
        <DialogHeader className={styles.dialogHeader}>
          <ProviderTile provider="google-calendar" size={32} />
          <div>
            <DialogTitle>Choose calendars</DialogTitle>
            <DialogDescription>{integration.accountLabel} · Google Calendar</DialogDescription>
          </div>
        </DialogHeader>
        <p className={styles.dialogText}>
          Events from the calendars you pick sync into DevBrain. The others stay in Google.
        </p>
        {calendars.length === 0 ? (
          <p className={styles.dialogText}>No calendars yet. They appear after the first sync.</p>
        ) : (
          <div className={styles.calendarList} role="group" aria-label="Calendars">
            {calendars.map((calendar) => (
              <label key={calendar.id} className={styles.calendarRow}>
                <Checkbox
                  checked={selected(calendar)}
                  disabled={select.isPending}
                  onCheckedChange={(checked) => toggle(calendar, checked)}
                />
                <SwatchDot color={calendar.color ?? 'blue'} />
                <span className={styles.calendarName}>{calendar.name}</span>
                {calendar.isPrimary && <span className={styles.calendarMeta}>Primary</span>}
              </label>
            ))}
          </div>
        )}
        <DialogFooter className={styles.spreadFooter}>
          <span className={styles.calendarMeta}>
            {count} of {calendars.length} selected
          </span>
          <DialogClose render={<Button />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
