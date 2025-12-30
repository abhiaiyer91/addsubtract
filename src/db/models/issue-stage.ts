import { eq, and, asc } from 'drizzle-orm';
import { getDb } from '../index';
import {
  issueStages,
  type IssueStage,
  type NewIssueStage,
} from '../schema';

/**
 * Default stages that are created for each new repository
 * These match the existing hardcoded stages for backward compatibility
 */
export const DEFAULT_STAGES: Omit<NewIssueStage, 'repoId'>[] = [
  {
    key: 'triage',
    name: 'Triage',
    description: 'New issues that need to be reviewed and categorized',
    icon: '◇',
    color: '9ca3af',
    position: 0,
    isClosedState: false,
    isTriageState: true,
    isDefault: false,
    isSystem: true,
  },
  {
    key: 'backlog',
    name: 'Backlog',
    description: 'Issues that have been accepted but not yet scheduled',
    icon: '○',
    color: '6b7280',
    position: 1,
    isClosedState: false,
    isTriageState: false,
    isDefault: true,
    isSystem: true,
  },
  {
    key: 'todo',
    name: 'Todo',
    description: 'Issues ready to be worked on',
    icon: '◔',
    color: 'f59e0b',
    position: 2,
    isClosedState: false,
    isTriageState: false,
    isDefault: false,
    isSystem: true,
  },
  {
    key: 'in_progress',
    name: 'In Progress',
    description: 'Issues currently being worked on',
    icon: '◑',
    color: '3b82f6',
    position: 3,
    isClosedState: false,
    isTriageState: false,
    isDefault: false,
    isSystem: true,
  },
  {
    key: 'in_review',
    name: 'In Review',
    description: 'Issues pending review',
    icon: '◕',
    color: '8b5cf6',
    position: 4,
    isClosedState: false,
    isTriageState: false,
    isDefault: false,
    isSystem: true,
  },
  {
    key: 'done',
    name: 'Done',
    description: 'Completed issues',
    icon: '●',
    color: '22c55e',
    position: 5,
    isClosedState: true,
    isTriageState: false,
    isDefault: false,
    isSystem: true,
  },
  {
    key: 'canceled',
    name: 'Canceled',
    description: 'Issues that will not be worked on',
    icon: '⊘',
    color: 'ef4444',
    position: 6,
    isClosedState: true,
    isTriageState: false,
    isDefault: false,
    isSystem: true,
  },
];

