import {
  Fragment,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { cn } from '../../lib/cn';
import { menuStyles } from '../../ui/DropdownMenu';
import { ScrollArea } from '../../ui/ScrollArea';
import styles from './SlashMenu.module.css';

/** What an editor calls while its suggestion menu is open: the keys it should pass on. */
export interface SuggestionMenuHandle {
  /**
   * Handles ↑, ↓, Enter and Tab for the menu while the caret stays in the editor. Returns true
   * when it used the key, so the editor skips it.
   */
  onKeyDown: (event: KeyboardEvent | ReactKeyboardEvent) => boolean;
}

export interface SuggestionGroup<Item> {
  label: string;
  items: Item[];
}

export interface SuggestionMenuProps<Item> extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'onSelect' | 'children'
> {
  groups: SuggestionGroup<Item>[];
  getKey: (item: Item) => string;
  /** an item's content inside its row */
  renderItem: (item: Item) => ReactNode;
  onSelect?: (item: Item) => void;
  /** the editor's handle on the menu's keys */
  handleRef?: Ref<SuggestionMenuHandle>;
  /** shown when no group has items */
  empty?: ReactNode;
  /** the first item highlighted at first; the first item by default */
  defaultHighlighted?: string;
  /**
   * The highlighted item's element id, each time it changes (undefined with no items). The caret
   * stays in the editor, so the editor's element carries it as `aria-activedescendant` (and the
   * list's `id` as `aria-controls`) for a screen reader to announce the item.
   */
  onActiveDescendantChange?: (id: string | undefined) => void;
}

/**
 * A popover list the editor drives while you type ("/hea", "@pkce"): groups under labels, one
 * item highlighted. The caret stays in the editor, which passes ↑, ↓ and Enter on through
 * `handleRef`. Pointing at an item highlights it; clicking picks it.
 */
export function SuggestionMenu<Item>({
  groups,
  getKey,
  renderItem,
  onSelect,
  handleRef,
  empty = 'No results',
  defaultHighlighted,
  onActiveDescendantChange,
  className,
  ...props
}: SuggestionMenuProps<Item>) {
  const id = useId();
  const visible = groups.filter((group) => group.items.length > 0);
  const flat = visible.flatMap((group) => group.items);
  const keys = flat.map(getKey);
  const [highlighted, setHighlighted] = useState(defaultHighlighted ?? keys[0]);
  const current = highlighted != null && keys.includes(highlighted) ? highlighted : keys[0];
  const list = useRef<HTMLDivElement>(null);

  // keeps the highlighted item in view as ↑ and ↓ move it
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>('[data-highlighted]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const activeId = current ? `${id}-${current}` : undefined;
  useEffect(() => {
    onActiveDescendantChange?.(activeId);
  }, [activeId, onActiveDescendantChange]);

  useImperativeHandle(handleRef, () => ({
    onKeyDown(event) {
      if (flat.length === 0) return false;
      const index = Math.max(0, keys.indexOf(current ?? ''));
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setHighlighted(keys[(index + step + keys.length) % keys.length]);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        onSelect?.(flat[index]);
        return true;
      }
      return false;
    },
  }));

  return (
    // the menu's surface; its items scroll in a ScrollArea, whose scrollbar is drawn over the
    // edge, so a long list takes no width for one
    <div className={cn(menuStyles.popup, styles.menu, className)}>
      <ScrollArea
        className={styles.scroll}
        viewportRef={list}
        viewportClassName={styles.viewport}
        viewportProps={{
          role: 'listbox',
          'aria-activedescendant': activeId,
          // the caret stays in the editor: the list never takes focus, even while it overflows
          tabIndex: -1,
          ...props,
        }}
      >
        {visible.length === 0 && <div className={styles.empty}>{empty}</div>}
        {visible.map((group, groupIndex) => (
          <Fragment key={group.label}>
            {groupIndex > 0 && <div role="separator" className={menuStyles.separator} />}
            <div role="group" aria-label={group.label}>
              <div className={menuStyles.label} aria-hidden>
                {group.label}
              </div>
              {group.items.map((item) => {
                const key = getKey(item);
                const on = key === current;
                return (
                  <div
                    key={key}
                    id={`${id}-${key}`}
                    role="option"
                    aria-selected={on}
                    data-highlighted={on ? '' : undefined}
                    className={menuStyles.item}
                    onPointerMove={() => setHighlighted(key)}
                    // keeps the caret in the editor
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onSelect?.(item)}
                  >
                    {renderItem(item)}
                  </div>
                );
              })}
            </div>
          </Fragment>
        ))}
      </ScrollArea>
    </div>
  );
}
