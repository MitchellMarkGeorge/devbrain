import { forwardRef } from 'react';
import { FileText } from 'lucide-react';
import type { NoteListItem } from '@common/types';
import { EntityPill, type OpenableEntity } from '../../entities/EntityPill';
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
  /**
   * opens what a pill points at, given its summary: the linked task or event, the project. Left
   * out, a click on those pills does nothing (and still doesn't open the note).
   */
  onOpenEntity?: (entity: OpenableEntity) => void;
}

/**
 * A note in the Notes list, drawn from core's `NoteListItem`: the file icon, the title ("Untitled"
 * when it has none) and its preview cut to one line, the pills of the task or event it links to
 * and its project, and when it was edited ("2h ago", from `useFormat()`). A strokeless 48px
 * `ListRow`.
 */
export const NoteRow = forwardRef<HTMLDivElement, NoteRowProps>(function NoteRow(
  { note, onOpenEntity, ...props },
  ref,
) {
  const { formatRelative } = useFormat('minute');
  const { link, project } = note;
  const pills = link || project;
  return (
    <ListRow
      ref={ref}
      icon={<Icon icon={FileText} size={16} />}
      title={note.title || 'Untitled'}
      excerpt={note.preview ?? undefined}
      meta={formatRelative(note.updatedAt)}
      {...props}
    >
      {pills && (
        <>
          {link && (
            <PillHoverCard target={linkTarget(link)}>
              <EntityPill entity={link} onClick={onOpenEntity && (() => onOpenEntity(link))} />
            </PillHoverCard>
          )}
          {project && (
            <PillHoverCard target={{ type: 'project', ...project }}>
              <EntityPill
                entity={{ type: 'project', ...project }}
                onClick={onOpenEntity && (() => onOpenEntity(project))}
              />
            </PillHoverCard>
          )}
        </>
      )}
    </ListRow>
  );
});
