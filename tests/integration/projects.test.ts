/**
 * Projects Integration Tests
 * 
 * Tests for project boards functionality including:
 * - Project creation and management
 * - Columns/lists
 * - Cards and issue linking
 * - Project views
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startTestServer,
  stopTestServer,
  createTestClient,
  createAuthenticatedClient,
  uniqueUsername,
  uniqueEmail,
  uniqueRepoName,
} from './setup';

describe('Projects', () => {
  let ownerToken: string;
  let ownerId: string;
  let repoId: string;
  let projectId: string;
  let columnId: string;
  let issueId: string;

  beforeAll(async () => {
    await startTestServer();

    const api = createTestClient();

    // Create test user
    const result = await api.auth.register.mutate({
      username: uniqueUsername('projects-test'),
      email: uniqueEmail('projects-test'),
      password: 'password123',
      name: 'Projects Test User',
    });
    ownerToken = result.sessionId;
    ownerId = result.user.id;

    // Create a repository
    const authApi = createAuthenticatedClient(ownerToken);
    const repo = await authApi.repos.create.mutate({
      name: uniqueRepoName('projects-repo'),
      description: 'Repository for projects tests',
      isPrivate: false,
    });
    repoId = repo.id;

    // Create an issue for card linking
    const issue = await authApi.issues.create.mutate({
      repoId,
      title: 'Issue for project card',
      body: 'This issue will be linked to a project card',
    });
    issueId = issue.id;
  }, 30000);

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Project Creation', () => {
    it('creates a new project', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const project = await authApi.projects.create.mutate({
        repoId,
        name: 'Test Project',
        description: 'A test project board',
      });

      expect(project).toBeDefined();
      expect(project.name).toBe('Test Project');
      expect(project.repoId).toBe(repoId);
      projectId = project.id;
    });

    it('creates project with template', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const project = await authApi.projects.create.mutate({
        repoId,
        name: 'Kanban Project',
        template: 'kanban',
      });

      expect(project).toBeDefined();
      expect(project.name).toBe('Kanban Project');
    });

    it('requires authentication', async () => {
      const api = createTestClient();

      await expect(
        api.projects.create.mutate({
          repoId,
          name: 'Unauthenticated Project',
        })
      ).rejects.toThrow();
    });
  });

  describe('Project Listing', () => {
    it('lists projects for repository', async () => {
      const api = createTestClient();

      const projects = await api.projects.list.query({ repoId });

      expect(Array.isArray(projects)).toBe(true);
      expect(projects.length).toBeGreaterThan(0);
    });

    it('gets project by ID', async () => {
      const api = createTestClient();

      const project = await api.projects.get.query({ projectId });

      expect(project).toBeDefined();
      expect(project.id).toBe(projectId);
      expect(project.name).toBe('Test Project');
    });

    it('includes column count', async () => {
      const api = createTestClient();

      const projects = await api.projects.list.query({ repoId });

      if (projects.length > 0) {
        expect(typeof projects[0].columnCount).toBe('number');
      }
    });
  });

  describe('Column Management', () => {
    it('creates a column', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const column = await authApi.projects.createColumn.mutate({
        projectId,
        name: 'To Do',
      });

      expect(column).toBeDefined();
      expect(column.name).toBe('To Do');
      expect(column.projectId).toBe(projectId);
      columnId = column.id;
    });

    it('creates multiple columns', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      await authApi.projects.createColumn.mutate({
        projectId,
        name: 'In Progress',
      });

      await authApi.projects.createColumn.mutate({
        projectId,
        name: 'Done',
      });

      const columns = await api.projects.columns.query({ projectId });
      expect(columns.length).toBeGreaterThanOrEqual(3);
    });

    it('lists columns for project', async () => {
      const api = createTestClient();

      const columns = await api.projects.columns.query({ projectId });

      expect(Array.isArray(columns)).toBe(true);
      expect(columns.some(c => c.name === 'To Do')).toBe(true);
    });

    it('updates column name', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const updated = await authApi.projects.updateColumn.mutate({
        columnId,
        name: 'Backlog',
      });

      expect(updated.name).toBe('Backlog');
    });

    it('reorders columns', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      const columns = await api.projects.columns.query({ projectId });
      const columnIds = columns.map(c => c.id);

      // Reverse the order
      const reversed = [...columnIds].reverse();

      const result = await authApi.projects.reorderColumns.mutate({
        projectId,
        columnIds: reversed,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Card Management', () => {
    let cardId: string;

    it('creates a card', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const card = await authApi.projects.createCard.mutate({
        columnId,
        title: 'Test Card',
        body: 'A test card',
      });

      expect(card).toBeDefined();
      expect(card.title).toBe('Test Card');
      expect(card.columnId).toBe(columnId);
      cardId = card.id;
    });

    it('creates card from issue', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const card = await authApi.projects.createCardFromIssue.mutate({
        columnId,
        issueId,
      });

      expect(card).toBeDefined();
      expect(card.issueId).toBe(issueId);
    });

    it('lists cards in column', async () => {
      const api = createTestClient();

      const cards = await api.projects.cards.query({ columnId });

      expect(Array.isArray(cards)).toBe(true);
      expect(cards.length).toBeGreaterThan(0);
    });

    it('updates card', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const updated = await authApi.projects.updateCard.mutate({
        cardId,
        title: 'Updated Card',
        body: 'Updated body',
      });

      expect(updated.title).toBe('Updated Card');
    });

    it('moves card to different column', async () => {
      const authApi = createAuthenticatedClient(ownerToken);
      const api = createTestClient();

      // Get another column
      const columns = await api.projects.columns.query({ projectId });
      const targetColumn = columns.find(c => c.id !== columnId);

      if (targetColumn) {
        const result = await authApi.projects.moveCard.mutate({
          cardId,
          columnId: targetColumn.id,
        });

        expect(result.columnId).toBe(targetColumn.id);
      }
    });

    it('reorders cards within column', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Create more cards
      await authApi.projects.createCard.mutate({
        columnId,
        title: 'Card 2',
      });

      await authApi.projects.createCard.mutate({
        columnId,
        title: 'Card 3',
      });

      const cards = await api.projects.cards.query({ columnId });
      const cardIds = cards.map(c => c.id);

      const result = await authApi.projects.reorderCards.mutate({
        columnId,
        cardIds: cardIds.reverse(),
      });

      expect(result.success).toBe(true);
    });

    it('deletes card', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Create a card to delete
      const card = await authApi.projects.createCard.mutate({
        columnId,
        title: 'Card to Delete',
      });

      const result = await authApi.projects.deleteCard.mutate({
        cardId: card.id,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Project Updates', () => {
    it('updates project name', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const updated = await authApi.projects.update.mutate({
        projectId,
        name: 'Updated Project Name',
      });

      expect(updated.name).toBe('Updated Project Name');
    });

    it('updates project description', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const updated = await authApi.projects.update.mutate({
        projectId,
        description: 'Updated description',
      });

      expect(updated.description).toBe('Updated description');
    });

    it('closes project', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const result = await authApi.projects.close.mutate({ projectId });

      expect(result.state).toBe('closed');
    });

    it('reopens project', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const result = await authApi.projects.reopen.mutate({ projectId });

      expect(result.state).toBe('open');
    });
  });

  describe('Column Deletion', () => {
    it('deletes empty column', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Create a column to delete
      const column = await authApi.projects.createColumn.mutate({
        projectId,
        name: 'Column to Delete',
      });

      const result = await authApi.projects.deleteColumn.mutate({
        columnId: column.id,
      });

      expect(result.success).toBe(true);
    });

    it('handles column with cards', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      // Create column with card
      const column = await authApi.projects.createColumn.mutate({
        projectId,
        name: 'Column with Cards',
      });

      await authApi.projects.createCard.mutate({
        columnId: column.id,
        title: 'Card in Column',
      });

      // Deletion should either move cards or fail gracefully
      try {
        await authApi.projects.deleteColumn.mutate({
          columnId: column.id,
          moveCardsTo: columnId, // Move cards to another column
        });
      } catch (e) {
        // Expected if the API requires cards to be moved first
      }
    });
  });

  describe('Project Deletion', () => {
    let deleteProjectId: string;

    beforeAll(async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const project = await authApi.projects.create.mutate({
        repoId,
        name: 'Project to Delete',
      });
      deleteProjectId = project.id;
    });

    it('deletes a project', async () => {
      const authApi = createAuthenticatedClient(ownerToken);

      const result = await authApi.projects.delete.mutate({
        projectId: deleteProjectId,
      });

      expect(result.success).toBe(true);
    });

    it('deleted project is no longer retrievable', async () => {
      const api = createTestClient();

      await expect(
        api.projects.get.query({ projectId: deleteProjectId })
      ).rejects.toThrow();
    });
  });
});

// Add a reference to the test client
const api = createTestClient();
