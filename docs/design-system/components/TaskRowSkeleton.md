# TaskRowSkeleton

A `TaskRow` while the list loads: 48px of pulsing `Skeleton` blocks on `TaskRow`'s grid of named areas (`check`, `status`, `title`, `side`, 8px apart), so each sits where the task's part will: an empty checkbox slot, a 16px status square in the 24px status slot 32px in, a 12px-tall title bar (`titleWidth`, 240px by default) and a 48px key, then on the right a 104 × 20px pill, a 16px priority in its 20px slot and a 40px date right-aligned in the 60px date column. Stack them with no gap and vary `titleWidth` from row to row.
