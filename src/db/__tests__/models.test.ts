import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { initDatabase, getDb, closeDatabase, schema } from '../index';
import { userModel, sessionModel, oauthAccountModel } from '../models/user';
import { repoModel, collaboratorModel, starModel, watchModel } from '../models/repository';
import { prModel, prReviewModel, prCommentModel } from '../models/pull-request';
import { issueModel, issueCommentModel, labelModel, issueLabelModel } from '../models/issue';
import { orgModel, orgMemberModel, teamModel, teamMemberModel } from '../models/organization';
import { activityModel, activityHelpers } from '../models/activity';
import { webhookModel } from '../models/webhook';

// Skip tests if no database URL provided
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const shouldSkip = !DATABASE_URL;

describe.skipIf(shouldSkip)('Database Models', () => {
  beforeAll(async () => {
    if (!DATABASE_URL) return;
    initDatabase(DATABASE_URL);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  beforeEach(async () => {
    if (!DATABASE_URL) return;
    const db = getDb();
    
    // Clean up tables in order (respecting foreign keys)
    // Wrap in try-catch to handle cases where tables haven't been created yet
    try {
      await db.execute(sql`TRUNCATE TABLE
        activities, webhooks, pr_labels, issue_labels, labels,
        pr_comments, pr_reviews, pull_requests, issue_comments, issues,
        collaborators, stars, watches, repositories,
        team_members, teams, org_members, organizations,
        oauth_accounts, sessions, users
        CASCADE`);
    } catch {
      // Tables may not exist yet, ignore truncate errors
    }
  });

  describe('User Model', () => {
    it('should create a user', async () => {
      const user = await userModel.create({
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
    });

    it('should find user by ID', async () => {
      const created = await userModel.create({
        username: 'findbyid',
        email: 'findbyid@example.com',
      });

      const found = await userModel.findById(created.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it('should find user by username', async () => {
      await userModel.create({
        username: 'findbyname',
        email: 'findbyname@example.com',
      });

      const found = await userModel.findByUsername('findbyname');
      expect(found).toBeDefined();
      expect(found?.username).toBe('findbyname');
    });

    it('should find user by email', async () => {
      await userModel.create({
        username: 'findbyemail',
        email: 'unique@example.com',
      });

      const found = await userModel.findByEmail('unique@example.com');
      expect(found).toBeDefined();
      expect(found?.email).toBe('unique@example.com');
    });

    it('should update a user', async () => {
      const user = await userModel.create({
        username: 'updateuser',
        email: 'update@example.com',
      });

      const updated = await userModel.update(user.id, {
        name: 'Updated Name',
        bio: 'New bio',
      });

      expect(updated?.name).toBe('Updated Name');
      expect(updated?.bio).toBe('New bio');
    });

    it('should check username availability', async () => {
      const available = await userModel.isUsernameAvailable('newuser');
      expect(available).toBe(true);

      await userModel.create({
        username: 'newuser',
        email: 'new@example.com',
      });

      const taken = await userModel.isUsernameAvailable('newuser');
      expect(taken).toBe(false);
    });

    it('should delete a user', async () => {
      const user = await userModel.create({
        username: 'deleteuser',
        email: 'delete@example.com',
      });

      const deleted = await userModel.delete(user.id);
      expect(deleted).toBe(true);

      const notFound = await userModel.findById(user.id);
      expect(notFound).toBeUndefined();
    });
  });

  describe('Repository Model', () => {
    let testUser: Awaited<ReturnType<typeof userModel.create>>;

    beforeEach(async () => {
      testUser = await userModel.create({
        username: 'repoowner',
        email: 'repoowner@example.com',
      });
    });

    it('should create a repository', async () => {
      const repo = await repoModel.create({
        ownerId: testUser.id,
        ownerType: 'user',
        name: 'test-repo',
        description: 'A test repository',
        diskPath: '/repos/repoowner/test-repo.git',
      });

      expect(repo).toBeDefined();
      expect(repo.id).toBeDefined();
      expect(repo.name).toBe('test-repo');
      expect(repo.ownerId).toBe(testUser.id);
    });

    it('should find repository by ID', async () => {
      const created = await repoModel.create({
        ownerId: testUser.id,
        ownerType: 'user',
        name: 'find-repo',
        diskPath: '/repos/repoowner/find-repo.git',
      });

      const found = await repoModel.findById(created.id);
      expect(found).toBeDefined();
      expect(found?.name).toBe('find-repo');
    });

    it('should list repositories by owner', async () => {
      await repoModel.create({
        ownerId: testUser.id,
        ownerType: 'user',
        name: 'repo-1',
        diskPath: '/repos/repoowner/repo-1.git',
      });

      await repoModel.create({
        ownerId: testUser.id,
        ownerType: 'user',
        name: 'repo-2',
        diskPath: '/repos/repoowner/repo-2.git',
      });

      const repos = await repoModel.listByOwner(testUser.id, 'user');
      expect(repos.length).toBe(2);
    });

    it('should update a repository', async () => {
      const repo = await repoModel.create({
        ownerId: testUser.id,
        ownerType: 'user',
        name: 'update-repo',
        diskPath: '/repos/repoowner/update-repo.git',
      });

      const updated = await repoModel.update(repo.id, {
        description: 'Updated description',
        isPrivate: true,
      });

      expect(updated?.description).toBe('Updated description');
      expect(updated?.isPrivate).toBe(true);
    });

    it('should increment counter', async () => {
      const repo = await repoModel.create({
        ownerId: testUser.id,
        ownerType: 'user',
        name: 'counter-repo',
        diskPath: '/repos/repoowner/counter-repo.git',
      });

      expect(repo.starsCount).toBe(0);

      await repoModel.incrementCounter(repo.id, 'starsCount', 1);
      const updated = await repoModel.findById(repo.id);
      expect(updated?.starsCount).toBe(1);

      await repoModel.incrementCounter(repo.id, 'starsCount', 5);
      const updated2 = await repoModel.findById(repo.id);
      expect(updated2?.starsCount).toBe(6);
    });
  });

  describe('Star & Watch Model', () => {
    let testUser: Awaited<ReturnType<typeof userModel.create>>;
    let testRepo: Awaited<ReturnType<typeof repoModel.create>>;

    beforeEach(async () => {
      testUser = await userModel.create({
        username: 'staruser',
        email: 'star@example.com',
      });

      testRepo = await repoModel.create({
        ownerId: testUser.id,
        ownerType: 'user',
        name: 'star-repo',
        diskPath: '/repos/staruser/star-repo.git',
      });
    });

    it('should star a repository', async () => {
      const star = await starModel.add(testRepo.id, testUser.id);
      expect(star).toBeDefined();

      const exists = await starModel.exists(testRepo.id, testUser.id);
      expect(exists).toBe(true);
    });

    it('should unstar a repository', async () => {
      await starModel.add(testRepo.id, testUser.id);
      const removed = await starModel.remove(testRepo.id, testUser.id);
      expect(removed).toBe(true);

      const exists = await starModel.exists(testRepo.id, testUser.id);
      expect(exists).toBe(false);
    });

    it('should watch a repository', async () => {
      const watch = await watchModel.add(testRepo.id, testUser.id);
      expect(watch).toBeDefined();

      const exists = await watchModel.exists(testRepo.id, testUser.id);
      expect(exists).toBe(true);
    });
  });

  describe('Pull Request Model', () => {
    let testUser: Awaited<ReturnType<typeof userModel.create>>;
    let testRepo: Awaited<ReturnType<typeof repoModel.create>>;

    beforeEach(async () => {
      testUser = await userModel.create({
        username: 'pruser',
        email: 'pr@example.com',
      });

      testRepo = await repoModel.create({
        ownerId: testUser.id,
        ownerType: 'user',
        name: 'pr-repo',
        diskPath: '/repos/pruser/pr-repo.git',
      });
    });

    it('should create a pull request with auto-incremented number', async () => {
      const pr1 = await prModel.create({
        repoId: testRepo.id,
        title: 'First PR',
        sourceBranch: 'feature-1',
        targetBranch: 'main',
        headSha: 'abc123',
        baseSha: '000000',
        authorId: testUser.id,
      });

      expect(pr1.number).toBe(1);

      const pr2 = await prModel.create({
        repoId: testRepo.id,
        title: 'Second PR',
        sourceBranch: 'feature-2',
        targetBranch: 'main',
        headSha: 'def456',
        baseSha: '000000',
        authorId: testUser.id,
      });

      expect(pr2.number).toBe(2);
    });

    it('should find PR by repo and number', async () => {
      await prModel.create({
        repoId: testRepo.id,
        title: 'Find this PR',
        sourceBranch: 'feature',
        targetBranch: 'main',
        headSha: 'abc123',
        baseSha: '000000',
        authorId: testUser.id,
      });

      const found = await prModel.findByRepoAndNumber(testRepo.id, 1);
      expect(found).toBeDefined();
      expect(found?.title).toBe('Find this PR');
    });

    it('should merge a PR', async () => {
      const pr = await prModel.create({
        repoId: testRepo.id,
        title: 'Merge me',
        sourceBranch: 'feature',
        targetBranch: 'main',
        headSha: 'abc123',
        baseSha: '000000',
        authorId: testUser.id,
      });

      const merged = await prModel.merge(pr.id, testUser.id, 'merged123');
      expect(merged?.state).toBe('merged');
      expect(merged?.mergeSha).toBe('merged123');
      expect(merged?.mergedById).toBe(testUser.id);
      expect(merged?.mergedAt).toBeDefined();
    });

    it('should close and reopen a PR', async () => {
      const pr = await prModel.create({
        repoId: testRepo.id,
        title: 'Close me',
        sourceBranch: 'feature',
        targetBranch: 'main',
        headSha: 'abc123',
        baseSha: '000000',
        authorId: testUser.id,
      });

      const closed = await prModel.close(pr.id);
      expect(closed?.state).toBe('closed');
      expect(closed?.closedAt).toBeDefined();

      const reopened = await prModel.reopen(pr.id);
      expect(reopened?.state).toBe('open');
      expect(reopened?.closedAt).toBeNull();
    });
  });

  describe('Issue Model', () => {
    let testUser: Awaited<ReturnType<typeof userModel.create>>;
    let testRepo: Awaited<ReturnType<typeof repoModel.create>>;

    beforeEach(async () => {
      testUser = await userModel.create({
        username: 'issueuser',
        email: 'issue@example.com',
      });

      testRepo = await repoModel.create({
        ownerId: testUser.id,
        ownerType: 'user',
        name: 'issue-repo',
        diskPath: '/repos/issueuser/issue-repo.git',
      });
    });

    it('should create an issue with auto-incremented number', async () => {
      const issue1 = await issueModel.create({
        repoId: testRepo.id,
        title: 'First Issue',
        authorId: testUser.id,
      });

      expect(issue1.number).toBe(1);

      const issue2 = await issueModel.create({
        repoId: testRepo.id,
        title: 'Second Issue',
        authorId: testUser.id,
      });

      expect(issue2.number).toBe(2);
    });

    it('should close and reopen an issue', async () => {
      const issue = await issueModel.create({
        repoId: testRepo.id,
        title: 'Close me',
        authorId: testUser.id,
      });

      const closed = await issueModel.close(issue.id, testUser.id);
      expect(closed?.state).toBe('closed');
      expect(closed?.closedById).toBe(testUser.id);

      const reopened = await issueModel.reopen(issue.id);
      expect(reopened?.state).toBe('open');
      expect(reopened?.closedById).toBeNull();
    });

    it('should assign and unassign an issue', async () => {
      const assignee = await userModel.create({
        username: 'assignee',
        email: 'assignee@example.com',
      });

      const issue = await issueModel.create({
        repoId: testRepo.id,
        title: 'Assign me',
        authorId: testUser.id,
      });

      const assigned = await issueModel.assign(issue.id, assignee.id);
      expect(assigned?.assigneeId).toBe(assignee.id);

      const unassigned = await issueModel.unassign(issue.id);
      expect(unassigned?.assigneeId).toBeNull();
    });
  });

  describe('Label Model', () => {
    let testUser: Awaited<ReturnType<typeof userModel.create>>;
    let testRepo: Awaited<ReturnType<typeof repoModel.create>>;

    beforeEach(async () => {
      testUser = await userModel.create({
        username: 'labeluser',
        email: 'label@example.com',
      });

      testRepo = await repoModel.create({
        ownerId: testUser.id,
        ownerType: 'user',
        name: 'label-repo',
        diskPath: '/repos/labeluser/label-repo.git',
      });
    });

    it('should create a label', async () => {
      const label = await labelModel.create({
        repoId: testRepo.id,
        name: 'bug',
        color: 'd73a4a',
        description: 'Something is broken',
      });

      expect(label.name).toBe('bug');
      expect(label.color).toBe('d73a4a');
    });

    it('should create default labels', async () => {
      const labels = await labelModel.createDefaults(testRepo.id);
      expect(labels.length).toBeGreaterThan(0);
      
      const labelNames = labels.map((l) => l.name);
      expect(labelNames).toContain('bug');
      expect(labelNames).toContain('enhancement');
    });

    it('should add labels to an issue', async () => {
      const label = await labelModel.create({
        repoId: testRepo.id,
        name: 'bug',
        color: 'd73a4a',
      });

      const issue = await issueModel.create({
        repoId: testRepo.id,
        title: 'Bug issue',
        authorId: testUser.id,
      });

      await issueLabelModel.add(issue.id, label.id);

      const issueLabels = await issueLabelModel.listByIssue(issue.id);
      expect(issueLabels.length).toBe(1);
      expect(issueLabels[0].name).toBe('bug');
    });
  });

  describe('Organization Model', () => {
    let testUser: Awaited<ReturnType<typeof userModel.create>>;

    beforeEach(async () => {
      testUser = await userModel.create({
        username: 'orgcreator',
        email: 'org@example.com',
      });
    });

    it('should create an organization with creator as owner', async () => {
      const org = await orgModel.create(
        {
          name: 'testorg',
          displayName: 'Test Organization',
        },
        testUser.id
      );

      expect(org.name).toBe('testorg');

      const members = await orgMemberModel.listByOrg(org.id);
      expect(members.length).toBe(1);
      expect(members[0].role).toBe('owner');
      expect(members[0].userId).toBe(testUser.id);
    });

    it('should check org membership', async () => {
      const org = await orgModel.create(
        {
          name: 'memberorg',
          displayName: 'Member Org',
        },
        testUser.id
      );

      const isMember = await orgMemberModel.isMember(org.id, testUser.id);
      expect(isMember).toBe(true);

      const hasOwnerRole = await orgMemberModel.hasRole(org.id, testUser.id, 'owner');
      expect(hasOwnerRole).toBe(true);
    });
  });

  describe('Activity Model', () => {
    let testUser: Awaited<ReturnType<typeof userModel.create>>;
    let testRepo: Awaited<ReturnType<typeof repoModel.create>>;

    beforeEach(async () => {
      testUser = await userModel.create({
        username: 'activityuser',
        email: 'activity@example.com',
      });

      testRepo = await repoModel.create({
        ownerId: testUser.id,
        ownerType: 'user',
        name: 'activity-repo',
        diskPath: '/repos/activityuser/activity-repo.git',
      });
    });

    it('should log a push activity', async () => {
      const activity = await activityHelpers.logPush(
        testUser.id,
        testRepo.id,
        'main',
        [{ sha: 'abc123', message: 'Initial commit' }]
      );

      expect(activity.type).toBe('push');

      const payload = activityModel.parsePayload(activity);
      expect(payload?.branch).toBe('main');
      expect(payload?.commits?.length).toBe(1);
    });

    it('should list activities by repo', async () => {
      await activityHelpers.logPush(testUser.id, testRepo.id, 'main', []);
      await activityHelpers.logIssueOpened(testUser.id, testRepo.id, 1, 'Test Issue');

      const activities = await activityModel.listByRepo(testRepo.id);
      expect(activities.length).toBe(2);
    });
  });

  describe('Webhook Model', () => {
    let testUser: Awaited<ReturnType<typeof userModel.create>>;
    let testRepo: Awaited<ReturnType<typeof repoModel.create>>;

    beforeEach(async () => {
      testUser = await userModel.create({
        username: 'webhookuser',
        email: 'webhook@example.com',
      });

      testRepo = await repoModel.create({
        ownerId: testUser.id,
        ownerType: 'user',
        name: 'webhook-repo',
        diskPath: '/repos/webhookuser/webhook-repo.git',
      });
    });

    it('should create a webhook', async () => {
      const webhook = await webhookModel.create({
        repoId: testRepo.id,
        url: 'https://example.com/webhook',
        events: ['push', 'pull_request'],
        secret: 'my-secret',
      });

      expect(webhook.url).toBe('https://example.com/webhook');
      expect(webhook.isActive).toBe(true);

      const events = webhookModel.parseEvents(webhook);
      expect(events).toContain('push');
      expect(events).toContain('pull_request');
    });

    it('should list webhooks by event', async () => {
      await webhookModel.create({
        repoId: testRepo.id,
        url: 'https://example.com/webhook1',
        events: ['push'],
      });

      await webhookModel.create({
        repoId: testRepo.id,
        url: 'https://example.com/webhook2',
        events: ['issue'],
      });

      const pushHooks = await webhookModel.listByEvent(testRepo.id, 'push');
      expect(pushHooks.length).toBe(1);
      expect(pushHooks[0].url).toBe('https://example.com/webhook1');
    });

    it('should enable and disable a webhook', async () => {
      const webhook = await webhookModel.create({
        repoId: testRepo.id,
        url: 'https://example.com/webhook',
        events: ['push'],
      });

      const disabled = await webhookModel.disable(webhook.id);
      expect(disabled?.isActive).toBe(false);

      const enabled = await webhookModel.enable(webhook.id);
      expect(enabled?.isActive).toBe(true);
    });
  });
});
