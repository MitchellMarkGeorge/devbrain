import { describe, expect, it } from 'vitest';
import { commandShortcut, defaultKeymap, type Keymap } from '@renderer/keyboard';

describe('commandShortcut', () => {
  it("names a command's keys for the platform, as the shortcuts dialog does", () => {
    expect(commandShortcut(defaultKeymap, 'nav.tasks', 'default', 'macos')).toBe('G T');
    expect(commandShortcut(defaultKeymap, 'search.open', 'default', 'macos')).toBe('⌘K');
    expect(commandShortcut(defaultKeymap, 'search.open', 'default', 'windows')).toBe('Ctrl+K');
  });

  it('gives nothing for an unbound command, a hidden binding or another mode', () => {
    const keymap: Keymap = {
      id: 'test',
      title: 'Test',
      entries: [
        { scope: 'global', keys: 'g t', command: 'nav.tasks', hidden: true },
        { scope: 'global', keys: 'g h', command: 'nav.home', mode: 'normal' },
      ],
    };
    expect(commandShortcut(keymap, 'nav.tasks', 'default', 'macos')).toBeUndefined();
    expect(commandShortcut(keymap, 'nav.home', 'insert', 'macos')).toBeUndefined();
    expect(commandShortcut(keymap, 'nav.home', 'normal', 'macos')).toBe('G H');
    expect(commandShortcut(keymap, 'nav.notes', 'default', 'macos')).toBeUndefined();
  });
});
