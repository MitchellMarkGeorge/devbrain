import { RotateCcw, Trash2 } from 'lucide-react';
import { Button, SelectionBar } from '@renderer/components';
import type { TrashActions, TrashEntry } from '../hooks/use-trash-actions';
import styles from './TrashPage.module.css';

export interface TrashSelectionBarProps {
  /** the selected rows, loaded */
  items: readonly TrashEntry[];
  actions: TrashActions;
  onClear: () => void;
}

/**
 * The selection bar over Trash's rows, as the other lists' (Figma `7424:38163`): the count, then
 * Restore and Delete permanently for every selected item, and clear. Both are shown, so it has no
 * "more" menu. Deleting asks once for them all (when `confirmBeforeDeleting` is on). Each is one
 * call, all or nothing (`archive.restoreMany`, `archive.deleteMany`): the selection clears once it
 * has gone through, and stays as it was when it fails.
 */
export function TrashSelectionBar({ items, actions, onClear }: TrashSelectionBarProps) {
  const done = (went: boolean) => {
    if (went) onClear();
  };
  return (
    <div className={styles.bar}>
      <SelectionBar
        open={items.length > 0}
        count={items.length}
        floating={false}
        aria-label="Selected items"
        onClear={onClear}
        showMore={false}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              icon={RotateCcw}
              onClick={() => actions.restoreAll(items).then(done)}
            >
              Restore
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              onClick={() => actions.removeAll(items).then(done)}
            >
              Delete permanently
            </Button>
          </>
        }
      />
    </div>
  );
}
