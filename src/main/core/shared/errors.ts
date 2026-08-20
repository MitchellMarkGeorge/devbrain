import { EntityType, Id } from '@common/ids';

export class NotFoundError<T extends EntityType> extends Error {
  constructor(id: Id<T>) {
    super(`No entity found with id: ${id}`);
    this.name = 'NotFoundError';
  }
}

export class AlreadyArchivedError<T extends EntityType> extends Error {
  constructor(id: Id<T>) {
    super(`Entity is already archived: ${id}`);
    this.name = 'AlreadyArchivedError';
  }
}

export class NotArchivedError<T extends EntityType> extends Error {
  constructor(id: Id<T>) {
    super(`Entity is not archived: ${id}`);
    this.name = 'NotArchivedError';
  }
}
