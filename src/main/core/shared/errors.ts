import { EntityType, Id } from '@common/ids';

export class NotFoundError<T extends EntityType> extends Error {
  constructor(id: Id<T>) {
    super(`No entity found with id: ${id}`);
    this.name = 'NotFoundError';
  }
}
