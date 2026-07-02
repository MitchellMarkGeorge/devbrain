import type { NoteRepository } from './repository';

export class NoteService {
  constructor(private repo: NoteRepository) {}
}
