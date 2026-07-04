import { ProjectId } from '@common/ids';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { CreateProjectOptions, Project } from './types';
import { projects } from '@main/db/schema/projects';
import { eq, inArray, SQL, and, isNull, desc } from 'drizzle-orm';

export class ProjectService {
  constructor(private readonly db: BetterSQLite3Database) {}

  async getById(id: ProjectId): Promise<Project | null> {
    const [row] = await this.activeProjects(eq(projects.id, id)).limit(1);
    return row ?? null;
  }

  async getByIds(ids: ProjectId[]): Promise<Project[]> {
    return this.activeProjects(inArray(projects.id, ids));
  }

  async createProject(options: CreateProjectOptions): Promise<Project> {
    const newProject = {
      title: options.title,
      description: options.description ?? null,
      startDate: options.startDate ?? null,
      dueDate: options.dueDate,
      completedAt: null,
    };
    const [project] = await this.db.insert(projects).values(newProject).returning();
    return project;
  }

  // async listProjects()

  private activeProjects(condition: SQL<unknown>) {
    // automatically filters out archived projects
    return (
      this.db
        .select()
        .from(projects)
        .where(and(condition, isNull(projects.archivedAt)))
        // by default sort by created at (come back to this)
        .orderBy(desc(projects.createdAt))
    );
  }
}
