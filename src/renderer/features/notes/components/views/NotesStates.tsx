import { useEffect, useState } from 'react';
import { CircleX, FileText, ListFilter, Plus } from 'lucide-react';
import {
  Button,
  Card,
  CardGrid,
  EmptyState,
  Skeleton,
  Stack,
  TaskRowSkeleton,
} from '@renderer/components';
import type { NoteView } from '../../api/search';
import styles from './NotesView.module.css';

// The notes views' states: no notes yet, none matching the filters, a read that failed, and the
// first page loading (Figma `7175:36096`).

/** No notes: "No notes yet" with New Note, or with filters on, "No notes match" with Clear Filters. */
export function NotesEmptyState({
  filtered,
  onClearFilters,
  onNewNote,
}: {
  filtered: boolean;
  onClearFilters: () => void;
  onNewNote: () => void;
}) {
  return filtered ? (
    <EmptyState
      icon={ListFilter}
      title="No notes match these filters"
      description="Try another filter, or clear them to see every note."
      action={
        <Button size="sm" onClick={onClearFilters}>
          Clear Filters
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={FileText}
      title="No notes yet"
      description="Meeting notes, specs and anything else you write show up here."
      action={
        <Button size="sm" icon={Plus} onClick={onNewNote}>
          New Note
        </Button>
      }
    />
  );
}

/** The notes couldn't be read: why, and Retry. */
export function NotesErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={CircleX}
      title="Notes couldn’t be loaded"
      description="Something went wrong reading this workspace’s notes."
      action={
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  );
}

// how long a load runs before its skeleton shows: a local read is usually done well within it,
// and a skeleton drawn for a frame or two only flickers
const SKELETON_DELAY_MS = 150;

function CardSkeleton() {
  return (
    <Card size="compact" className={styles.cardSkeleton} aria-hidden>
      <div className={styles.cardTop}>
        <Skeleton width={16} height={16} />
        <Skeleton width={40} height={12} />
      </div>
      <Skeleton width="55%" height={14} />
      <div className={styles.cardLines}>
        <Skeleton width="100%" height={10} />
        <Skeleton width="70%" height={10} />
      </div>
      <Skeleton className={styles.cardPill} width={96} height={20} />
    </Card>
  );
}

/** The first page is loading: rows or cards of skeleton, once the load has run for a moment. */
export function NotesLoading({ view }: { view: NoteView }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  if (view === 'card') {
    return (
      <CardGrid gap="md" aria-busy data-testid="notes-loading">
        {shown && Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}
      </CardGrid>
    );
  }
  return (
    <Stack gap="0" aria-busy data-testid="notes-loading">
      {shown &&
        Array.from({ length: 8 }, (_, i) => (
          <TaskRowSkeleton key={i} titleWidth={[160, 220, 180, 240][i % 4]} />
        ))}
    </Stack>
  );
}
