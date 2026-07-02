import type { NoteRepository } from '../notes/repository';
import type { ProjectRepository } from '../projects/repository';
import type { TaskRepository } from '../tasks/repository';

interface ArchiveServiceDeps {
  noteRepo: NoteRepository;
  taskRepo: TaskRepository;
  projectRepo: ProjectRepository;
}

export class ArchiveService {
  constructor(private deps: ArchiveServiceDeps) {}
}
