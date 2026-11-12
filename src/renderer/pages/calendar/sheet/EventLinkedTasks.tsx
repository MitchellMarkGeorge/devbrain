import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type { EventId, TaskId } from '@common/ids';
import { AddSlot, Button, DetailSection, LinkedTaskRow } from '../../../components';
import { trpc } from '../../../ipc';
import { useCreateTask } from '../../tasks/create/use-create-task';
import { useTaskActions } from '../../tasks/use-task-actions';

/**
 * The event's linked tasks (the tasks whose `linkedEventId` is the event): a row each, opening
 * its sheet, with "+ Add" (or the empty "+ Add a task") creating one linked to the event.
 */
export function EventLinkedTasks({
  eventId,
  onOpenTask,
}: {
  eventId: EventId;
  onOpenTask: (id: TaskId) => void;
}) {
  const createTask = useCreateTask();
  const actions = useTaskActions();
  const tasks = useQuery(trpc.tasks.list.queryOptions({ filter: { eventId }, limit: 50 }));
  const items = tasks.data?.items ?? [];
  const add = () => createTask({ defaults: { linkedEventId: eventId } });
  return (
    <DetailSection
      title="Linked tasks"
      count={items.length > 0 ? items.length : undefined}
      action={
        <Button size="xs" icon={Plus} onClick={add}>
          Add
        </Button>
      }
      data-testid="event-linked-tasks"
    >
      {items.length > 0 ? (
        <div>
          {items.map((task) => (
            <LinkedTaskRow
              key={task.id}
              task={task}
              onOpen={() => onOpenTask(task.id)}
              onStatusChange={(status) => actions.setStatus([task], status)}
            />
          ))}
        </div>
      ) : (
        tasks.isSuccess && <AddSlot onClick={add}>Add a task</AddSlot>
      )}
    </DetailSection>
  );
}
