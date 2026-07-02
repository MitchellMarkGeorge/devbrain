import type { ProjectRepository } from './repository';

export class ProjectService {
  constructor(private repo: ProjectRepository) {}
}
