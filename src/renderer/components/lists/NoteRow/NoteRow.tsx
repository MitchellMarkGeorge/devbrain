import { forwardRef } from 'react';
import { FileText } from 'lucide-react';
import type { NoteListItem } from '@common/types';
import { EntityPill } from '../../entities/EntityPill';
import { useFormat } from '../../lib/format';
import { Icon } from '../../ui/Icon';
import { ListRow, type ListRowProps } from '../ListRow';

/** The fields of core's `NoteListItem` a note row reads; pass the row as it is. */
export type NoteRowData = Pick<
  NoteListItem,
  'title' | 'preview' | 'updatedAt' | 'project' | 'link'
>;

export interface NoteRowProps extends Omit<
  ListRowProps,
  'icon' | 'title' | 'excerpt' | 'meta' | 'metaWidth' | 'children'
> {
  note: NoteRowData;
}

/**
 * A note in the Notes list, drawn from core's `NoteListItem`: the file icon, the title and its
 * preview cut to one line, the pills of the task or event it links to and its project, and when it
 * was edited ("2h ago", from `useFormat()`). A strokeless 48px `ListRow`.
 */
export const NoteRow = forwardRef<HTMLDivElement, NoteRowProps>(function NoteRow(
  { note, ...props },
  ref,
) {
  const { formatRelative } = useFormat('minute');
  const pills = note.link || note.project;
  return (
    <ListRow
      ref={ref}
      icon={<Icon icon={FileText} size={16} />}
      title={note.title}
      excerpt={note.preview ?? undefined}
      meta={formatRelative(note.updatedAt)}
      {...props}
    >
      {pills && (
        <>
          {note.link && <EntityPill entity={note.link} />}
          {note.project && <EntityPill entity={{ type: 'project', ...note.project }} />}
        </>
      )}
    </ListRow>
  );
});
