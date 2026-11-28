import { EventSheet } from '@renderer/features/calendar/components/sheet/EventSheet';
import { NoteSheet } from '@renderer/features/notes/components/sheet/NoteSheet';
import { TaskSheet } from '@renderer/features/tasks/components/sheet/TaskSheet';
import type { SheetContents } from '@renderer/shared/hooks/use-sheet-navigation';

/**
 * What a page's sheet draws for each kind of item (`useSheet().render()`): the one place that
 * names the sheets' components, given to every page by the workspace layout.
 */
export const SHEET_CONTENTS: SheetContents = {
  task: (item) => <TaskSheet taskId={item.id} />,
  note: (item) => (
    <NoteSheet noteId={item.id} occurrence={item.occurrence} created={item.created} />
  ),
  event: (item) => <EventSheet eventId={item.id} occurrence={item.occurrence} />,
};
