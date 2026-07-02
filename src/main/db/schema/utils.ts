import { sql } from 'drizzle-orm';
import { integer } from 'drizzle-orm/sqlite-core';

// storing as integer for easy sorting
export const date = () => integer({ mode: 'timestamp_ms' });
export const boolean = () => integer({ mode: 'boolean' });

export const timesamps = {
  updatedAt: date()
    .notNull()
    .default(sql`(unixepoch())`)
    .$onUpdate(() => new Date()),
  createdAt: date()
    .notNull()
    .default(sql`(unixepoch())`),
  favoritedAt: date(),
};

export const archivedAt = {
  archivedAt: date(),
};

export const completedAt = {
  completedAt: date(),
};
