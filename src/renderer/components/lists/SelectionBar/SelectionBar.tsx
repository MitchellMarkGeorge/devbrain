import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Calendar, ChevronsUp, Circle, Ellipsis, Folder, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { DropdownMenu, DropdownMenuContent } from '../../ui/DropdownMenu';
import { DropdownMenuTrigger } from '../../ui/DropdownMenu';
import styles from './SelectionBar.module.css';

export const selectionBarVariants = cva(styles.bar, {
  variants: {
    /** sticks to the bottom of its scrolling list; `false` sits where it is placed */
    floating: { true: styles.floating, false: undefined },
  },
  defaultVariants: { floating: true },
});

export interface SelectionBarProps
  extends Omit<ComponentProps<'div'>, 'children'>, VariantProps<typeof selectionBarVariants> {
  /**
   * whether it shows (default true): it slides up and fades in as this turns true, and fades out
   * as it turns false, showing what it last showed while open until it has gone. Keep it mounted
   * and drive this, rather than mounting it only while rows are selected, so it can animate out.
   */
  open?: boolean;
  /** how many rows are selected */
  count: number;
  /** clears the selection (the × button) */
  onClear?: () => void;
  onStatus?: () => void;
  onPriority?: () => void;
  onDueDate?: () => void;
  onMove?: () => void;
  /** the "more" menu's items (`DropdownMenuItem`s); without them the button calls `onMore` */
  more?: ReactNode;
  onMore?: () => void;
  /** replaces the standard actions (Status, Priority, Due date, Move) */
  actions?: ReactNode;
}

// how long it takes to leave: `duration-normal` and a little more, after which it unmounts
const EXIT_MS = 200;

type Phase = 'starting' | 'open' | 'ending';

/**
 * The bar that floats over the bottom of a list while rows are selected: the count, then ghost
 * actions for Status, Priority, Due date and Move, a "more" menu and clear. It animates in and
 * out with `open`. `TaskList` shows it on its own.
 */
export const SelectionBar = forwardRef<HTMLDivElement, SelectionBarProps>(function SelectionBar(
  { open = true, ...props },
  ref,
) {
  // null: not drawn. It mounts in `starting` (its hidden style) and moves to `open` a frame later,
  // so the change animates; closing draws `ending` until the fade is done.
  const [phase, setPhase] = useState<Phase | null>(open ? 'open' : null);
  // what it showed while open, kept on screen while it fades out (the count is 0 by then)
  const shown = useRef(props);
  useEffect(() => {
    if (open) shown.current = props;
  });
  if (open && (phase === null || phase === 'ending'))
    setPhase(phase === null ? 'starting' : 'open');
  if (!open && (phase === 'starting' || phase === 'open')) setPhase('ending');

  useEffect(() => {
    if (phase === 'starting') {
      // two frames: the first draws the hidden style, the second the change away from it
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setPhase('open'));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    if (phase === 'ending') {
      const timer = setTimeout(() => setPhase(null), EXIT_MS);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  // Leaving, it is inert: out of the accessibility tree, and it gives up focus (the Clear button
  // just clicked has it), which aria-hidden can't do. React 18 has no `inert` prop, so it is set
  // on the element; the page puts focus back where it belongs (its list).
  const element = useRef<HTMLDivElement | null>(null);
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      element.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );
  useLayoutEffect(() => {
    if (element.current) element.current.inert = phase === 'ending';
  }, [phase]);

  if (phase === null) return null;
  return (
    <SelectionBarContent
      ref={setRef}
      {...(open ? props : shown.current)}
      data-starting-style={phase === 'starting' ? '' : undefined}
      data-ending-style={phase === 'ending' ? '' : undefined}
    />
  );
});

const SelectionBarContent = forwardRef<HTMLDivElement, Omit<SelectionBarProps, 'open'>>(
  function SelectionBarContent(
    {
      count,
      onClear,
      onStatus,
      onPriority,
      onDueDate,
      onMove,
      more,
      onMore,
      actions,
      floating,
      className,
      ...props
    },
    ref,
  ) {
    const moreButton = (
      <IconButton
        size="sm"
        icon={Ellipsis}
        label="More actions"
        className={styles.iconAction}
        onClick={more ? undefined : onMore}
      />
    );
    return (
      <div
        ref={ref}
        role="toolbar"
        aria-label="Selected tasks"
        className={cn(selectionBarVariants({ floating }), className)}
        {...props}
      >
        <span className={styles.count} aria-live="polite">
          {count} selected
        </span>
        <span className={styles.separator} aria-hidden />
        {actions ?? (
          <>
            <Button
              variant="ghost"
              size="sm"
              icon={Circle}
              className={styles.action}
              onClick={onStatus}
            >
              Status
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={ChevronsUp}
              className={styles.action}
              onClick={onPriority}
            >
              Priority
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={Calendar}
              className={styles.action}
              onClick={onDueDate}
            >
              Due date
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={Folder}
              className={styles.action}
              onClick={onMove}
            >
              Move
            </Button>
          </>
        )}
        {more ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={moreButton} />
            <DropdownMenuContent side="top" align="end" sideOffset={8}>
              {more}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          moreButton
        )}
        <IconButton
          size="sm"
          icon={X}
          label="Clear selection"
          className={styles.iconAction}
          onClick={onClear}
        />
      </div>
    );
  },
);
