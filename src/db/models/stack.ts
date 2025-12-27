import { eq, and, desc, asc } from 'drizzle-orm';
import { getDb } from '../index';
import {
  stacks,
  stackBranches,
  pullRequests,
  type Stack,
  type NewStack,
  type StackBranch,
  type NewStackBranch,
  type PullRequest,
} from '../schema';
import { user } from '../auth-schema';

// Author type from better-auth user table
type Author = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  image: string | null;
  avatarUrl: string | null;
};

// Stack branch with optional PR info
export type StackBranchWithPR = StackBranch & {
  pr?: {
    id: string;
    number: number;
    title: string;
    state: 'open' | 'closed' | 'merged';
  } | null;
};

// Full stack with branches and author
export type StackWithDetails = Stack & {
  author: Author;
  branches: StackBranchWithPR[];
};

export const stackModel = {
  /**
   * Find a stack by ID
   */
  async findById(id: string): Promise<Stack | undefined> {
    const db = getDb();
    const [stack] = await db
      .select()
      .from(stacks)
      .where(eq(stacks.id, id));
    return stack;
  },

  /**
   * Find a stack by repo and name
   */
  async findByRepoAndName(
    repoId: string,
    name: string
  ): Promise<Stack | undefined> {
    const db = getDb();
    const [stack] = await db
      .select()
      .from(stacks)
      .where(and(eq(stacks.repoId, repoId), eq(stacks.name, name)));
    return stack;
  },

  /**
   * Find a stack with full details (author, branches, PRs)
   */
  async findWithDetails(id: string): Promise<StackWithDetails | undefined> {
    const db = getDb();
    
    // Get stack with author
    const stackResult = await db
      .select()
      .from(stacks)
      .innerJoin(user, eq(stacks.authorId, user.id))
      .where(eq(stacks.id, id));

    if (stackResult.length === 0) return undefined;

    const stack = stackResult[0].stacks;
    const author = {
      id: stackResult[0].user.id,
      name: stackResult[0].user.name,
      email: stackResult[0].user.email,
      username: stackResult[0].user.username,
      image: stackResult[0].user.image,
      avatarUrl: stackResult[0].user.avatarUrl,
    };

    // Get branches with PRs
    const branchesResult = await db
      .select({
        branch: stackBranches,
        pr: {
          id: pullRequests.id,
          number: pullRequests.number,
          title: pullRequests.title,
          state: pullRequests.state,
        },
      })
      .from(stackBranches)
      .leftJoin(pullRequests, eq(stackBranches.prId, pullRequests.id))
      .where(eq(stackBranches.stackId, id))
      .orderBy(asc(stackBranches.position));

    const branches: StackBranchWithPR[] = branchesResult.map((r) => ({
      ...r.branch,
      pr: r.pr,
    }));

    return {
      ...stack,
      author,
      branches,
    };
  },

  /**
   * List stacks by repo
   */
  async listByRepo(
    repoId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<Stack[]> {
    const db = getDb();
    let query = db
      .select()
      .from(stacks)
      .where(eq(stacks.repoId, repoId))
      .orderBy(desc(stacks.updatedAt));

    if (options.limit) {
      query = query.limit(options.limit) as typeof query;
    }

    if (options.offset) {
      query = query.offset(options.offset) as typeof query;
    }

    return query;
  },

  /**
   * List stacks by repo with branch counts
   */
  async listByRepoWithCounts(
    repoId: string
  ): Promise<(Stack & { branchCount: number })[]> {
    const db = getDb();
    
    const stacksList = await db
      .select()
      .from(stacks)
      .where(eq(stacks.repoId, repoId))
      .orderBy(desc(stacks.updatedAt));

    // Get branch counts for each stack
    const result = await Promise.all(
      stacksList.map(async (stack) => {
        const branches = await db
          .select()
          .from(stackBranches)
          .where(eq(stackBranches.stackId, stack.id));
        
        return {
          ...stack,
          branchCount: branches.length,
        };
      })
    );

    return result;
  },

  /**
   * Create a new stack
   */
  async create(data: NewStack): Promise<Stack> {
    const db = getDb();
    const [stack] = await db.insert(stacks).values(data).returning();
    return stack;
  },

  /**
   * Update a stack
   */
  async update(
    id: string,
    data: Partial<Omit<NewStack, 'id' | 'repoId' | 'createdAt'>>
  ): Promise<Stack | undefined> {
    const db = getDb();
    const [stack] = await db
      .update(stacks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(stacks.id, id))
      .returning();
    return stack;
  },

  /**
   * Delete a stack (cascades to branches)
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(stacks)
      .where(eq(stacks.id, id))
      .returning();
    return result.length > 0;
  },
};

export const stackBranchModel = {
  /**
   * Find a branch by ID
   */
  async findById(id: string): Promise<StackBranch | undefined> {
    const db = getDb();
    const [branch] = await db
      .select()
      .from(stackBranches)
      .where(eq(stackBranches.id, id));
    return branch;
  },

  /**
   * List branches for a stack (ordered by position)
   */
  async listByStack(stackId: string): Promise<StackBranch[]> {
    const db = getDb();
    return db
      .select()
      .from(stackBranches)
      .where(eq(stackBranches.stackId, stackId))
      .orderBy(asc(stackBranches.position));
  },

  /**
   * Add a branch to a stack
   */
  async add(
    stackId: string,
    branchName: string,
    position?: number
  ): Promise<StackBranch> {
    const db = getDb();

    // If no position specified, add to the end
    if (position === undefined) {
      const existing = await this.listByStack(stackId);
      position = existing.length;
    }

    const [branch] = await db
      .insert(stackBranches)
      .values({
        stackId,
        branchName,
        position,
      })
      .returning();

    // Update the stack's updatedAt
    await db
      .update(stacks)
      .set({ updatedAt: new Date() })
      .where(eq(stacks.id, stackId));

    return branch;
  },

  /**
   * Remove a branch from a stack
   */
  async remove(stackId: string, branchName: string): Promise<boolean> {
    const db = getDb();
    
    // Find and delete the branch
    const result = await db
      .delete(stackBranches)
      .where(
        and(
          eq(stackBranches.stackId, stackId),
          eq(stackBranches.branchName, branchName)
        )
      )
      .returning();

    if (result.length === 0) return false;

    // Reorder remaining branches to fill the gap
    const remaining = await this.listByStack(stackId);
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].position !== i) {
        await db
          .update(stackBranches)
          .set({ position: i })
          .where(eq(stackBranches.id, remaining[i].id));
      }
    }

    // Update the stack's updatedAt
    await db
      .update(stacks)
      .set({ updatedAt: new Date() })
      .where(eq(stacks.id, stackId));

    return true;
  },

  /**
   * Reorder branches in a stack
   */
  async reorder(stackId: string, branchNames: string[]): Promise<void> {
    const db = getDb();
    
    // Update positions based on new order
    for (let i = 0; i < branchNames.length; i++) {
      await db
        .update(stackBranches)
        .set({ position: i })
        .where(
          and(
            eq(stackBranches.stackId, stackId),
            eq(stackBranches.branchName, branchNames[i])
          )
        );
    }

    // Update the stack's updatedAt
    await db
      .update(stacks)
      .set({ updatedAt: new Date() })
      .where(eq(stacks.id, stackId));
  },

  /**
   * Link a PR to a stack branch
   */
  async linkPR(stackId: string, branchName: string, prId: string): Promise<void> {
    const db = getDb();
    
    await db
      .update(stackBranches)
      .set({ prId })
      .where(
        and(
          eq(stackBranches.stackId, stackId),
          eq(stackBranches.branchName, branchName)
        )
      );

    // Also update the PR to reference this stack
    await db
      .update(pullRequests)
      .set({ stackId })
      .where(eq(pullRequests.id, prId));
  },

  /**
   * Unlink a PR from a stack branch
   */
  async unlinkPR(stackId: string, branchName: string): Promise<void> {
    const db = getDb();
    
    // Get the branch to find the PR ID
    const [branch] = await db
      .select()
      .from(stackBranches)
      .where(
        and(
          eq(stackBranches.stackId, stackId),
          eq(stackBranches.branchName, branchName)
        )
      );

    if (branch?.prId) {
      // Remove stack reference from PR
      await db
        .update(pullRequests)
        .set({ stackId: null })
        .where(eq(pullRequests.id, branch.prId));
    }

    // Remove PR reference from branch
    await db
      .update(stackBranches)
      .set({ prId: null })
      .where(
        and(
          eq(stackBranches.stackId, stackId),
          eq(stackBranches.branchName, branchName)
        )
      );
  },

  /**
   * Find a stack branch by its associated PR
   */
  async findByPR(prId: string): Promise<(StackBranch & { stack: Stack }) | undefined> {
    const db = getDb();
    
    const result = await db
      .select()
      .from(stackBranches)
      .innerJoin(stacks, eq(stackBranches.stackId, stacks.id))
      .where(eq(stackBranches.prId, prId));

    if (result.length === 0) return undefined;

    return {
      ...result[0].stack_branches,
      stack: result[0].stacks,
    };
  },
};
