# Callout

A note's callout, GitHub's alert (`> [!WARNING]` in the note's markdown): the quote's 2px bar in the kind's colour, 12px in to the text, then the kind's 16px icon and its name in 14px medium in that colour, over the body in `foreground`, 4px apart. It sits in `EditorContent` with the other blocks, 12px under the one before.

| Kind      | Icon                     | Colour          |
| --------- | ------------------------ | --------------- |
| Note      | `info`                   | `swatch-blue`   |
| Tip       | `lightbulb`              | `swatch-green`  |
| Important | `message-square-warning` | `swatch-indigo` |
| Warning   | `triangle-alert`         | `swatch-amber`  |
| Caution   | `octagon-alert`          | `swatch-red`    |

- In light the title darkens (`brightness(0.72)`, as project icons do) so amber and green keep 3:1 on the page.
- In the editor the title is a button (`onKindChange`): pointing at it fills it with `accent` and shows a 12px chevron; it opens a menu, "Callout", of the five kinds with their icons, the current one ticked. The slash menu inserts a Note callout.
- The body holds any blocks: paragraphs, lists, code.

**Base UI:** `Menu` (`RadioGroup`, `RadioItem`) inside DevBrain's `DropdownMenuContent`, for the kind menu.
