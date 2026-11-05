# DateRange

The dates property, in a task's or project's `PropertyRow`, a vertical `DetailRow` and the `ProjectHeader`. One value until a start date exists: the due date and a muted "+ Start date" pill. Once a start date is set, two pills, start → due, with a 14px `muted-foreground` arrow between them. The pills wrap, 6px apart.

- **Pills** are `EntityPill`s with the calendar glyph, showing the date as given ("Jun 24", "Jul 1", "Today"). "+ Start date" is an `EntityPill` with the plus glyph.
- **`dueTone`**: `today` colours the due pill's glyph `date-today`, `overdue` colours it `date-overdue`; the label stays muted like every pill label.
- **Pickers.** Each pill opens its own picker in a `PopoverContent size="auto"`: `duePicker` (a `DatePicker`) from the due pill, `startPicker` (a `DateRangePicker`, start and due) from the start pill, or from "+ Start date" while there is no start. Without a picker a pill is a plain pill; "+ Start date" then calls `onAddStart`.
- **Labels.** A date given as text names its pill for screen readers: "Start date, Jun 24", "Due date, Jul 1".

**Base UI:** `Popover` for each pill's picker, with the pill as its trigger (`render`).
