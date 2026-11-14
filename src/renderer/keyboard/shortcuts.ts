import type { Platform } from '@renderer/components/lib/platform';
import type { Command } from './commands';
import { entryAppliesInMode, type Keymap } from './keymap';
import { describeKeys, keyLabels } from './keys';
import type { Scope } from './scopes';

/** A row of the shortcuts dialog: a label and its bindings, each a list of key caps. */
export interface ShortcutRow {
  label: string;
  /** one entry per binding (`[['J'], ['K']]` for "Down / up"), each one label per stroke */
  bindings: string[][];
}

export interface ShortcutSection {
  title: string;
  rows: ShortcutRow[];
}

/** the section an entry without a `group` falls in */
export const SCOPE_GROUPS: Record<Scope, string> = {
  global: 'Everywhere',
  page: 'This page',
  list: 'Lists',
  board: 'Board',
  calendar: 'Calendar',
  sheet: 'Sheet',
  dialog: 'Dialogs',
  editor: 'Editor',
};

/**
 * The shortcuts dialog's sections, from the keymap's entries in `mode`: each row is an entry's
 * `label` or its command's title, and entries sharing a label share a row. An entry that is
 * `hidden`, or has no label and whose command isn't registered, is left out.
 */
export function shortcutSections(
  keymap: Keymap,
  commands: readonly Command[],
  mode: string,
  platform: Platform,
): ShortcutSection[] {
  const titles = new Map(commands.map((command) => [command.id, command.title]));
  const sections = new Map<string, Map<string, ShortcutRow>>();
  for (const title of keymap.groups ?? []) sections.set(title, new Map());
  for (const entry of keymap.entries) {
    if (entry.hidden || !entryAppliesInMode(entry, mode)) continue;
    const label = entry.label ?? titles.get(entry.command);
    if (label === undefined) continue;
    let bindings: string[];
    try {
      bindings = keyLabels(entry.keys, platform, { upperCase: keymap.upperCaseKeys ?? true });
    } catch {
      continue;
    }
    const title = entry.group ?? SCOPE_GROUPS[entry.scope];
    const rows = sections.get(title) ?? new Map<string, ShortcutRow>();
    sections.set(title, rows);
    const row = rows.get(label) ?? { label, bindings: [] };
    rows.set(label, row);
    row.bindings.push(bindings);
  }
  return [...sections]
    .map(([title, rows]) => ({ title, rows: [...rows.values()] }))
    .filter(({ rows }) => rows.length > 0);
}

/**
 * The keys a command is bound to in `mode`, as the shortcuts dialog draws them (`G H`, `Ctrl+K`):
 * its first visible binding, or undefined when it has none. ⌘K shows them beside its "Go to" rows.
 */
export function commandShortcut(
  keymap: Keymap,
  commandId: string,
  mode: string,
  platform: Platform,
): string | undefined {
  const entry = keymap.entries.find(
    (candidate) =>
      candidate.command === commandId && !candidate.hidden && entryAppliesInMode(candidate, mode),
  );
  if (!entry) return undefined;
  try {
    return describeKeys(entry.keys, platform, { upperCase: keymap.upperCaseKeys ?? true });
  } catch {
    return undefined;
  }
}
