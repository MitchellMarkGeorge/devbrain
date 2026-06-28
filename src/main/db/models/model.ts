import { EntityType, Id } from '../../../common/ids';

export interface Model<T extends Id<EntityType>> {
  id: T;
  updatedAt: Date;
  createdAt: Date;
  favoritedAt: Date | null;
}

export interface Archivable {
  archivedAt: Date | null;
}

export interface Completeable {
  completedAt: Date | null;
}
