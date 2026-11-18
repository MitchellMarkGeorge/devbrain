import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { PreviewCard } from '@base-ui/react/preview-card';
import type { EventId, NoteId, ProjectId, TaskId } from '@common/ids';
import type { ExternalRef, SubtaskProgress } from '@common/types';
import { subtasksDoneLabel } from '../../types';
import { Skeleton } from '../../ui/Skeleton';
import styles from './EntityHoverCard.module.css';

/**
 * What a pill in a row or card points at, for its hover card: the item's type and id, with the
 * title the pill already shows (the card's name while it loads), or a synced task's source, which
 * the row holds in full.
 */
export type PillTarget =
  | { type: 'project'; id: ProjectId; title: string }
  | { type: 'event'; id: EventId; title: string }
  | { type: 'note'; id: NoteId; title: string }
  | { type: 'task'; id: TaskId; title: string }
  | { type: 'source'; title: string; external: ExternalRef }
  /** a task's subtask count: the task's id, and the count as the card's name ("3 of 4 subtasks done") */
  | { type: 'subtasks'; id: TaskId; title: string };

/** The target of a task's subtask count pill. */
export function subtasksTarget(id: TaskId, progress: SubtaskProgress): PillTarget {
  return { type: 'subtasks', id, title: subtasksDoneLabel(progress) };
}

/** A link as core's summaries give it (`task.link`, `note.link`): its type, id and title. */
type LinkSummary =
  | { type: 'event'; id: EventId; title: string }
  | { type: 'note'; id: NoteId; title: string }
  | { type: 'task'; id: TaskId; title: string };

/** The target of a task's or note's `link` pill. */
export function linkTarget(link: LinkSummary): PillTarget {
  return { type: link.type, id: link.id, title: link.title } as PillTarget;
}

interface PillHoverCards {
  handle: PreviewCard.Handle<PillTarget>;
  prepare?: (target: PillTarget) => void;
  delay: number;
  closeDelay: number;
}

// the card's name, as its header reads it: a synced task's key first
function labelOf(target: PillTarget): string {
  return target.type === 'source' && target.external.key
    ? `${target.external.key} · ${target.title}`
    : target.title;
}

const PillHoverCardsContext = createContext<PillHoverCards | null>(null);

export interface PillHoverCardsProviderProps {
  /**
   * what the card shows for a pill: a component that loads the item and draws
   * `EntityHoverCardContent` (`EntityHoverCardPlaceholder` while it loads)
   */
  renderCard: (target: PillTarget) => ReactNode;
  /** called as the pointer reaches a pill or it takes focus, before the delay: start loading */
  onPrepare?: (target: PillTarget) => void;
  /** ms of pointing before a card opens; about 400 so moving across a row doesn't flash cards */
  delay?: number;
  /** ms before it closes once the pointer leaves the pill and the card */
  closeDelay?: number;
  children: ReactNode;
}

/**
 * Gives the pills of the rows and cards inside it (`TaskRow`, `NoteRow`, `BoardCard`, `NoteCard`)
 * their hover cards: one `EntityHoverCard` popup for them all, filled by `renderCard` for the pill
 * pointed at. Without it the pills have no card, as in the components' own stories.
 */
export function PillHoverCardsProvider({
  renderCard,
  onPrepare,
  delay = 400,
  closeDelay = 200,
  children,
}: PillHoverCardsProviderProps) {
  const [handle] = useState(() => PreviewCard.createHandle<PillTarget>());
  // pass a stable `onPrepare`: a new one draws every pill again
  const value = useMemo(
    () => ({ handle, prepare: onPrepare, delay, closeDelay }),
    [handle, onPrepare, delay, closeDelay],
  );
  return (
    <PillHoverCardsContext.Provider value={value}>
      {children}
      <PreviewCard.Root handle={handle}>
        {({ payload }) =>
          payload && (
            <PreviewCard.Portal>
              <PreviewCard.Positioner
                side="bottom"
                align="start"
                sideOffset={4}
                collisionPadding={8}
                className={styles.positioner}
              >
                <PreviewCard.Popup aria-label={labelOf(payload)} className={styles.popup}>
                  {renderCard(payload)}
                </PreviewCard.Popup>
              </PreviewCard.Positioner>
            </PreviewCard.Portal>
          )
        }
      </PreviewCard.Root>
    </PillHoverCardsContext.Provider>
  );
}

export interface PillHoverCardProps {
  /** what the pill points at */
  target: PillTarget;
  /** the pill: rendered as the card's trigger, with no element around it */
  children: ReactElement;
}

/**
 * A row's pill with its hover card, from the `PillHoverCardsProvider` around it; the pill alone
 * without one. Pointing at it for about 400ms (or focusing it) opens the card 4px below it.
 */
export function PillHoverCard({ target, children }: PillHoverCardProps) {
  const cards = useContext(PillHoverCardsContext);
  if (!cards) return children;
  const prepare = () => cards.prepare?.(target);
  return (
    <PreviewCard.Trigger
      handle={cards.handle}
      payload={target}
      delay={cards.delay}
      closeDelay={cards.closeDelay}
      onPointerEnter={prepare}
      onFocus={prepare}
      render={children}
    />
  );
}

export interface EntityHoverCardPlaceholderProps {
  /** the item's name, as its pill shows it */
  title: string;
  /** a quiet line in place of the loading lines ("Not found") */
  message?: ReactNode;
}

/** The card while its item loads (its name over two loading lines), or when it can't be shown. */
export function EntityHoverCardPlaceholder({ title, message }: EntityHoverCardPlaceholderProps) {
  return (
    <div className={styles.card} aria-busy={message == null || undefined}>
      <div className={styles.head}>
        <span className={styles.title}>{title}</span>
      </div>
      {message != null ? (
        <div className={styles.meta}>
          <span className={styles.metaText}>{message}</span>
        </div>
      ) : (
        <>
          <Skeleton width="70%" height={12} />
          <Skeleton width="45%" height={12} />
        </>
      )}
    </div>
  );
}
