import { eq, and, desc, asc, isNull, sql, count, max } from 'drizzle-orm';
import { getDb } from '../index';
import {
  journalPages,
  journalComments,
  journalPageHistory,
  type JournalPage,
  type NewJournalPage,
  type JournalComment,
  type NewJournalComment,
  type JournalPageHistoryEntry,
  type NewJournalPageHistoryEntry,
  type JournalPageStatus,
} from '../schema';
import { user } from '../auth-schema';

// Page status values
export const JOURNAL_PAGE_STATUSES: JournalPageStatus[] = ['draft', 'published', 'archived'];

// Status display configuration
export const JOURNAL_STATUS_CONFIG: Record<JournalPageStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: '6b7280' },
  published: { label: 'Published', color: '22c55e' },
  archived: { label: 'Archived', color: 'f59e0b' },
};

/**
 * Generate a URL-friendly slug from a title
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .substring(0, 100); // Limit length
}

/**
 * Ensure slug is unique within a repository
 */
async function ensureUniqueSlug(repoId: string, slug: string, excludeId?: string): Promise<string> {
  const db = getDb();
  let candidateSlug = slug;
  let counter = 1;

  while (true) {
    const conditions = [
      eq(journalPages.repoId, repoId),
      eq(journalPages.slug, candidateSlug),
    ];
    if (excludeId) {
      conditions.push(sql`${journalPages.id} != ${excludeId}`);
    }

    const [existing] = await db
      .select({ id: journalPages.id })
      .from(journalPages)
      .where(and(...conditions));

    if (!existing) {
      return candidateSlug;
    }

    candidateSlug = `${slug}-${counter}`;
    counter++;
  }
}

