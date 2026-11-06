import type { ReactNode, Ref } from 'react';
import { FileText } from 'lucide-react';
import { menuStyles } from '../../ui/DropdownMenu';
import { Icon } from '../../ui/Icon';
import {
  SuggestionMenu,
  type SuggestionGroup,
  type SuggestionMenuHandle,
  type SuggestionMenuProps,
} from '../SlashMenu';
import { StatusIcon } from '../../entities/StatusIcon';
import type { TaskStatus } from '@common/types';
import { cssColor, type Swatch } from '../../types';
import styles from './MentionMenu.module.css';

/** Something "@" can mention. */
export type MentionItem =
  | { kind: 'task'; id: string; title: string; status: TaskStatus; meta?: ReactNode }
  | { kind: 'note'; id: string; title: string; meta?: ReactNode }
  | { kind: 'event'; id: string; title: string; color: Swatch | string; meta?: ReactNode };

export interface MentionMenuProps extends Omit<
  SuggestionMenuProps<MentionItem>,
  'groups' | 'getKey' | 'renderItem'
> {
  /** the matches for what was typed after "@", already searched: Tasks, Notes, Events */
  groups: SuggestionGroup<MentionItem>[];
  handleRef?: Ref<SuggestionMenuHandle>;
}

// wrapped, so the menu item's muted icon colour doesn't reach a task's status colours
function Glyph({ item }: { item: MentionItem }) {
  return (
    <span className={styles.glyph} data-kind={item.kind} aria-hidden>
      {item.kind === 'task' ? (
        <StatusIcon status={item.status} size={16} />
      ) : item.kind === 'note' ? (
        <Icon icon={FileText} size={16} />
      ) : (
        <span className={styles.bar} style={{ background: cssColor(item.color) }} />
      )}
    </span>
  );
}

/**
 * The editor's "@" menu, 320px wide under the caret: matching tasks (their status icon), notes
 * and events (their calendar's bar), each with a quiet date on the right. The app searches; the
 * menu shows the groups it is given and lets ↑, ↓ and Enter pick.
 */
export function MentionMenu({ groups, ...props }: MentionMenuProps) {
  return (
    <SuggestionMenu
      aria-label="Mention"
      className={styles.menu}
      groups={groups}
      getKey={(item) => `${item.kind}:${item.id}`}
      renderItem={(item) => (
        <>
          <Glyph item={item} />
          <span className={menuStyles.itemLabel}>{item.title}</span>
          {item.meta != null && <span className={styles.meta}>{item.meta}</span>}
        </>
      )}
      {...props}
    />
  );
}
