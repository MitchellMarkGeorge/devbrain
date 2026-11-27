/**
 * EXPERIMENT: the task row's stacking worked out in code, for the measured layout (`data-fit`, see
 * `measured-fit.ts`), in place of the flex line's shrink factors. Plain arithmetic on widths the
 * row measured: nothing here touches the DOM.
 */

/** the title, or one pill's slot: as wide as it wants to be, and the least it can be given */
export interface FitPart {
  natural: number;
  min: number;
  /**
   * its share of a shortfall beside the other parts of its stage: its natural width less its
   * padding, which is how a flex line weighs its items. Left out, its natural width.
   */
  weight?: number;
}

export type FitGroup = 'title' | 'side';

export interface FitInput {
  /** the content's width, less the gaps between its parts */
  room: number;
  name: FitPart;
  /** the slots of the pills after the title, in order; the last is the one on top */
  title: FitPart[];
  /** the slots of the pills on the right */
  side: FitPart[];
  /** the group pointed at, which takes its room back from the title */
  spread?: FitGroup;
}

export interface Fit {
  name: number;
  title: number[];
  side: number[];
}

/**
 * The order the parts give way in, each stage down to its minimums before the next loses anything.
 *
 * At rest: the pills stack (every slot but the last of its group), then the last pill of each
 * group shortens, then the title. With a group spread: the other group, then the title, and the
 * spread group last.
 */
function stages({ name, title, side, spread }: FitInput): FitPart[][] {
  if (!spread) {
    return [
      [...title.slice(0, -1), ...side.slice(0, -1)],
      [...title.slice(-1), ...side.slice(-1)],
      [name],
    ];
  }
  const [near, far] = spread === 'title' ? [title, side] : [side, title];
  return [far, [name], near];
}

/**
 * Takes `deficit` out of one stage's parts, each in proportion to its weight (as a flex line shares a
 * shortfall among items of one shrink factor): a part that would go under its minimum is
 * held there, and the rest share what it could not give. Returns what the stage could not take.
 */
function giveWay(stage: FitPart[], deficit: number, widths: Map<FitPart, number>): number {
  let open = stage.filter((part) => part.natural > part.min);
  while (deficit > 0 && open.length > 0) {
    const weightOf = (part: FitPart) => part.weight ?? part.natural;
    const weight = open.reduce((sum, part) => sum + weightOf(part), 0);
    const share = (part: FitPart) => (deficit * weightOf(part)) / weight;
    const held = open.filter((part) => part.natural - share(part) <= part.min);
    if (held.length === 0) {
      for (const part of open) widths.set(part, part.natural - share(part));
      return 0;
    }
    for (const part of held) {
      widths.set(part, part.min);
      deficit -= part.natural - part.min;
    }
    open = open.filter((part) => !held.includes(part));
  }
  return Math.max(deficit, 0);
}

/** The width of the title and of every pill's slot, for the room there is. */
export function fitRow(input: FitInput): Fit {
  const { name, title, side } = input;
  const parts = [name, ...title, ...side];
  const widths = new Map(parts.map((part) => [part, part.natural]));
  let deficit = parts.reduce((sum, part) => sum + part.natural, 0) - input.room;
  for (const stage of stages(input)) {
    if (deficit <= 0) break;
    deficit = giveWay(stage, deficit, widths);
  }
  const width = (part: FitPart) => widths.get(part) ?? part.natural;
  return { name: width(name), title: title.map(width), side: side.map(width) };
}