export const journalPageModel = {
  /**
   * Find a page by ID
   */
  async findById(id: string): Promise<JournalPage | undefined> {
    const db = getDb();
    const [page] = await db.select().from(journalPages).where(eq(journalPages.id, id));
    return page;
  },

  /**
   * Find a page by repo and slug
   */
  async findByRepoAndSlug(repoId: string, slug: string): Promise<JournalPage | undefined> {
    const db = getDb();
    const [page] = await db
      .select()
      .from(journalPages)
      .where(and(eq(journalPages.repoId, repoId), eq(journalPages.slug, slug)));
    return page;
  },

  /**
   * Create a new page
   */
  async create(data: Omit<NewJournalPage, 'slug'> & { slug?: string }): Promise<JournalPage> {
    const db = getDb();
    
    // Generate slug from title if not provided
    const baseSlug = data.slug || generateSlug(data.title);
    const slug = await ensureUniqueSlug(data.repoId, baseSlug);

    // Get the next position for root or child pages
    const parentCondition = data.parentId 
      ? eq(journalPages.parentId, data.parentId)
      : isNull(journalPages.parentId);
    
    const [maxPos] = await db
      .select({ maxPosition: max(journalPages.position) })
      .from(journalPages)
      .where(and(eq(journalPages.repoId, data.repoId), parentCondition));
    
    const position = (maxPos?.maxPosition ?? -1) + 1;

    const [page] = await db
      .insert(journalPages)
      .values({ ...data, slug, position })
      .returning();

    // Create initial history entry
    await journalPageHistoryModel.create({
      pageId: page.id,
      title: page.title,
      content: page.content,
      authorId: page.authorId,
      version: 1,
      changeDescription: 'Page created',
    });

    return page;
  },

  /**
   * Update a page
   */
  async update(
    id: string,
    data: Partial<Omit<NewJournalPage, 'id' | 'repoId' | 'createdAt'>>,
    options?: { createHistory?: boolean; userId?: string; changeDescription?: string }
  ): Promise<JournalPage | undefined> {
    const db = getDb();
    
    // If title changes, we might want to update slug too
    let updateData: any = { ...data, updatedAt: new Date() };
    
    if (data.title && !data.slug) {
      const page = await this.findById(id);
      if (page) {
        const baseSlug = generateSlug(data.title);
        updateData.slug = await ensureUniqueSlug(page.repoId, baseSlug, id);
      }
    }

    const [page] = await db
      .update(journalPages)
      .set(updateData)
      .where(eq(journalPages.id, id))
      .returning();

    // Create history entry if content or title changed
    if (page && options?.createHistory !== false && (data.title || data.content)) {
      const [latestVersion] = await db
        .select({ version: max(journalPageHistory.version) })
        .from(journalPageHistory)
        .where(eq(journalPageHistory.pageId, id));

      await journalPageHistoryModel.create({
        pageId: page.id,
        title: page.title,
        content: page.content,
        authorId: options?.userId || page.authorId,
        version: (latestVersion?.version ?? 0) + 1,
        changeDescription: options?.changeDescription,
      });
    }

    return page;
  },

  /**
   * Delete a page (and all its children)
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    
    // Recursively delete children first
    const children = await this.getChildren(id);
    for (const child of children) {
      await this.delete(child.id);
    }
    
    const result = await db.delete(journalPages).where(eq(journalPages.id, id)).returning();
    return result.length > 0;
  },

  /**
   * List pages by repository
   */
  async listByRepo(
    repoId: string,
    options: {
      parentId?: string | null;
      status?: JournalPageStatus;
      limit?: number;
      offset?: number;
      includeChildren?: boolean;
    } = {}
  ): Promise<JournalPage[]> {
    const db = getDb();
    const conditions = [eq(journalPages.repoId, repoId)];

    // If parentId is explicitly null, get root pages
    // If parentId is provided, get children of that page
    // If parentId is undefined, get all pages
    if (options.parentId === null) {
      conditions.push(isNull(journalPages.parentId));
    } else if (options.parentId !== undefined) {
      conditions.push(eq(journalPages.parentId, options.parentId));
    }

    if (options.status) {
      conditions.push(eq(journalPages.status, options.status));
    }

    let query = db
      .select()
      .from(journalPages)
      .where(and(...conditions))
      .orderBy(asc(journalPages.position), desc(journalPages.createdAt));

    if (options.limit) {
      query = query.limit(options.limit) as typeof query;
    }

    if (options.offset) {
      query = query.offset(options.offset) as typeof query;
    }

    return query;
  },

  /**
   * Get child pages
   */
  async getChildren(parentId: string): Promise<JournalPage[]> {
    const db = getDb();
    return db
      .select()
      .from(journalPages)
      .where(eq(journalPages.parentId, parentId))
      .orderBy(asc(journalPages.position));
  },

  /**
   * Get page tree (hierarchical structure)
   */
  async getTree(
    repoId: string,
    options?: { status?: JournalPageStatus }
  ): Promise<Array<JournalPage & { children: JournalPage[] }>> {
    // Get all pages for the repo
    const allPages = await this.listByRepo(repoId, { status: options?.status });
    
    // Build a map for quick lookup
    const pageMap = new Map<string, JournalPage & { children: JournalPage[] }>();
    allPages.forEach(page => {
      pageMap.set(page.id, { ...page, children: [] });
    });

    // Build tree structure
    const rootPages: Array<JournalPage & { children: JournalPage[] }> = [];
    
    for (const page of allPages) {
      const pageWithChildren = pageMap.get(page.id)!;
      if (page.parentId && pageMap.has(page.parentId)) {
        pageMap.get(page.parentId)!.children.push(pageWithChildren);
      } else {
        rootPages.push(pageWithChildren);
      }
    }

    return rootPages;
  },

  /**
   * Move a page (change parent or position)
   */
  async move(
    id: string,
    newParentId: string | null,
    newPosition?: number
  ): Promise<JournalPage | undefined> {
    const db = getDb();
    const page = await this.findById(id);
    if (!page) return undefined;

    // Prevent moving a page into its own descendant
    if (newParentId) {
      let checkParent = await this.findById(newParentId);
      while (checkParent) {
        if (checkParent.id === id) {
          throw new Error('Cannot move a page into its own descendant');
        }
        checkParent = checkParent.parentId ? await this.findById(checkParent.parentId) : undefined;
      }
    }

    // Get the position if not specified
    let position = newPosition;
    if (position === undefined) {
      const parentCondition = newParentId 
        ? eq(journalPages.parentId, newParentId)
        : isNull(journalPages.parentId);
      
      const [maxPos] = await db
        .select({ maxPosition: max(journalPages.position) })
        .from(journalPages)
        .where(and(eq(journalPages.repoId, page.repoId), parentCondition));
      
      position = (maxPos?.maxPosition ?? -1) + 1;
    }

    const [updated] = await db
      .update(journalPages)
      .set({ parentId: newParentId, position, updatedAt: new Date() })
      .where(eq(journalPages.id, id))
      .returning();

    return updated;
  },

  /**
   * Reorder pages within a parent
   */
  async reorder(repoId: string, parentId: string | null, orderedIds: string[]): Promise<void> {
    const db = getDb();
    
    for (let i = 0; i < orderedIds.length; i++) {
      await db
        .update(journalPages)
        .set({ position: i, updatedAt: new Date() })
        .where(and(
          eq(journalPages.id, orderedIds[i]),
          eq(journalPages.repoId, repoId)
        ));
    }
  },

  /**
   * Publish a page
   */
  async publish(id: string): Promise<JournalPage | undefined> {
    const db = getDb();
    const now = new Date();

    const [page] = await db
      .update(journalPages)
      .set({ status: 'published', publishedAt: now, updatedAt: now })
      .where(eq(journalPages.id, id))
      .returning();

    return page;
  },

  /**
   * Unpublish (back to draft)
   */
  async unpublish(id: string): Promise<JournalPage | undefined> {
    const db = getDb();
    const [page] = await db
      .update(journalPages)
      .set({ status: 'draft', publishedAt: null, updatedAt: new Date() })
      .where(eq(journalPages.id, id))
      .returning();

    return page;
  },

  /**
   * Archive a page
   */
  async archive(id: string): Promise<JournalPage | undefined> {
    const db = getDb();
    const [page] = await db
      .update(journalPages)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(journalPages.id, id))
      .returning();

    return page;
  },

  /**
   * Search pages by title or content
   */
  async search(
    repoId: string,
    query: string,
    options?: { status?: JournalPageStatus; limit?: number }
  ): Promise<JournalPage[]> {
    const db = getDb();
    const searchPattern = `%${query}%`;
    
    const conditions = [
      eq(journalPages.repoId, repoId),
      sql`(${journalPages.title} ILIKE ${searchPattern} OR ${journalPages.content} ILIKE ${searchPattern})`,
    ];

    if (options?.status) {
      conditions.push(eq(journalPages.status, options.status));
    }

    let dbQuery = db
      .select()
      .from(journalPages)
      .where(and(...conditions))
      .orderBy(desc(journalPages.updatedAt));

    if (options?.limit) {
      dbQuery = dbQuery.limit(options.limit) as typeof dbQuery;
    }

    return dbQuery;
  },

  /**
   * Get page with author details
   */
  async getWithAuthor(id: string): Promise<(JournalPage & { author: { id: string; name: string; image: string | null } }) | undefined> {
    const db = getDb();
    
    const result = await db
      .select({
        page: journalPages,
        author: {
          id: user.id,
          name: user.name,
          image: user.image,
        },
      })
      .from(journalPages)
      .innerJoin(user, eq(journalPages.authorId, user.id))
      .where(eq(journalPages.id, id));

    if (result.length === 0) return undefined;

    return {
      ...result[0].page,
      author: result[0].author,
    };
  },

  /**
   * Get page count for a repository
   */
  async count(repoId: string, options?: { status?: JournalPageStatus }): Promise<number> {
    const db = getDb();
    const conditions = [eq(journalPages.repoId, repoId)];
    
    if (options?.status) {
      conditions.push(eq(journalPages.status, options.status));
    }

    const [result] = await db
      .select({ count: count() })
      .from(journalPages)
      .where(and(...conditions));

    return result?.count ?? 0;
  },
};

