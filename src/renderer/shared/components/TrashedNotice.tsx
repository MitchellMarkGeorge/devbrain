import { RotateCcw, Trash2 } from 'lucide-react';
import { Button, Icon } from '@renderer/components';
import styles from './TrashedNotice.module.css';

/**
 * The bar over an item's page while the item is in the trash, which shows it read-only (opened
 * from Trash): the trash can and what it means, in the warning tint, and Restore.
 */
export function TrashedNotice({ noun, onRestore }: { noun: string; onRestore: () => void }) {
  return (
    <div role="status" className={styles.notice}>
      <Icon icon={Trash2} size={16} className={styles.icon} />
      <span className={styles.text}>This {noun} is in the trash. Restore it to change it.</span>
      <Button variant="outline" size="sm" icon={RotateCcw} onClick={onRestore}>
        Restore
      </Button>
    </div>
  );
}
