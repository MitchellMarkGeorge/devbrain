import type { Command, CommandArgs } from './commands';

/** `commandLine.open`: Vim's `:`. Registered by `ModeLine`, which draws the line. */
export const OPEN_COMMAND_LINE_ID = 'commandLine.open';

/** A word typed after `:` that names a command (`:board`, `:sort priority`, `:tasks`). */
export interface CommandAlias {
  text: string;
  command: string;
  args?: CommandArgs;
}

/**
 * The `:` line's words, where they mean something in DevBrain: a page's name goes to it, a view
 * or a sort is the tasks page's, and a few of Vim's own (`:u`, `:red`, `:h`). `:q` and `:w` are
 * left out on purpose: there is no window or buffer to close, and everything saves as it's typed.
 * An alias whose command isn't registered (a sort off the tasks page) isn't offered.
 */
export const COMMAND_ALIASES: readonly CommandAlias[] = [
  ...['home', 'tasks', 'projects', 'notes', 'calendar', 'integrations', 'settings', 'trash'].map(
    (page) => ({ text: page, command: `nav.${page}` }),
  ),
  { text: 'list', command: 'view.list' },
  { text: 'group', command: 'view.group' },
  { text: 'board', command: 'view.board' },
  { text: 'sort priority', command: 'sort.priority' },
  { text: 'sort due', command: 'sort.due_date' },
  { text: 'sort status', command: 'sort.status' },
  { text: 'sort updated', command: 'sort.updated_at' },
  { text: 'sort created', command: 'sort.created_at' },
  { text: 'new', command: 'task.new' },
  { text: 'note', command: 'note.new' },
  { text: 'project', command: 'project.new' },
  { text: 'search', command: 'search.open' },
  { text: 'u', command: 'app.undo' },
  { text: 'undo', command: 'app.undo' },
  { text: 'red', command: 'app.redo' },
  { text: 'redo', command: 'app.redo' },
  { text: 'h', command: 'help.shortcuts' },
  { text: 'help', command: 'help.shortcuts' },
];

// the keyboard's own plumbing: no use typed out
const NOT_OFFERED = new Set([
  'mode.set',
  'cursor.enter',
  'menu.down',
  'menu.up',
  'hints.show',
  OPEN_COMMAND_LINE_ID,
]);

/** One completion of the `:` line: what it fills the line with, what it does, and the command. */
export interface Completion {
  /** the line's text once picked: an alias (`sort priority`) or a command's id (`list.visual`) */
  text: string;
  /** the command's title: "Sort by priority" */
  label: string;
  command: string;
  args?: CommandArgs;
}

/** how many completions the line shows at most */
export const MAX_COMPLETIONS = 8;

/**
 * The completions for what has been typed after `:`, from the registered commands: the aliases it
 * starts (each command once, by its first alias), then the commands whose id it starts, or a
 * word of whose title it starts. Nothing typed offers the aliases.
 */
export function completeCommandLine(
  typed: string,
  commands: readonly Command[],
  aliases: readonly CommandAlias[] = COMMAND_ALIASES,
): Completion[] {
  const query = typed.trim().toLowerCase().replace(/\s+/g, ' ');
  const byId = new Map(commands.map((command) => [command.id, command]));
  const found: Completion[] = [];
  const named = new Set<string>();
  for (const alias of aliases) {
    const command = byId.get(alias.command);
    if (!command || named.has(command.id) || !alias.text.startsWith(query)) continue;
    named.add(command.id);
    found.push({ text: alias.text, label: command.title, command: command.id, args: alias.args });
  }
  if (query !== '') {
    for (const command of commands) {
      if (NOT_OFFERED.has(command.id) || named.has(command.id)) continue;
      const id = command.id.toLowerCase();
      const title = command.title.toLowerCase();
      // a word of the title it starts ("range" for "Visual range"), or the title from its start
      const inTitle =
        title.startsWith(query) || title.split(/\s+/).some((w) => w.startsWith(query));
      if (!id.startsWith(query) && !inTitle) continue;
      found.push({ text: command.id, label: command.title, command: command.id });
    }
  }
  return found.slice(0, MAX_COMPLETIONS);
}

/**
 * What Enter runs for the typed text when no completion is picked: an alias or a command id typed
 * out in full.
 */
export function resolveCommandLine(
  typed: string,
  commands: readonly Command[],
  aliases: readonly CommandAlias[] = COMMAND_ALIASES,
): Completion | undefined {
  const query = typed.trim().toLowerCase().replace(/\s+/g, ' ');
  const byId = new Map(commands.map((command) => [command.id, command]));
  const alias = aliases.find(
    (candidate) => candidate.text === query && byId.has(candidate.command),
  );
  if (alias) {
    const command = byId.get(alias.command)!;
    return { text: alias.text, label: command.title, command: command.id, args: alias.args };
  }
  const command = commands.find((candidate) => candidate.id.toLowerCase() === query);
  return command && !NOT_OFFERED.has(command.id)
    ? { text: command.id, label: command.title, command: command.id }
    : undefined;
}
