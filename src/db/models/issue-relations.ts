import { eq, and, or, inArray } from 'drizzle-orm';
import { getDb } from '../index';
import {
  issueRelations,
  issues,
  type IssueRelation,
  type IssueRelationType,
  type Issue,
} from '../schema';

// Inverse relation types for bidirectional relationships
const INVERSE_RELATIONS: Record<IssueRelationType, IssueRelationType> = {
  blocks: 'blocked_by',
  blocked_by: 'blocks',
  relates_to: 'relates_to',
  duplicates: 'duplicated_by',
  duplicated_by: 'duplicates',
};

export const issueRelationModel = {
  /**
   * Add a relation between two issues
   * Creates bidirectional relationship automatically
   */
  async addRelation(
    issueId: string,
    relatedIssueId: string,
    type: IssueRelationType,
    createdById: string
  ): Promise<IssueRelation> {
    const db = getDb();

    // Prevent self-referential relations
    if (issueId === relatedIssueId) {
      throw new Error('Cannot create relation to self');
    }

    // Create the primary relation
    const [relation] = await db
      .insert(issueRelations)
      .values({
        issueId,
        relatedIssueId,
        type,
        createdById,
      })
      .onConflictDoNothing()
      .returning();

    // Create the inverse relation (except for relates_to which is symmetric)
    const inverseType = INVERSE_RELATIONS[type];
    if (inverseType !== type) {
      await db
        .insert(issueRelations)
        .values({
          issueId: relatedIssueId,
          relatedIssueId: issueId,
          type: inverseType,
          createdById,
        })
        .onConflictDoNothing();
    }

    return relation;
  },

  /**
   * Remove a relation between two issues
   * Removes bidirectional relationship automatically
   */
  async removeRelation(
    issueId: string,
    relatedIssueId: string,
    type: IssueRelationType
  ): Promise<boolean> {
    const db = getDb();

    // Remove the primary relation
    const result = await db
      .delete(issueRelations)
      .where(
        and(
          eq(issueRelations.issueId, issueId),
          eq(issueRelations.relatedIssueId, relatedIssueId),
          eq(issueRelations.type, type)
        )
      )
      .returning();

    // Remove the inverse relation
    const inverseType = INVERSE_RELATIONS[type];
    await db
      .delete(issueRelations)
      .where(
        and(
          eq(issueRelations.issueId, relatedIssueId),
          eq(issueRelations.relatedIssueId, issueId),
          eq(issueRelations.type, inverseType)
        )
      );

    return result.length > 0;
  },

  /**
   * Get all relations for an issue, grouped by type
   */
  async getRelations(issueId: string): Promise<{
    blocks: Issue[];
    blockedBy: Issue[];
    relatesTo: Issue[];
    duplicates: Issue[];
    duplicatedBy: Issue[];
  }> {
    const db = getDb();

    const relations = await db
      .select({
        relation: issueRelations,
        relatedIssue: issues,
      })
      .from(issueRelations)
      .innerJoin(issues, eq(issueRelations.relatedIssueId, issues.id))
      .where(eq(issueRelations.issueId, issueId));

    const result = {
      blocks: [] as Issue[],
      blockedBy: [] as Issue[],
      relatesTo: [] as Issue[],
      duplicates: [] as Issue[],
      duplicatedBy: [] as Issue[],
    };

    for (const r of relations) {
      switch (r.relation.type) {
        case 'blocks':
          result.blocks.push(r.relatedIssue);
          break;
        case 'blocked_by':
          result.blockedBy.push(r.relatedIssue);
          break;
        case 'relates_to':
          result.relatesTo.push(r.relatedIssue);
          break;
        case 'duplicates':
          result.duplicates.push(r.relatedIssue);
          break;
        case 'duplicated_by':
          result.duplicatedBy.push(r.relatedIssue);
          break;
      }
    }

    return result;
  },

  /**
   * Get issues that this issue blocks
   */
  async getBlocking(issueId: string): Promise<Issue[]> {
    const db = getDb();

    const result = await db
      .select({ issue: issues })
      .from(issueRelations)
      .innerJoin(issues, eq(issueRelations.relatedIssueId, issues.id))
      .where(
        and(
          eq(issueRelations.issueId, issueId),
          eq(issueRelations.type, 'blocks')
        )
      );

    return result.map((r) => r.issue);
  },

  /**
   * Get issues blocking this issue
   */
  async getBlockedBy(issueId: string): Promise<Issue[]> {
    const db = getDb();

    const result = await db
      .select({ issue: issues })
      .from(issueRelations)
      .innerJoin(issues, eq(issueRelations.relatedIssueId, issues.id))
      .where(
        and(
          eq(issueRelations.issueId, issueId),
          eq(issueRelations.type, 'blocked_by')
        )
      );

    return result.map((r) => r.issue);
  },

  /**
   * Get related issues
   */
  async getRelated(issueId: string): Promise<Issue[]> {
    const db = getDb();

    const result = await db
      .select({ issue: issues })
      .from(issueRelations)
      .innerJoin(issues, eq(issueRelations.relatedIssueId, issues.id))
      .where(
        and(
          eq(issueRelations.issueId, issueId),
          eq(issueRelations.type, 'relates_to')
        )
      );

    return result.map((r) => r.issue);
  },

  /**
   * Get duplicate issues
   */
  async getDuplicates(issueId: string): Promise<Issue[]> {
    const db = getDb();

    const result = await db
      .select({ issue: issues })
      .from(issueRelations)
      .innerJoin(issues, eq(issueRelations.relatedIssueId, issues.id))
      .where(
        and(
          eq(issueRelations.issueId, issueId),
          or(
            eq(issueRelations.type, 'duplicates'),
            eq(issueRelations.type, 'duplicated_by')
          )
        )
      );

    return result.map((r) => r.issue);
  },

  /**
   * Check if an issue is blocked by any open issues
   */
  async isBlocked(issueId: string): Promise<boolean> {
    const blockedBy = await this.getBlockedBy(issueId);
    return blockedBy.some((issue) => issue.state === 'open');
  },

  /**
   * Get open blockers for an issue
   */
  async getOpenBlockers(issueId: string): Promise<Issue[]> {
    const blockedBy = await this.getBlockedBy(issueId);
    return blockedBy.filter((issue) => issue.state === 'open');
  },

  /**
   * Mark an issue as duplicate and close it
   */
  async markAsDuplicate(
    issueId: string,
    canonicalIssueId: string,
    userId: string
  ): Promise<IssueRelation> {
    const db = getDb();

    // Add duplicate relation
    const relation = await this.addRelation(
      issueId,
      canonicalIssueId,
      'duplicates',
      userId
    );

    // Close the duplicate issue
    await db
      .update(issues)
      .set({
        state: 'closed',
        status: 'canceled',
        closedAt: new Date(),
        closedById: userId,
        updatedAt: new Date(),
      })
      .where(eq(issues.id, issueId));

    return relation;
  },

  /**
   * Get all relations for multiple issues (batch query)
   */
  async getRelationsBatch(
    issueIds: string[]
  ): Promise<Map<string, IssueRelation[]>> {
    if (issueIds.length === 0) {
      return new Map();
    }

    const db = getDb();

    const relations = await db
      .select()
      .from(issueRelations)
      .where(inArray(issueRelations.issueId, issueIds));

    const relationsMap = new Map<string, IssueRelation[]>();

    // Initialize all issue IDs with empty arrays
    for (const id of issueIds) {
      relationsMap.set(id, []);
    }

    // Populate with actual relations
    for (const r of relations) {
      const existing = relationsMap.get(r.issueId) || [];
      existing.push(r);
      relationsMap.set(r.issueId, existing);
    }

    return relationsMap;
  },
};
