import type { EventRepository } from './repository';

export class EventService {
  constructor(private repo: EventRepository) {}
}