export const journalCommentModel = {
  /**
   * Find a comment by ID
   */
  async findById(id: string): Promise<JournalComment | undefined> {
    const db = getDb();
    const [comment] = await db.select().from(journalComments).where(eq(journalComments.id, id));
    return comment;
  },

  /**
   * Create a comment
   */
  async create(data: NewJournalComment): Promise<JournalComment> {
    const db = getDb();
    const [comment] = await db.insert(journalComments).values(data).returning();
    return comment;
  },

  /**
   * Update a comment
   */
  async update(id: string, data: Partial<Pick<NewJournalComment, 'body'>>): Promise<JournalComment | undefined> {
    const db = getDb();
    const [comment] = await db
      .update(journalComments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(journalComments.id, id))
      .returning();
    return comment;
  },

  /**
   * Delete a comment
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.delete(journalComments).where(eq(journalComments.id, id)).returning();
    return result.length > 0;
  },

  /**
   * List comments for a page
   */
  async listByPage(pageId: string): Promise<Array<JournalComment & { user: { id: string; name: string; image: string | null } }>> {
    const db = getDb();
    
    const result = await db
      .select({
        comment: journalComments,
        user: {
          id: user.id,
          name: user.name,
          image: user.image,
        },
      })
      .from(journalComments)
      .innerJoin(user, eq(journalComments.userId, user.id))
      .where(eq(journalComments.pageId, pageId))
      .orderBy(asc(journalComments.createdAt));

    return result.map(r => ({ ...r.comment, user: r.user }));
  },

  /**
   * Resolve a comment
   */
  async resolve(id: string, resolvedById: string): Promise<JournalComment | undefined> {
    const db = getDb();
    const [comment] = await db
      .update(journalComments)
      .set({
        isResolved: true,
        resolvedAt: new Date(),
        resolvedById,
        updatedAt: new Date(),
      })
      .where(eq(journalComments.id, id))
      .returning();
    return comment;
  },

  /**
   * Unresolve a comment
   */
  async unresolve(id: string): Promise<JournalComment | undefined> {
    const db = getDb();
    const [comment] = await db
      .update(journalComments)
      .set({
        isResolved: false,
        resolvedAt: null,
        resolvedById: null,
        updatedAt: new Date(),
      })
      .where(eq(journalComments.id, id))
      .returning();
    return comment;
  },
};

