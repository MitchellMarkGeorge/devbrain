# TableOfContents

A document's headings, to jump through: a note's page shows it in the right margin beside the
document column (up to `outline-width`, 184px, narrower in a narrower margin), held 48px under the top of the page as it scrolls.

- "Contents" in 12px medium `muted-foreground`, 8px over the list.
- The list hangs on a 1px `border` rail. Each heading is a row of 12px `muted-foreground` text,
  4px top and bottom, 12px in from the rail; a second level is 24px in, a third and deeper 36px.
  Levels are the document's own, closed up: a note that starts at `##` starts at the first level.
- A long heading is cut short with an ellipsis; pointing at it shows it whole.
- Pointing at a row turns it `foreground`. The heading being read (`activeId`, `aria-current`) is
  `foreground` with a 2px `foreground` mark over the rail. Nothing is marked above the first
  heading.
- A row is a button: choosing one calls `onSelect` with its id, and the page scrolls that heading
  to the top. Focus draws the ring inside the row.
- The landmark is a `nav` named "Contents".

**Base UI:** none.
