import { formatKeys, type Platform } from '@renderer/components/lib/platform';

/**
 * Key notation.
 *
 * A keymap writes keys as text: strokes separated by spaces (`g t`), each a key with modifiers
 * joined by `+` (`mod+k`, `shift+enter`, `ctrl+d`). `mod` is ⌘ on macOS and Ctrl elsewhere.
 *
 * Both the keymap's text and a `keydown` event become a canonical stroke, so matching is string
 * equality:
 *
 * - modifiers in the order `ctrl+alt+shift+meta+`, then the key;
 * - a printable character typed without Ctrl, Alt or ⌘ is the character itself, case and all, and
 *   Shift is part of it: `?`, `G`, `$` (so Vim's `g` and `G` differ);
 * - with Ctrl, Alt or ⌘ held, a letter or digit is read from the physical key (`event.code`), in
 *   lower case, and Shift is a modifier: `meta+shift+f`. macOS's Option changes `event.key`, and
 *   ⌘⇧F may report `F` or `f`;
 * - other keys are their `event.key` in lower case: `enter`, `escape`, `arrowdown`, `backspace`,
 *   and `space` for the space bar.
 */
export type Stroke = string;

const MODIFIER_ORDER = ['ctrl', 'alt', 'shift', 'meta'] as const;
type Modifier = (typeof MODIFIER_ORDER)[number];

const MODIFIER_ALIASES: Record<string, Modifier | 'mod'> = {
  mod: 'mod',
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
  shift: 'shift',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
};

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  return: 'enter',
  del: 'delete',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  ' ': 'space',
};

// keys that are only ever modifiers or dead keys: pressing them alone is not a stroke
const NOT_STROKES = new Set([
  'Shift',
  'Control',
  'Alt',
  'AltGraph',
  'Meta',
  'OS',
  'CapsLock',
  'Fn',
  'Dead',
  'Unidentified',
  'Process',
]);

// a stroke's parts, where the key itself may be `+`: `mod++`, or a lone `+`
function splitStroke(text: string): string[] {
  if (text === '+') return ['+'];
  if (text.endsWith('++')) return [...text.slice(0, -2).split('+'), '+'];
  return text.split('+');
}

function joinStroke(modifiers: ReadonlySet<Modifier>, key: string): Stroke {
  return [...MODIFIER_ORDER.filter((m) => modifiers.has(m)), key].join('+');
}

/** One stroke of a keymap's text (`mod+k`, `?`, `shift+enter`) as a canonical stroke. */
export function parseStroke(text: string, platform: Platform): Stroke {
  const parts = splitStroke(text);
  const rawKey = parts.pop();
  if (rawKey === undefined || rawKey === '') throw new Error(`No key in "${text}"`);
  const modifiers = new Set<Modifier>();
  for (const part of parts) {
    const modifier = MODIFIER_ALIASES[part.toLowerCase()];
    if (!modifier) throw new Error(`Unknown modifier "${part}" in "${text}"`);
    modifiers.add(modifier === 'mod' ? (platform === 'macos' ? 'meta' : 'ctrl') : modifier);
  }
  const command = modifiers.has('ctrl') || modifiers.has('alt') || modifiers.has('meta');
  let key: string;
  if (rawKey.length === 1) {
    key = command ? rawKey.toLowerCase() : rawKey;
    if (!command && modifiers.has('shift')) {
      // Shift is part of a typed character: shift+a is `A`
      modifiers.delete('shift');
      key = rawKey.toUpperCase();
    }
  } else {
    const lower = rawKey.toLowerCase();
    key = KEY_ALIASES[lower] ?? lower;
  }
  return joinStroke(modifiers, key);
}

/** A keymap's keys (`g t`, `mod+k`) as the strokes they are pressed as. */
export function parseKeys(keys: string, platform: Platform): Stroke[] {
  const strokes = keys.trim().split(/\s+/);
  if (strokes.length === 0 || strokes[0] === '') throw new Error('Empty keys');
  return strokes.map((stroke) => parseStroke(stroke, platform));
}

/** The stroke a `keydown` is, or `null` for a lone modifier or dead key. */
export function strokeFromEvent(event: KeyboardEvent): Stroke | null {
  const { key } = event;
  if (!key || NOT_STROKES.has(key)) return null;
  const modifiers = new Set<Modifier>();
  if (event.ctrlKey) modifiers.add('ctrl');
  if (event.altKey) modifiers.add('alt');
  if (event.metaKey) modifiers.add('meta');
  if (key === ' ') {
    if (event.shiftKey) modifiers.add('shift');
    return joinStroke(modifiers, 'space');
  }
  if (modifiers.size > 0) {
    if (event.shiftKey) modifiers.add('shift');
    const physical = /^Key([A-Z])$/.exec(event.code) ?? /^Digit([0-9])$/.exec(event.code);
    if (physical) return joinStroke(modifiers, physical[1].toLowerCase());
    return joinStroke(modifiers, key.toLowerCase());
  }
  if (key.length === 1) return key;
  if (event.shiftKey) modifiers.add('shift');
  return joinStroke(modifiers, key.toLowerCase());
}

// ---------- display ----------

// macOS's order for modifier glyphs
const GLYPHS: [Modifier, string][] = [
  ['ctrl', '⌃'],
  ['alt', '⌥'],
  ['shift', '⇧'],
  ['meta', '⌘'],
];
const KEY_GLYPHS: Record<string, string> = {
  enter: '↵',
  backspace: '⌫',
  delete: '⌦',
  escape: 'Esc',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  space: 'Space',
  tab: 'Tab',
};

export interface DisplayOptions {
  /** draw lone letters in capitals, as key caps are (`G T`); off for Vim, where `g` ≠ `G` */
  upperCase?: boolean;
}

/**
 * One canonical stroke as macOS writes it (`⌘K`, `⇧↵`, `G`), for `Kbd`, which names it for the
 * platform with `formatKeys`.
 */
export function strokeLabel(stroke: Stroke, { upperCase = true }: DisplayOptions = {}): string {
  const parts = splitStroke(stroke);
  const key = parts.pop() ?? '';
  const modifiers = new Set(parts);
  const glyphs = GLYPHS.filter(([m]) => modifiers.has(m))
    .map(([, g]) => g)
    .join('');
  const chord = glyphs !== '';
  let label = KEY_GLYPHS[key] ?? key;
  if (key.length > 1 && !KEY_GLYPHS[key]) label = key[0].toUpperCase() + key.slice(1);
  else if (key.length === 1 && (chord || upperCase)) label = key.toUpperCase();
  return glyphs + label;
}

/**
 * A keymap's keys as the labels of their strokes in macOS notation, one per key cap: `mod+k` is
 * `['⌘K']` on macOS and `['⌃K']` elsewhere; `g t` is `['G', 'T']`.
 */
export function keyLabels(keys: string, platform: Platform, options?: DisplayOptions): string[] {
  return parseKeys(keys, platform).map((stroke) => strokeLabel(stroke, options));
}

/** `keyLabels` named for the platform, as text: `Ctrl+K`, `G T`. */
export function describeKeys(keys: string, platform: Platform, options?: DisplayOptions): string {
  return keyLabels(keys, platform, options)
    .map((label) => formatKeys(label, platform))
    .join(' ');
}
