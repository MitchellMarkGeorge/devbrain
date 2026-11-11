import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { FileText } from 'lucide-react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import type { NoteListItem } from '@common/types';
import { EntityPill } from '../../entities/EntityPill';
import { cn } from '../../lib/cn';
import { useFormat } from '../../lib/format';
import { cardVariants } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import styles from './NoteCard.module.css';

export const noteCardVariants = cva(styles.card, {
  variants: {
    withLink: { true: styles.withLink },
    /** `sm`: Home's small card, 86px, one line of title and one of preview */
    size: { default: undefined, sm: styles.sizeSm },
  },
  defaultVariants: { size: 'default' },
});

/** The fields of core's `NoteListItem` a note card reads; pass the row as it is. */
export type NoteCardData = Pick<
  NoteListItem,
  'title' | 'preview' | 'updatedAt' | 'project' | 'link'
>;

export interface NoteCardProps extends Omit<useRender.ComponentProps<'div'>, 'title'> {
  /**
   * core's note as it is: its title, its preview (three lines, two with a pill, one at `sm`; "Empty
   * note" when it has none), when it was edited, and the pill of what it links to (else its
   * project; never at `sm`)
   */
  note: NoteCardData;
  /**
   * `default`: the Notes card view (144px, or 156px with a `link`). `sm`: Home's Recent notes
   * when it is the first section, three in a row (86px, no pill)
   */
  size?: 'default' | 'sm';
}

/**
 * A note as a card, drawn from core's `NoteListItem`: the file icon and edit time ("2h ago"), the title and a `muted-foreground` preview; the
 * time is `subtle-foreground`. Every card in a row has the same height (144px, or 156px with a
 * `link`), so lay them out in a `Grid minColumnWidth="240px"`. `size="sm"` is Home's 86px card,
 * one line each, three in a `HomeCards` row. Opens the note on click (`render={<a href=… />}`).
 */
export const NoteCard = forwardRef<HTMLDivElement, NoteCardProps>(function NoteCard(
  { note, size, render, ...props },
  ref,
) {
  const { formatRelative } = useFormat('minute');
  const link =
    size === 'sm' ? null : note.link ? (
      <EntityPill entity={note.link} />
    ) : note.project ? (
      <EntityPill entity={{ type: 'project', ...note.project }} />
    ) : null;
  return useRender({
    ref,
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(
      {
        className: cn(
          cardVariants({ size: 'compact' }),
          noteCardVariants({ withLink: link != null, size }),
        ),
        tabIndex: 0,
        children: (
          <>
            <div className={styles.top}>
              <Icon icon={FileText} />
              <span>{formatRelative(note.updatedAt)}</span>
            </div>
            <div className={styles.title}>{note.title || 'Untitled'}</div>
            {note.preview?.trim() ? (
              <div className={styles.preview}>{note.preview}</div>
            ) : (
              <div className={styles.preview} data-empty="">
                Empty note
              </div>
            )}
            {link != null && <div className={styles.link}>{link}</div>}
          </>
        ),
      },
      props,
    ),
  });
});
