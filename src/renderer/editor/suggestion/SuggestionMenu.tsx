import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import styles from './SuggestionMenu.module.css';

/**
 * The menu under the caret for the slash menu and "@" links, drawn as the design system's Command
 * (docs/design-system/components/Command.md): grouped items with 12px labels, 28px items, the
 * highlighted one in `accent`. The caret stays in the editor, so the keys reach the menu through
 * onKeyDown (see suggestion.ts) and the items are an ARIA listbox the editor points at.
 */

export interface SuggestionItem {
  key: string;
  label: string;
  group?: string;
  icon?: ReactNode;
  hint?: string;
}

export interface SuggestionMenuProps {
  id: string;
  items: SuggestionItem[];
  loading?: boolean;
  emptyLabel: string;
  onSelect: (item: SuggestionItem) => void;
}

export interface SuggestionMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export const SuggestionMenu = forwardRef<SuggestionMenuHandle, SuggestionMenuProps>(
  function SuggestionMenu({ id, items, loading, emptyLabel, onSelect }, ref) {
    const [highlighted, setHighlighted] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    // a new query starts at the first item
    useEffect(() => setHighlighted(0), [items]);

    useEffect(() => {
      listRef.current
        ?.querySelector(`[data-index="${highlighted}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    }, [highlighted]);

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown(event) {
          if (items.length === 0) return false;
          if (event.key === 'ArrowDown') {
            setHighlighted((index) => (index + 1) % items.length);
            return true;
          }
          if (event.key === 'ArrowUp') {
            setHighlighted((index) => (index - 1 + items.length) % items.length);
            return true;
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            const item = items[highlighted];
            if (item) onSelect(item);
            return true;
          }
          return false;
        },
      }),
      [items, highlighted, onSelect],
    );

    if (items.length === 0) {
      return (
        <div className={styles.menu}>
          <div className={styles.empty}>{loading ? 'Searching…' : emptyLabel}</div>
        </div>
      );
    }

    let previousGroup: string | undefined;
    return (
      <div className={styles.menu} ref={listRef} id={id} role="listbox">
        {items.map((item, index) => {
          const heading =
            item.group && item.group !== previousGroup ? (
              <div className={styles.group} role="presentation">
                {item.group}
              </div>
            ) : null;
          previousGroup = item.group;
          return (
            <div key={item.key}>
              {heading}
              <div
                id={`${id}-${index}`}
                className={styles.item}
                role="option"
                aria-selected={index === highlighted}
                data-highlighted={index === highlighted ? '' : undefined}
                data-index={index}
                // keep the caret in the editor
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setHighlighted(index)}
                onClick={() => onSelect(item)}
              >
                {item.icon && <span className={styles.icon}>{item.icon}</span>}
                <span className={styles.label}>{item.label}</span>
                {item.hint && <span className={styles.hint}>{item.hint}</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  },
);
