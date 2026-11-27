import { describe, expect, it } from 'vitest';
import { fitRow, type FitInput } from '@renderer/components/lists/TaskRow/fit';

// a 300px title, a key (kept whole) after two pills, and two pills on the side
function row(room: number, spread?: FitInput['spread']): FitInput {
  return {
    room,
    spread,
    name: { natural: 300, min: 48 },
    title: [
      { natural: 100, min: 28 },
      { natural: 60, min: 60 },
    ],
    side: [
      { natural: 120, min: 28 },
      { natural: 80, min: 34 },
    ],
  };
}
const total = (fit: ReturnType<typeof fitRow>) =>
  fit.name + [...fit.title, ...fit.side].reduce((sum, width) => sum + width, 0);

describe('fitRow', () => {
  it('gives every part its natural width when there is room', () => {
    expect(fitRow(row(700))).toEqual({ name: 300, title: [100, 60], side: [120, 80] });
  });

  it('stacks the pills first, in proportion, leaving the last of each group and the title whole', () => {
    // 110 short, shared by the 100px and 120px slots
    expect(fitRow(row(550))).toEqual({ name: 300, title: [50, 60], side: [60, 80] });
  });

  it('holds a pill at its edge and takes the rest from the others in its stage', () => {
    const fit = fitRow({
      room: 100,
      name: { natural: 20, min: 20 },
      title: [
        { natural: 40, min: 28 },
        { natural: 200, min: 28 },
        { natural: 10, min: 10 },
      ],
      side: [],
    });
    expect(fit.title).toEqual([28, 42, 10]);
  });

  it('then shortens the last pill of a group, never a kept one, and only then the title', () => {
    // the stacks are at their edges (164 given); 26 more comes off the last side pill
    expect(fitRow(row(470))).toEqual({ name: 300, title: [28, 60], side: [28, 54] });
    // everything at its minimum but the title, which gives the rest
    expect(fitRow(row(400))).toEqual({ name: 250, title: [28, 60], side: [28, 34] });
  });

  it('never gives the title less than its minimum', () => {
    expect(fitRow(row(100))).toEqual({ name: 48, title: [28, 60], side: [28, 34] });
  });

  it('spreads a group at the cost of the other group, then of the title', () => {
    const fit = fitRow(row(470, 'side'));
    expect(fit.side).toEqual([120, 80]);
    expect(fit.title).toEqual([28, 60]);
    expect(fit.name).toBe(182);
    expect(total(fit)).toBe(470);
  });

  it('spreads as far as there is room when the title is at its minimum', () => {
    const fit = fitRow(row(300, 'side'));
    expect(fit.name).toBe(48);
    expect(fit.title).toEqual([28, 60]);
    expect(total(fit)).toBeCloseTo(300);
    expect(fit.side[0]).toBeGreaterThan(28);
  });
});
