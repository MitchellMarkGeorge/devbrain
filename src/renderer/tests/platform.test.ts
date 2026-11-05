import { describe, expect, it } from 'vitest';
import { formatKeys, platformFromNode } from '../components/lib/platform';

describe('platformFromNode', () => {
  it('maps Node platforms, with every other one keeping a system frame', () => {
    expect(platformFromNode('darwin')).toBe('macos');
    expect(platformFromNode('win32')).toBe('windows');
    expect(platformFromNode('linux')).toBe('linux');
    expect(platformFromNode('freebsd')).toBe('linux');
  });
});

describe('formatKeys', () => {
  it('leaves macOS notation as it is on macOS', () => {
    expect(formatKeys('⌘⇧X', 'macos')).toBe('⌘⇧X');
  });

  it('names the modifiers off macOS, Ctrl first', () => {
    for (const platform of ['windows', 'linux'] as const) {
      expect(formatKeys('⌘K', platform)).toBe('Ctrl+K');
      expect(formatKeys('⌘\\', platform)).toBe('Ctrl+\\');
      expect(formatKeys('⌘⇧X', platform)).toBe('Ctrl+Shift+X');
      expect(formatKeys('⇧⌘X', platform)).toBe('Ctrl+Shift+X');
      expect(formatKeys('⌥⌘N', platform)).toBe('Ctrl+Alt+N');
      expect(formatKeys('⇧2', platform)).toBe('Shift+2');
      expect(formatKeys('⌘,', platform)).toBe('Ctrl+,');
    }
  });

  it('names the keys only macOS draws as glyphs, inside a chord', () => {
    expect(formatKeys('⌘↵', 'windows')).toBe('Ctrl+Enter');
    expect(formatKeys('⌘⌫', 'windows')).toBe('Ctrl+Backspace');
  });

  it('leaves lone keys and sequences alone', () => {
    expect(formatKeys('↵', 'windows')).toBe('↵');
    expect(formatKeys('F', 'linux')).toBe('F');
    expect(formatKeys('G T', 'windows')).toBe('G T');
    expect(formatKeys('Esc', 'windows')).toBe('Esc');
  });

  it('names a lone modifier', () => {
    expect(formatKeys('⌘', 'windows')).toBe('Ctrl');
  });
});
