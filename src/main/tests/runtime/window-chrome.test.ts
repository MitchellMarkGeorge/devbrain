import { describe, expect, it, vi } from 'vitest';
import { WINDOW_BACKGROUND, WINDOW_FOREGROUND } from '@common/theme';
import {
  TITLE_BAR_HEIGHT,
  TRAFFIC_LIGHT_POSITION,
  keepTrafficLights,
  repaintChrome,
  titleBarOverlay,
  windowChrome,
} from '../../runtime/window-chrome';

const DARK = { shouldUseDarkColors: true };
const LIGHT = { shouldUseDarkColors: false };

describe('windowChrome', () => {
  it('hides the title bar on macOS and places the traffic lights in the page slot', () => {
    expect(windowChrome('darwin', DARK)).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: TRAFFIC_LIGHT_POSITION,
    });
  });

  it('hides the title bar on Windows and has Windows draw its controls, in the theme', () => {
    expect(windowChrome('win32', DARK)).toEqual({
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: WINDOW_BACKGROUND.dark,
        symbolColor: WINDOW_FOREGROUND.dark,
        height: TITLE_BAR_HEIGHT,
      },
    });
  });

  it('keeps the system frame on Linux', () => {
    expect(windowChrome('linux', LIGHT)).toEqual({});
  });
});

describe('keepTrafficLights', () => {
  function fakeWindow() {
    const listeners = new Map<string, () => void>();
    return {
      listeners,
      on: vi.fn((event: string, listener: () => void) => void listeners.set(event, listener)),
      setWindowButtonPosition: vi.fn(),
    };
  }

  it('puts the traffic lights back when the window is shown, restored, focused or leaves full screen', () => {
    const window = fakeWindow();
    keepTrafficLights(window as never, 'darwin');
    expect([...window.listeners.keys()]).toEqual(['show', 'restore', 'focus', 'leave-full-screen']);
    for (const listener of window.listeners.values()) listener();
    expect(window.setWindowButtonPosition).toHaveBeenCalledTimes(4);
    expect(window.setWindowButtonPosition).toHaveBeenCalledWith(TRAFFIC_LIGHT_POSITION);
  });

  it('does nothing off macOS', () => {
    const window = fakeWindow();
    keepTrafficLights(window as never, 'win32');
    expect(window.on).not.toHaveBeenCalled();
  });
});

describe('titleBarOverlay', () => {
  it("is the theme's background and foreground, as tall as the page's title bar", () => {
    expect(titleBarOverlay(LIGHT)).toEqual({
      color: WINDOW_BACKGROUND.light,
      symbolColor: WINDOW_FOREGROUND.light,
      height: 48,
    });
  });
});

describe('repaintChrome', () => {
  const fakeWindow = () => ({ setBackgroundColor: vi.fn(), setTitleBarOverlay: vi.fn() });

  it("repaints the background, and Windows' controls, in the new theme", () => {
    const win = fakeWindow();
    repaintChrome(win, 'win32', LIGHT);
    expect(win.setBackgroundColor).toHaveBeenCalledWith(WINDOW_BACKGROUND.light);
    expect(win.setTitleBarOverlay).toHaveBeenCalledWith(titleBarOverlay(LIGHT));
  });

  it('leaves the controls to the system elsewhere', () => {
    for (const platform of ['darwin', 'linux'] as const) {
      const win = fakeWindow();
      repaintChrome(win, platform, DARK);
      expect(win.setBackgroundColor).toHaveBeenCalledWith(WINDOW_BACKGROUND.dark);
      expect(win.setTitleBarOverlay).not.toHaveBeenCalled();
    }
  });
});
