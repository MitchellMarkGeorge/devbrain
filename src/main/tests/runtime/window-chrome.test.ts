import { describe, expect, it, vi } from 'vitest';
import { WINDOW_BACKGROUND, WINDOW_FOREGROUND } from '@common/theme';
import {
  TITLE_BAR_HEIGHT,
  TRAFFIC_LIGHT_POSITION,
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
