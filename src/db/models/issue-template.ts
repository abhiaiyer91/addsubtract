import { eq, and } from 'drizzle-orm';
import { getDb } from '../index';
import {
  issueTemplates,
  type IssueTemplate,
  type NewIssueTemplate,
  type NewIssue,
} from '../schema';

export const issueTemplateModel = {
  /**
   * Find a template by ID
   */
  async findById(id: string): Promise<IssueTemplate | undefined> {
    const db = getDb();
    const [template] = await db
      .select()
      .from(issueTemplates)
      .where(eq(issueTemplates.id, id));
    return template;
  },

  /**
   * Find a template by repo and name
   */
  async findByName(repoId: string, name: string): Promise<IssueTemplate | undefined> {
    const db = getDb();
    const [template] = await db
      .select()
      .from(issueTemplates)
      .where(and(eq(issueTemplates.repoId, repoId), eq(issueTemplates.name, name)));
    return template;
  },

  /**
   * Create a template
   */
  async create(data: NewIssueTemplate): Promise<IssueTemplate> {
    const db = getDb();
    const [template] = await db.insert(issueTemplates).values(data).returning();
    return template;
  },

  /**
   * Update a template
   */
  async update(
    id: string,
    data: Partial<Omit<NewIssueTemplate, 'id' | 'repoId' | 'createdAt'>>
  ): Promise<IssueTemplate | undefined> {
    const db = getDb();
    const [template] = await db
      .update(issueTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(issueTemplates.id, id))
      .returning();
    return template;
  },

  /**
   * Delete a template
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(issueTemplates)
      .where(eq(issueTemplates.id, id))
      .returning();
    return result.length > 0;
  },

  /**
   * List templates for a repo
   */
  async listByRepo(repoId: string): Promise<IssueTemplate[]> {
    const db = getDb();
    return db
      .select()
      .from(issueTemplates)
      .where(eq(issueTemplates.repoId, repoId))
      .orderBy(issueTemplates.name);
  },

  /**
   * Apply a template to issue data
   * Merges template defaults with provided data (provided data takes precedence)
   */
  applyTemplate(
    template: IssueTemplate,
    issueData: Partial<Omit<NewIssue, 'number'>>
  ): Partial<Omit<NewIssue, 'number'>> {
    const result: Partial<Omit<NewIssue, 'number'>> = { ...issueData };

    // Apply title template if title not provided
    if (!result.title && template.titleTemplate) {
      result.title = template.titleTemplate;
    }

    // Apply body template if body not provided
    if (!result.body && template.bodyTemplate) {
      result.body = template.bodyTemplate;
    }

    // Apply default priority if not provided
    if (!result.priority && template.defaultPriority) {
      result.priority = template.defaultPriority as any;
    }

    // Apply default status if not provided
    if (!result.status && template.defaultStatus) {
      result.status = template.defaultStatus as any;
    }

    // Apply default assignee if not provided
    if (!result.assigneeId && template.defaultAssigneeId) {
      result.assigneeId = template.defaultAssigneeId;
    }

    return result;
  },

  /**
   * Get default label IDs from a template
   */
  getDefaultLabelIds(template: IssueTemplate): string[] {
    if (!template.defaultLabels) return [];
    try {
      return JSON.parse(template.defaultLabels);
    } catch {
      return [];
    }
  },

  /**
   * Create default templates for a repo (bug report, feature request)
   */
  async createDefaults(repoId: string): Promise<IssueTemplate[]> {
    const db = getDb();
    const defaultTemplates = [
      {
        name: 'Bug Report',
        description: 'Report a bug or unexpected behavior',
        titleTemplate: '[Bug] ',
        bodyTemplate: `## Description
Describe the bug clearly and concisely.

## Steps to Reproduce
1. 
2. 
3. 

## Expected Behavior
What did you expect to happen?

## Actual Behavior
What actually happened?

## Environment
- OS: 
- Version: 
`,
        defaultPriority: 'medium',
        defaultStatus: 'triage',
      },
      {
        name: 'Feature Request',
        description: 'Suggest a new feature or enhancement',
        titleTemplate: '[Feature] ',
        bodyTemplate: `## Problem Statement
What problem does this feature solve?

## Proposed Solution
Describe your proposed solution.

## Alternatives Considered
What alternatives have you considered?

## Additional Context
Add any other context about the feature request here.
`,
        defaultPriority: 'none',
        defaultStatus: 'triage',
      },
      {
        name: 'Task',
        description: 'A general task or to-do item',
        titleTemplate: '',
        bodyTemplate: `## Description
What needs to be done?

## Acceptance Criteria
- [ ] 
- [ ] 
- [ ] 
`,
        defaultPriority: 'none',
        defaultStatus: 'backlog',
      },
    ];

    const created: IssueTemplate[] = [];
    for (const template of defaultTemplates) {
      const [t] = await db
        .insert(issueTemplates)
        .values({ ...template, repoId })
        .returning();
      created.push(t);
    }

    return created;
  },
};
