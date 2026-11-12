import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import type { Event } from '@common/types';
import { ipc, trpc } from '../../../ipc';
import { useModals } from '../../../modals';
import { useConfirm } from '../../app/use-confirm';
import { useMutationErrorToast } from '../../app/mutation-errors';
import { repeatText } from '../repeat';
import {
  deleteScopes,
  editScopes,
  planDelete,
  planEdit,
  seriesOccurrenceOf,
  type DeleteCall,
  type EditCall,
  type EventPatch,
  type EventTarget,
  type OccurrenceScope,
} from './occurrence';
import { ScopeDialog } from './ScopeDialog';

/** "Mon, Jun 22" */
export function dayText(date: Date): string {
  return DateTime.fromJSDate(date).toFormat('ccc, LLL d');
}

function runEdit(call: EditCall): Promise<Event> {
  return call.route === 'update'
    ? ipc.events.update.mutate(call.input)
    : ipc.events.updateOccurrence.mutate(call.input);
}

function runDelete(call: DeleteCall): Promise<void> {
  return call.route === 'delete'
    ? ipc.events.delete.mutate(call.input)
    : ipc.events.deleteOccurrence.mutate(call.input);
}

export interface EditOptions {
  /** what the change is, for the series question: "2:00 – 3:00 PM" ("…should change to …?") */
  summary?: string;
  /** saved: the event that now holds the change (an occurrence's own row, a new series) */
  onSaved?: (event: Event, scope: OccurrenceScope) => void;
}

/**
 * Edits and deletes an event from the sheet. A one-off is changed at once (a delete asks first,
 * as `confirmBeforeDeleting` says); an occurrence of a series always asks which occurrences
 * (`ScopeDialog`), then calls that choice's route (`planEdit`, `planDelete`).
 */
export function useEventActions() {
  const modals = useModals();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const showEditError = useMutationErrorToast('Couldn’t save the event');
  const showDeleteError = useMutationErrorToast('Couldn’t delete the event');

  // the series' master: the target itself, or fetched for an occurrence row
  const seriesOf = useCallback(
    async (target: EventTarget, seriesId: Event['id']) =>
      target.event.id === seriesId
        ? target.event
        : queryClient.fetchQuery(trpc.events.get.queryOptions({ id: seriesId })),
    [queryClient],
  );

  const edit = useCallback(
    async (target: EventTarget, patch: EventPatch, options: EditOptions = {}) => {
      const save = (scope: OccurrenceScope, series?: Event) =>
        runEdit(planEdit(target, scope, patch, series))
          .then((saved) => options.onSaved?.(saved, scope))
          .catch((error: unknown) => showEditError(error));
      const occurrence = seriesOccurrenceOf(target);
      if (!occurrence) return save('all');
      let series: Event;
      try {
        series = await seriesOf(target, occurrence.seriesId);
      } catch (error) {
        showEditError(error);
        return;
      }
      const repeats = repeatText(series.recurrenceRule, series.startAt).toLowerCase();
      const day = dayText(occurrence.start);
      modals.open((props) => (
        <ScopeDialog
          {...props}
          title="Change a recurring event"
          description={`${series.title} repeats ${repeats}. Which events should change${
            options.summary ? ` to ${options.summary}` : ''
          }?`}
          choices={editScopes(patch, series.recurrenceRule)}
          describe={(scope) =>
            scope === 'this'
              ? `Only ${day}. The rest of the series stays as it is.`
              : scope === 'following'
                ? `${day} and every later ${series.title}.`
                : `Every ${series.title} in the series.`
          }
          actionLabel="Save"
          onChoose={(scope) => void save(scope, series)}
        />
      ));
    },
    [modals, seriesOf, showEditError],
  );

  const remove = useCallback(
    async (target: EventTarget, onDeleted?: () => void) => {
      const del = (scope: OccurrenceScope) =>
        runDelete(planDelete(target, scope))
          .then(() => onDeleted?.())
          .catch((error: unknown) => showDeleteError(error));
      const description =
        'Its event note is kept and no longer linked to an event. Linked tasks stay as they are.';
      const occurrence = seriesOccurrenceOf(target);
      if (!occurrence) {
        const ok = await confirm({
          kind: 'delete',
          title: `Delete ${target.event.title}?`,
          description,
          irreversible: true,
          actionLabel: 'Delete Event',
        });
        if (ok) await del('all');
        return;
      }
      let series: Event;
      try {
        series = await seriesOf(target, occurrence.seriesId);
      } catch (error) {
        showDeleteError(error);
        return;
      }
      const day = dayText(occurrence.start);
      modals.open((props) => (
        <ScopeDialog
          {...props}
          title={`Delete ${series.title}?`}
          description={`${description} This can’t be undone.`}
          choices={deleteScopes(series.recurrenceRule)}
          describe={(scope) =>
            scope === 'this'
              ? `Only ${day}.`
              : scope === 'following'
                ? `${day} and every later ${series.title}.`
                : `Every ${series.title} in the series.`
          }
          actionLabel="Delete Event"
          destructive
          onChoose={(scope) => void del(scope)}
        />
      ));
    },
    [confirm, modals, seriesOf, showDeleteError],
  );

  return { edit, remove };
}
