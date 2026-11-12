import { useCallback } from 'react';
import type { Event } from '@common/types';
import { useModals } from '../../../modals';
import { CreateEventDialog, type EventDraftRange } from './CreateEventDialog';

/**
 * Opens the New event dialog over `range`: the header's New Event, or a slot selected on the
 * grid. `onOpenEvent` is its toast's "Open".
 */
export function useCreateEvent(onOpenEvent?: (event: Event) => void) {
  const modals = useModals();
  return useCallback(
    (range: EventDraftRange) => {
      modals.open((props) => (
        <CreateEventDialog {...props} range={range} onOpenEvent={onOpenEvent} />
      ));
    },
    [modals, onOpenEvent],
  );
}
