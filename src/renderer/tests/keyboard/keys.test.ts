// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  describeKeys,
  keyLabels,
  parseKeys,
  parseStroke,
  strokeFromEvent,
} from '../../keyboard/keys';

function event(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, ...init });
}

describe('parseStroke', () => {
  it('reads mod as ⌘ on macOS and Ctrl elsewhere', () => {
    expect(parseStroke('mod+k', 'macos')).toBe('meta+k');
    expect(parseStroke('mod+k', 'windows')).toBe('ctrl+k');
    expect(parseStroke('mod+k', 'linux')).toBe('ctrl+k');
    expect(parseStroke('mod+\\', 'windows')).toBe('ctrl+\\');
  });

  it('orders modifiers and lower-cases a chord’s key', () => {
    expect(parseStroke('shift+mod+F', 'macos')).toBe('shift+meta+f');
    expect(parseStroke('Cmd+Alt+N', 'macos')).toBe('alt+meta+n');
  });

  it('keeps a typed character’s case, with Shift as part of it', () => {
    expect(parseStroke('g', 'macos')).toBe('g');
    expect(parseStroke('G', 'macos')).toBe('G');
    expect(parseStroke('shift+g', 'macos')).toBe('G');
    expect(parseStroke('?', 'macos')).toBe('?');
  });

  it('names other keys, with aliases', () => {
    expect(parseStroke('Esc', 'macos')).toBe('escape');
    expect(parseStroke('shift+Enter', 'macos')).toBe('shift+enter');
    expect(parseStroke('down', 'macos')).toBe('arrowdown');
    expect(parseStroke('mod++', 'macos')).toBe('meta++');
  });

  it('rejects unknown modifiers', () => {
    expect(() => parseStroke('hyper+k', 'macos')).toThrow();
  });
});

describe('parseKeys', () => {
  it('splits sequences on spaces', () => {
    expect(parseKeys('g t', 'macos')).toEqual(['g', 't']);
    expect(parseKeys('  d   d ', 'macos')).toEqual(['d', 'd']);
  });
});

describe('strokeFromEvent', () => {
  it('reads typed characters as they are', () => {
    expect(strokeFromEvent(event('g'))).toBe('g');
    expect(strokeFromEvent(event('G', { shiftKey: true }))).toBe('G');
    expect(strokeFromEvent(event('?', { shiftKey: true }))).toBe('?');
  });

  it('reads a chord’s letter from the physical key', () => {
    expect(strokeFromEvent(event('k', { metaKey: true, code: 'KeyK' }))).toBe('meta+k');
    expect(strokeFromEvent(event('F', { metaKey: true, shiftKey: true, code: 'KeyF' }))).toBe(
      'shift+meta+f',
    );
    // macOS's Option changes the character
    expect(strokeFromEvent(event('˜', { altKey: true, code: 'KeyN' }))).toBe('alt+n');
    expect(strokeFromEvent(event('\\', { ctrlKey: true, code: 'Backslash' }))).toBe('ctrl+\\');
  });

  it('names other keys, and Shift with them', () => {
    expect(strokeFromEvent(event('Escape'))).toBe('escape');
    expect(strokeFromEvent(event('Enter', { shiftKey: true }))).toBe('shift+enter');
    expect(strokeFromEvent(event(' '))).toBe('space');
  });

  it('skips lone modifiers', () => {
    expect(strokeFromEvent(event('Shift', { shiftKey: true }))).toBeNull();
    expect(strokeFromEvent(event('Meta', { metaKey: true }))).toBeNull();
  });
});

describe('keyLabels and describeKeys', () => {
  it('draw keys in macOS notation, one label per stroke', () => {
    expect(keyLabels('mod+k', 'macos')).toEqual(['⌘K']);
    expect(keyLabels('g t', 'macos')).toEqual(['G', 'T']);
    expect(keyLabels('mod+shift+f', 'macos')).toEqual(['⇧⌘F']);
    expect(keyLabels('mod+backspace', 'macos')).toEqual(['⌘⌫']);
    expect(keyLabels('g g', 'macos', { upperCase: false })).toEqual(['g', 'g']);
  });

  it('name mod for the platform, through formatKeys', () => {
    expect(describeKeys('mod+k', 'macos')).toBe('⌘K');
    expect(describeKeys('mod+k', 'windows')).toBe('Ctrl+K');
    expect(describeKeys('mod+\\', 'linux')).toBe('Ctrl+\\');
    expect(describeKeys('mod+shift+f', 'windows')).toBe('Ctrl+Shift+F');
    expect(describeKeys('g t', 'windows')).toBe('G T');
  });
});
