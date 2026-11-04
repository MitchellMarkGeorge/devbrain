import { forwardRef, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { Toolbar } from '@base-ui/react/toolbar';
import { Toggle } from '@base-ui/react/toggle';
import {
  Bold,
  ChevronDown,
  CircleCheck,
  Code,
  Italic,
  Link,
  Strikethrough,
  Underline,
} from 'lucide-react';
import { cn, mergeClassName } from '../../lib/cn';
import { DropdownMenu, DropdownMenuTrigger } from '../DropdownMenu';
import { Icon, renderIcon, type IconSource } from '../Icon';
import { Tooltip } from '../Tooltip';
import { resolveColor, type Swatch } from '../types';
import styles from './FormatToolbar.module.css';

/** The inline marks the toolbar toggles, in its order. */
export type FormatMark = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code';

export const FORMAT_MARKS: { mark: FormatMark; label: string; icon: IconSource; keys: string }[] = [
  { mark: 'bold', label: 'Bold', icon: Bold, keys: '⌘B' },
  { mark: 'italic', label: 'Italic', icon: Italic, keys: '⌘I' },
  { mark: 'underline', label: 'Underline', icon: Underline, keys: '⌘U' },
  { mark: 'strikethrough', label: 'Strikethrough', icon: Strikethrough, keys: '⌘⇧X' },
  { mark: 'code', label: 'Code', icon: Code, keys: '⌘E' },
];

/** The bar itself: a `popover` strip, 4px in, its buttons 2px apart. */
export const FormatToolbarRoot = forwardRef<HTMLDivElement, Toolbar.Root.Props>(
  function FormatToolbarRoot({ className, ...props }, ref) {
    return (
      <Toolbar.Root
        ref={ref}
        aria-label="Format"
        className={mergeClassName(styles.toolbar, className)}
        {...props}
      />
    );
  },
);

/** The 1px `border-strong` rule between the toolbar's groups. */
export function FormatToolbarSeparator({ className, ...props }: Toolbar.Separator.Props) {
  return <Toolbar.Separator className={mergeClassName(styles.separator, className)} {...props} />;
}

export interface FormatToolbarButtonProps extends Omit<Toolbar.Button.Props, 'children'> {
  icon: IconSource;
  /** what it does: the accessible name and the tooltip */
  label: string;
  /** its shortcut, shown in the tooltip ("⌘B") */
  keys?: string;
}

/**
 * A 28px icon button of the toolbar. A toggle (rendered through `Toggle`) shows `data-pressed`
 * with an `accent` fill and a `foreground` icon; so does a button whose menu is open.
 */
export const FormatToolbarButton = forwardRef<HTMLButtonElement, FormatToolbarButtonProps>(
  function FormatToolbarButton({ icon, label, keys, className, ...props }, ref) {
    return (
      <Tooltip content={keys ? `${label} ${keys}` : label} side="top">
        <Toolbar.Button
          ref={ref}
          aria-label={label}
          className={mergeClassName(styles.button, className)}
          {...props}
        >
          {renderIcon(icon, 16)}
        </Toolbar.Button>
      </Tooltip>
    );
  },
);

export interface FormatToolbarProps extends Omit<Toolbar.Root.Props, 'children'> {
  /** the selection's block type, on the first button: "Text", "Heading 1" */
  blockType?: ReactNode;
  /** `TurnIntoMenu`: opens from the block type button */
  turnIntoMenu?: ReactElement;
  /** the marks set on the whole selection; their toggles show pressed */
  marks?: Partial<Record<FormatMark, boolean>>;
  onMarkChange?: (mark: FormatMark, pressed: boolean) => void;
  /** opens the `LinkToolbar` for the selection */
  onLink?: () => void;
  /** the selection is (inside) a link: the link button shows pressed */
  linked?: boolean;
  /** the last text colour used, under the "A": a swatch, a CSS colour, or the default */
  colour?: Swatch | string;
  /** `ColourMenu`: opens from the colour button */
  colourMenu?: ReactElement;
  /** turns the selected text into a task */
  onTurnIntoTask?: () => void;
  /** the colour button; true by default, false for an editor without text colours */
  showColour?: boolean;
  /** Turn into task; true by default, false where text can't become a task */
  showTurnIntoTask?: boolean;
}

/**
 * The floating toolbar over a text selection, 8px above it: the block type (opening the
 * `TurnIntoMenu`), then Bold, Italic, Underline, Strikethrough, Code and Link, then the colour
 * (opening the `ColourMenu`) and Turn into task, each of these two left out with `showColour` or
 * `showTurnIntoTask` false. The editor positions it; this draws it.
 */
export const FormatToolbar = forwardRef<HTMLDivElement, FormatToolbarProps>(function FormatToolbar(
  {
    blockType = 'Text',
    turnIntoMenu,
    marks = {},
    onMarkChange,
    onLink,
    linked,
    colour,
    colourMenu,
    onTurnIntoTask,
    showColour = true,
    showTurnIntoTask = true,
    ...props
  },
  ref,
) {
  const blockButton = (
    <Toolbar.Button className={cn(styles.button, styles.block)} aria-label="Turn into">
      <span>{blockType}</span>
      <Icon icon={ChevronDown} size={16} className={styles.chevron} />
    </Toolbar.Button>
  );
  const colourButton = (
    <Toolbar.Button
      className={styles.button}
      aria-label="Colour"
      style={{ '--format-colour': resolveColor(colour) } as CSSProperties}
    >
      <span className={styles.letter} aria-hidden>
        A
      </span>
      <span className={styles.colourBar} data-default={colour ? undefined : ''} aria-hidden />
    </Toolbar.Button>
  );
  return (
    <FormatToolbarRoot ref={ref} {...props}>
      {turnIntoMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={blockButton} />
          {turnIntoMenu}
        </DropdownMenu>
      ) : (
        blockButton
      )}
      <FormatToolbarSeparator />
      {FORMAT_MARKS.map(({ mark, label, icon, keys }) => (
        <FormatToolbarButton
          key={mark}
          icon={icon}
          label={label}
          keys={keys}
          render={
            <Toggle
              pressed={marks[mark] ?? false}
              onPressedChange={(pressed) => onMarkChange?.(mark, pressed)}
            />
          }
        />
      ))}
      <FormatToolbarButton
        icon={Link}
        label="Link"
        keys="⌘K"
        data-pressed={linked ? '' : undefined}
        onClick={onLink}
      />
      {(showColour || showTurnIntoTask) && <FormatToolbarSeparator />}
      {showColour &&
        (colourMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={colourButton} />
            {colourMenu}
          </DropdownMenu>
        ) : (
          colourButton
        ))}
      {showTurnIntoTask && (
        <FormatToolbarButton icon={CircleCheck} label="Turn into task" onClick={onTurnIntoTask} />
      )}
    </FormatToolbarRoot>
  );
});
