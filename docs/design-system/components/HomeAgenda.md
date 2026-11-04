# HomeAgenda

Home's right column under the mini calendar (Figma "Home": Later today, Tomorrow, Later this week). Not the calendar page's `CalendarAgenda`, which lists one day's items title-first with the time at the right: Home's agenda reads time-first across several days.

- `HomeAgendaSection`: a 22px heading (12px `muted-foreground`, a `subtle-foreground` count at the right: "3 meetings"), then rows 2px apart. `days` widens the first column from 40px (times) to 56px (days: "Wed 24").
- `HomeAgendaRow`: 32px, 8px in, 8px corners: the time (12px `subtle-foreground`, tabular), the glyph (a `ColourBar` for an event, a 12px `StatusIcon` for a task due), the title (14px `foreground`, ends in "…"), and "+1" for more that day. Hover takes `row-selected`. An `empty` row ("Weekend · Nothing planned") is quiet and not clickable.
- `HomeAgendaEmpty`: a 12px quiet line in place of rows ("Nothing scheduled and nothing due.").
- `HomeAgendaDivider`: a 1px `border` line 20px above and below.
- `HomeAgendaNotice`: the card at the column's foot about the agenda's source ("Google Calendar paused"): a 20px `ProviderTile` and title, a 12px description and a full-width `sm` button.

**Base UI:** No Base UI part: plain markup.