export const issueStageModel = {
  /**
   * Find a stage by ID
   */
  async findById(id: string): Promise<IssueStage | undefined> {
    const db = getDb();
    const [stage] = await db
      .select()
      .from(issueStages)
      .where(eq(issueStages.id, id));
    return stage;
  },

  /**
   * Find a stage by key within a repository
   */
  async findByKey(repoId: string, key: string): Promise<IssueStage | undefined> {
    const db = getDb();
    const [stage] = await db
      .select()
      .from(issueStages)
      .where(and(eq(issueStages.repoId, repoId), eq(issueStages.key, key)));
    return stage;
  },

  /**
   * List all stages for a repository, ordered by position
   */
  async listByRepo(repoId: string): Promise<IssueStage[]> {
    const db = getDb();
    return db
      .select()
      .from(issueStages)
      .where(eq(issueStages.repoId, repoId))
      .orderBy(asc(issueStages.position));
  },

  /**
   * Get the default stage for a repository (used for new issues)
   */
  async getDefault(repoId: string): Promise<IssueStage | undefined> {
    const db = getDb();
    const [stage] = await db
      .select()
      .from(issueStages)
      .where(and(eq(issueStages.repoId, repoId), eq(issueStages.isDefault, true)));
    
    // If no default is set, fall back to first non-triage, non-closed stage
    if (!stage) {
      const [fallback] = await db
        .select()
        .from(issueStages)
        .where(
          and(
            eq(issueStages.repoId, repoId),
            eq(issueStages.isTriageState, false),
            eq(issueStages.isClosedState, false)
          )
        )
        .orderBy(asc(issueStages.position))
        .limit(1);
      return fallback;
    }
    
    return stage;
  },

  /**
   * Get the triage stage for a repository
   */
  async getTriage(repoId: string): Promise<IssueStage | undefined> {
    const db = getDb();
    const [stage] = await db
      .select()
      .from(issueStages)
      .where(and(eq(issueStages.repoId, repoId), eq(issueStages.isTriageState, true)));
    return stage;
  },

  /**
   * Get closed stages for a repository
   */
  async getClosedStages(repoId: string): Promise<IssueStage[]> {
    const db = getDb();
    return db
      .select()
      .from(issueStages)
      .where(and(eq(issueStages.repoId, repoId), eq(issueStages.isClosedState, true)))
      .orderBy(asc(issueStages.position));
  },

  /**
   * Get open (active) stages for a repository
   */
  async getOpenStages(repoId: string): Promise<IssueStage[]> {
    const db = getDb();
    return db
      .select()
      .from(issueStages)
      .where(and(eq(issueStages.repoId, repoId), eq(issueStages.isClosedState, false)))
      .orderBy(asc(issueStages.position));
  },

  /**
   * Create a new stage
   */
  async create(data: NewIssueStage): Promise<IssueStage> {
    const db = getDb();
    
    // Get the next position if not specified
    if (data.position === undefined || data.position === null) {
      const stages = await this.listByRepo(data.repoId);
      data.position = stages.length;
    }

    // Ensure only one default stage
    if (data.isDefault) {
      await db
        .update(issueStages)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(issueStages.repoId, data.repoId));
    }

    const [stage] = await db
      .insert(issueStages)
      .values(data)
      .returning();
    return stage;
  },

  /**
   * Update a stage
   */
  async update(
    id: string,
    data: Partial<Omit<NewIssueStage, 'id' | 'repoId' | 'createdAt'>>
  ): Promise<IssueStage | undefined> {
    const db = getDb();
    
    const stage = await this.findById(id);
    if (!stage) return undefined;

    // Ensure only one default stage
    if (data.isDefault) {
      await db
        .update(issueStages)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(issueStages.repoId, stage.repoId));
    }

    const [updated] = await db
      .update(issueStages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(issueStages.id, id))
      .returning();
    return updated;
  },

  /**
   * Delete a stage (only non-system stages can be deleted)
   * Returns false if the stage is a system stage
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    
    const stage = await this.findById(id);
    if (!stage || stage.isSystem) {
      return false;
    }

    const result = await db
      .delete(issueStages)
      .where(eq(issueStages.id, id))
      .returning();
    return result.length > 0;
  },

  /**
   * Reorder stages within a repository
   * Takes an array of stage IDs in the new order
   */
  async reorder(repoId: string, stageIds: string[]): Promise<IssueStage[]> {
    const db = getDb();
    
    // Update positions for each stage
    for (let i = 0; i < stageIds.length; i++) {
      await db
        .update(issueStages)
        .set({ position: i, updatedAt: new Date() })
        .where(and(eq(issueStages.id, stageIds[i]), eq(issueStages.repoId, repoId)));
    }

    return this.listByRepo(repoId);
  },

  /**
   * Create default stages for a new repository
   */
  async createDefaultStages(repoId: string): Promise<IssueStage[]> {
    const db = getDb();
    
    const created: IssueStage[] = [];
    for (const stageData of DEFAULT_STAGES) {
      const [stage] = await db
        .insert(issueStages)
        .values({ ...stageData, repoId })
        .returning();
      created.push(stage);
    }

    return created;
  },

  /**
   * Check if a repository has custom stages set up
   */
  async hasStages(repoId: string): Promise<boolean> {
    const db = getDb();
    const stages = await db
      .select({ id: issueStages.id })
      .from(issueStages)
      .where(eq(issueStages.repoId, repoId))
      .limit(1);
    return stages.length > 0;
  },

  /**
   * Get stage configuration as a map (for efficient lookups)
   */
  async getStageMap(repoId: string): Promise<Map<string, IssueStage>> {
    const stages = await this.listByRepo(repoId);
    const map = new Map<string, IssueStage>();
    for (const stage of stages) {
      map.set(stage.key, stage);
    }
    return map;
  },

  /**
   * Validate if a stage key is valid for a repository
   */
  async isValidStage(repoId: string, stageKey: string): Promise<boolean> {
    const stage = await this.findByKey(repoId, stageKey);
    return stage !== undefined;
  },

  /**
   * Get the next position for a new stage
   */
  async getNextPosition(repoId: string): Promise<number> {
    const stages = await this.listByRepo(repoId);
    return stages.length;
  },
};
