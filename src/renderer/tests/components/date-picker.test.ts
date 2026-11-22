import { describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { DatePicker, parseNaturalDate } from '@renderer/components';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The DatePicker's field, read with chrono. Today is Tuesday 17 Nov 2026.

const TODAY = new Date(2026, 10, 17, 15, 30);
const day = (month: number, date: number, year = 2026) => new Date(year, month, date);

describe('parseNaturalDate', () => {
  it.each([
    ['today', day(10, 17)],
    ['Tomorrow', day(10, 18)],
    ['next week', day(10, 24)],
    ['fri', day(10, 20)],
    ['friday', day(10, 20)],
    ['next Fri', day(10, 27)],
    ['next friday', day(10, 27)],
    ['tuesday', day(10, 17)],
    ['in 3 days', day(10, 20)],
    ['next month', day(11, 17)],
    ['Jun 30', day(5, 30, 2027)],
    ['30 June', day(5, 30, 2027)],
    ['dec 25 at 3pm', day(11, 25)],
    ['2027-01-05', day(0, 5, 2027)],
  ])('reads "%s"', (text, date) => {
    expect(parseNaturalDate(text, TODAY)).toEqual(date);
  });

  it('reads nothing from text without a date', () => {
    expect(parseNaturalDate('', TODAY)).toBeUndefined();
    expect(parseNaturalDate('   ', TODAY)).toBeUndefined();
    expect(parseNaturalDate('whenever', TODAY)).toBeUndefined();
  });
});

describe('DatePicker', () => {
  it('draws every quick pick when two fall on one day', () => {
    // a Sunday: Tomorrow and Next week are both Monday 23 Nov
    const sunday = new Date(2026, 10, 22, 9);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(createElement(DatePicker, { today: sunday })));
    const labels = [...container.querySelectorAll('button')].map((button) => button.textContent);
    act(() => root.unmount());
    expect(labels).toEqual(expect.arrayContaining(['Today', 'Tomorrow', 'Next week']));
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
