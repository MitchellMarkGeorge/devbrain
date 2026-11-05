# FormatToolbar

The floating toolbar over a text selection in the note editor, 8px above it (the editor positions it; the component draws it). A `popover` strip with the `edge` outline, 10px corners and `shadow-md`, 4px in, its buttons 2px apart:

- the block type ("Text ⌄", 13px medium) opening the `TurnIntoMenu`;
- a 16px `border-strong` rule, then Bold, Italic, Underline, Strikethrough, Code and Link: 28px buttons with 16px `muted-foreground` icons;
- another rule, then the colour button (an "A" over a 2px bar in the last colour used) opening the `ColourMenu`, and Turn into task.

An editor whose text has no colours or can't make tasks leaves those buttons out (`showColour`, `showTurnIntoTask`); with both gone, so is the rule before them.

A pressed mark has the `accent` fill and a `foreground` icon; so does the button whose menu is open. Tooltips name each button with its shortcut (⌘B, ⌘I, ⌘U, ⌘⇧X, ⌘E, ⌘K).

**Base UI:** `Toolbar` (`Root`, `Button`, `Separator`) with `Toggle` for the marks; `Menu` triggers for the two menus.