export const journalPageHistoryModel = {
  /**
   * Create a history entry
   */
  async create(data: NewJournalPageHistoryEntry): Promise<JournalPageHistoryEntry> {
    const db = getDb();
    const [entry] = await db.insert(journalPageHistory).values(data).returning();
    return entry;
  },

  /**
   * List history for a page
   */
  async listByPage(pageId: string, limit: number = 50): Promise<Array<JournalPageHistoryEntry & { author: { id: string; name: string; image: string | null } }>> {
    const db = getDb();
    
    const result = await db
      .select({
        entry: journalPageHistory,
        author: {
          id: user.id,
          name: user.name,
          image: user.image,
        },
      })
      .from(journalPageHistory)
      .innerJoin(user, eq(journalPageHistory.authorId, user.id))
      .where(eq(journalPageHistory.pageId, pageId))
      .orderBy(desc(journalPageHistory.version))
      .limit(limit);

    return result.map(r => ({ ...r.entry, author: r.author }));
  },

  /**
   * Get a specific version
   */
  async getVersion(pageId: string, version: number): Promise<JournalPageHistoryEntry | undefined> {
    const db = getDb();
    const [entry] = await db
      .select()
      .from(journalPageHistory)
      .where(and(
        eq(journalPageHistory.pageId, pageId),
        eq(journalPageHistory.version, version)
      ));
    return entry;
  },

  /**
   * Restore a page to a specific version
   */
  async restoreVersion(pageId: string, version: number, userId: string): Promise<JournalPage | undefined> {
    const historyEntry = await this.getVersion(pageId, version);
    if (!historyEntry) return undefined;

    return journalPageModel.update(pageId, {
      title: historyEntry.title,
      content: historyEntry.content,
    }, {
      createHistory: true,
      userId,
      changeDescription: `Restored from version ${version}`,
    });
  },
};
