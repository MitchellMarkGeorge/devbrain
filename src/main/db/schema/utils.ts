import { integer } from 'drizzle-orm/sqlite-core';

export const date = () => integer({ mode: 'timestamp_ms' });
export const boolean = () => integer({ mode: 'boolean' });

export const timesamps = {
  updatedAt: date().notNull(), // think about onUptate and default
  createdAt: date().notNull(), // think about defualt
};

export const archivedAt = {
  archivedAt: date(),
};

export const completedAt = {
  completedAt: date(),
};
