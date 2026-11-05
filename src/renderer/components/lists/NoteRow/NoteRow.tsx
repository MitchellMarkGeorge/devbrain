import { forwardRef } from 'react';
import { FileText } from 'lucide-react';
import { Icon } from '../../ui/Icon';
import { ListRow, type ListRowProps } from '../ListRow';

export interface NoteRowProps extends Omit<
  ListRowProps,
  'icon' | 'title' | 'excerpt' | 'meta' | 'metaWidth'
> {
  title: string;
  /** the note's first line, cut to one line */
  excerpt?: string;
  /** when it was last edited: "2h ago", "Yesterday" */
  edited?: string;
  /** the linked task, event or project as `EntityPill`s */
  children?: ListRowProps['children'];
}

/**
 * A note in the Notes list: the file icon, the title and a one-line excerpt, the pills of what it
 * links to, and when it was edited. A strokeless 48px `ListRow`.
 */
export const NoteRow = forwardRef<HTMLDivElement, NoteRowProps>(function NoteRow(
  { title, excerpt, edited, ...props },
  ref,
) {
  return (
    <ListRow
      ref={ref}
      icon={<Icon icon={FileText} size={16} />}
      title={title}
      excerpt={excerpt}
      meta={edited}
      {...props}
    />
  );
});
