import { forwardRef } from 'react';
import { FileText } from 'lucide-react';
import type { NoteListItem } from '@common/types';
import { EntityPill } from '../../entities/EntityPill';
import { linkTarget, PillHoverCard } from '../../entities/EntityHoverCard';
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
 * A note in the Notes list, drawn from core's `NoteListItem`: the file icon, the title ("Untitled"
 * when it has none) and its preview cut to one line, the pills of the task or event it links to
 * and its project, and the day it was last edited ("Nov 20"; "Dec 2025" in another year, from `useFormat()`'s
 * `formatListDate`). A strokeless 48px
 * `ListRow`.
 */
export const NoteRow = forwardRef<HTMLDivElement, NoteRowProps>(function NoteRow(
  { note, ...props },
  ref,
) {
  const { formatListDate } = useFormat();
  const pills = note.link || note.project;
  return (
    <ListRow
      ref={ref}
      icon={<Icon icon={FileText} size={16} />}
      title={note.title || 'Untitled'}
      excerpt={note.preview ?? undefined}
      meta={formatListDate(note.updatedAt)}
      {...props}
    >
      {pills && (
        <>
          {note.link && (
            <PillHoverCard target={linkTarget(note.link)}>
              <EntityPill entity={note.link} />
            </PillHoverCard>
          )}
          {note.project && (
            <PillHoverCard target={{ type: 'project', ...note.project }}>
              <EntityPill entity={{ type: 'project', ...note.project }} />
            </PillHoverCard>
          )}
        </>
      )}
    </ListRow>
  );
});
