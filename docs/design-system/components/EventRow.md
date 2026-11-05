# EventRow

A calendar event inside a list (Home's Meetings, Inbox), on the same strokeless `row-height` (48px) row as `TaskRow`: the calendar's colour bar where a task's status icon sits, the title, then the time and repeat rule (`time`, `repeats`) in 12px `subtle-foreground` when given; on the right an xs "Join" button when it has a meeting link (`meeting`), and when it starts (`relative`), 12px and right-aligned, coloured by `tone`: `date-today` or `date-overdue`.

- **On Home** the row leaves out the time after the title and shows only when at the right: "In 12 min" (`tone="today"`), "Now", "10:30", "Tue 9:30". Join shows from 5 minutes before the start until the end (set `meeting` only then). The next or current meeting is `current`, filled with `card`; finished meetings drop off; tomorrow's first meeting is `muted` (the title in `muted-foreground`, the bar at 50%).
- Hover takes `row-selected`; Enter or a click opens the event (`onOpen`).
