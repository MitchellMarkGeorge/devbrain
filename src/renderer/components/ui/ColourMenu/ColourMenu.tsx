import { forwardRef, type ComponentPropsWithoutRef, type CSSProperties } from 'react';
import { Menu } from '@base-ui/react/menu';
import { cn, mergeClassName } from '../../lib/cn';
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  type DropdownMenuContentProps,
} from '../DropdownMenu';
import { Tooltip } from '../Tooltip';
import { SWATCHES, type Swatch } from '../types';
import styles from './ColourMenu.module.css';

/** An editor colour: the default, three muted tones, then the six swatches. */
export type EditorColour = 'default' | 'gray' | 'light-gray' | 'dark-gray' | Swatch;

export const EDITOR_COLOURS: readonly EditorColour[] = [
  'default',
  'gray',
  'light-gray',
  'dark-gray',
  ...SWATCHES,
];

const NAMES: Record<EditorColour, string> = {
  default: 'Default',
  gray: 'Gray',
  'light-gray': 'Light gray',
  'dark-gray': 'Dark gray',
  red: 'Red',
  amber: 'Amber',
  green: 'Green',
  blue: 'Blue',
  indigo: 'Indigo',
  pink: 'Pink',
};

const TEXT: Record<Exclude<EditorColour, Swatch>, string> = {
  default: 'var(--foreground)',
  gray: 'var(--muted-foreground)',
  'light-gray': 'var(--subtle-foreground)',
  'dark-gray': 'var(--neutral-600)',
};
const HIGHLIGHT: Record<Exclude<EditorColour, Swatch>, string> = {
  default: 'transparent',
  gray: 'var(--muted)',
  'light-gray': 'var(--accent)',
  'dark-gray': 'var(--neutral-700)',
};

/** The CSS colour of an editor text colour: swatches at full strength. */
export function editorTextColour(colour: EditorColour): string {
  return colour in TEXT ? TEXT[colour as keyof typeof TEXT] : `var(--swatch-${colour})`;
}

/** The CSS colour of an editor highlight: swatches as their dark `-tile` step. */
export function editorHighlightColour(colour: EditorColour): string {
  return colour in HIGHLIGHT
    ? HIGHLIGHT[colour as keyof typeof HIGHLIGHT]
    : `var(--swatch-${colour}-tile)`;
}

export function editorColourName(colour: EditorColour): string {
  return NAMES[colour];
}

export interface ColourSwatchProps extends ComponentPropsWithoutRef<'span'> {
  /** `text`: an "A" in the colour; `highlight`: a tile filled with it */
  kind: 'text' | 'highlight';
  colour: EditorColour;
  /** the colour in use: a 2px `foreground` ring */
  current?: boolean;
}

/** A 20px colour of the `ColourMenu`. */
export const ColourSwatch = forwardRef<HTMLSpanElement, ColourSwatchProps>(function ColourSwatch(
  { kind, colour, current, className, style, ...props },
  ref,
) {
  const vars =
    kind === 'text'
      ? { '--swatch-ink': editorTextColour(colour) }
      : { '--swatch-ground': editorHighlightColour(colour) };
  return (
    <span
      ref={ref}
      data-kind={kind}
      data-current={current ? '' : undefined}
      className={cn(styles.swatch, className)}
      style={{ ...(vars as CSSProperties), ...style }}
      {...props}
    >
      {kind === 'text' && 'A'}
    </span>
  );
});

export interface ColourMenuProps extends Omit<DropdownMenuContentProps, 'children'> {
  /** the selection's text colour */
  textColour?: EditorColour;
  onTextColourChange?: (colour: EditorColour) => void;
  /** the selection's highlight; `default` is none */
  highlight?: EditorColour;
  onHighlightChange?: (colour: EditorColour) => void;
}

function SwatchRow({
  kind,
  value,
  onChange,
}: {
  kind: 'text' | 'highlight';
  value: EditorColour;
  onChange?: (colour: EditorColour) => void;
}) {
  return (
    <Menu.RadioGroup
      value={value}
      onValueChange={(next: EditorColour) => onChange?.(next)}
      className={styles.row}
    >
      {EDITOR_COLOURS.map((colour) => {
        const name = kind === 'highlight' && colour === 'default' ? 'None' : NAMES[colour];
        return (
          <Tooltip key={colour} content={name}>
            <Menu.RadioItem value={colour} aria-label={name} className={styles.item}>
              <ColourSwatch kind={kind} colour={colour} current={colour === value} />
            </Menu.RadioItem>
          </Tooltip>
        );
      })}
    </Menu.RadioGroup>
  );
}

/**
 * The colours for the selection, 4px under the `FormatToolbar`'s colour button: a row of ten
 * text colours and a row of ten highlights. The current ones have a ring; each names itself in a
 * tooltip. Put it inside the `DropdownMenu` whose trigger is the colour button.
 */
export function ColourMenu({
  textColour = 'default',
  onTextColourChange,
  highlight = 'default',
  onHighlightChange,
  width = 'auto',
  className,
  ...props
}: ColourMenuProps) {
  return (
    <DropdownMenuContent
      width={width}
      aria-label="Colour"
      className={mergeClassName(styles.menu, className)}
      {...props}
    >
      <DropdownMenuGroup>
        <DropdownMenuLabel>Text</DropdownMenuLabel>
        <SwatchRow kind="text" value={textColour} onChange={onTextColourChange} />
      </DropdownMenuGroup>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Highlight</DropdownMenuLabel>
        <SwatchRow kind="highlight" value={highlight} onChange={onHighlightChange} />
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );
}
