import { eq } from 'drizzle-orm';
import { initDatabase, closeDatabase } from './index';
import {
  users,
  organizations,
  orgMembers,
  repositories,
  labels,
  issues,
  pullRequests,
} from './schema';

/**
 * Seed the database with development data
 */
async function seed() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('🌱 Seeding database...');

  const db = initDatabase(databaseUrl);

  try {
    // Create test users
    console.log('Creating users...');
    const [testUser] = await db
      .insert(users)
      .values({
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        bio: 'A test user for development',
        location: 'San Francisco, CA',
        website: 'https://example.com',
      })
      .returning();

    console.log(`  ✓ Created user: ${testUser.username} (${testUser.id})`);

    const [adminUser] = await db
      .insert(users)
      .values({
        username: 'admin',
        email: 'admin@example.com',
        name: 'Admin User',
        bio: 'Platform administrator',
      })
      .returning();

    console.log(`  ✓ Created user: ${adminUser.username} (${adminUser.id})`);

    const [devUser] = await db
      .insert(users)
      .values({
        username: 'developer',
        email: 'dev@example.com',
        name: 'Developer',
        bio: 'Full-stack developer',
      })
      .returning();

    console.log(`  ✓ Created user: ${devUser.username} (${devUser.id})`);

    // Create test organization
    console.log('\nCreating organizations...');
    const [org] = await db
      .insert(organizations)
      .values({
        name: 'acme',
        displayName: 'Acme Corporation',
        description: 'Building the future',
        location: 'New York, NY',
        website: 'https://acme.example.com',
      })
      .returning();

    console.log(`  ✓ Created organization: ${org.name} (${org.id})`);

    // Add members to organization
    await db.insert(orgMembers).values([
      { orgId: org.id, userId: adminUser.id, role: 'owner' },
      { orgId: org.id, userId: testUser.id, role: 'admin' },
      { orgId: org.id, userId: devUser.id, role: 'member' },
    ]);
    console.log('  ✓ Added members to organization');

    // Create test repositories
    console.log('\nCreating repositories...');

    const [userRepo] = await db
      .insert(repositories)
      .values({
        ownerId: testUser.id,
        ownerType: 'user',
        name: 'test-repo',
        description: 'A test repository for development',
        diskPath: '/repos/testuser/test-repo.git',
        isPrivate: false,
        defaultBranch: 'main',
      })
      .returning();

    console.log(`  ✓ Created repository: ${testUser.username}/${userRepo.name} (${userRepo.id})`);

    const [privateRepo] = await db
      .insert(repositories)
      .values({
        ownerId: testUser.id,
        ownerType: 'user',
        name: 'private-project',
        description: 'A private project',
        diskPath: '/repos/testuser/private-project.git',
        isPrivate: true,
        defaultBranch: 'main',
      })
      .returning();

    console.log(`  ✓ Created repository: ${testUser.username}/${privateRepo.name} (${privateRepo.id})`);

    const [orgRepo] = await db
      .insert(repositories)
      .values({
        ownerId: org.id,
        ownerType: 'organization',
        name: 'platform',
        description: 'The main platform repository',
        diskPath: '/repos/acme/platform.git',
        isPrivate: false,
        defaultBranch: 'main',
      })
      .returning();

    console.log(`  ✓ Created repository: ${org.name}/${orgRepo.name} (${orgRepo.id})`);

    // Create default labels
    console.log('\nCreating labels...');
    const defaultLabels = [
      { name: 'bug', color: 'd73a4a', description: "Something isn't working" },
      { name: 'enhancement', color: 'a2eeef', description: 'New feature or request' },
      { name: 'documentation', color: '0075ca', description: 'Improvements or additions to documentation' },
      { name: 'good first issue', color: '7057ff', description: 'Good for newcomers' },
      { name: 'help wanted', color: '008672', description: 'Extra attention is needed' },
      { name: 'question', color: 'd876e3', description: 'Further information is requested' },
      { name: 'wontfix', color: 'ffffff', description: 'This will not be worked on' },
      { name: 'duplicate', color: 'cfd3d7', description: 'This issue or pull request already exists' },
      { name: 'invalid', color: 'e4e669', description: "This doesn't seem right" },
    ];

    const createdLabels = await db
      .insert(labels)
      .values(defaultLabels.map((label) => ({ ...label, repoId: userRepo.id })))
      .returning();

    console.log(`  ✓ Created ${createdLabels.length} labels for ${testUser.username}/${userRepo.name}`);

    // Also create labels for org repo
    await db
      .insert(labels)
      .values(defaultLabels.map((label) => ({ ...label, repoId: orgRepo.id })));
    console.log(`  ✓ Created ${defaultLabels.length} labels for ${org.name}/${orgRepo.name}`);

    // Create sample issues
    console.log('\nCreating issues...');
    const [issue1] = await db
      .insert(issues)
      .values({
        repoId: userRepo.id,
        number: 1,
        title: 'Add README file',
        body: 'We need a proper README file with documentation.',
        state: 'open',
        authorId: testUser.id,
      })
      .returning();

    console.log(`  ✓ Created issue #${issue1.number}: ${issue1.title}`);

    const [issue2] = await db
      .insert(issues)
      .values({
        repoId: userRepo.id,
        number: 2,
        title: 'Bug: Application crashes on startup',
        body: 'The application crashes when trying to start with default configuration.',
        state: 'closed',
        authorId: devUser.id,
        closedAt: new Date(),
        closedById: testUser.id,
      })
      .returning();

    console.log(`  ✓ Created issue #${issue2.number}: ${issue2.title}`);

    // Create sample pull requests
    console.log('\nCreating pull requests...');
    const [pr1] = await db
      .insert(pullRequests)
      .values({
        repoId: userRepo.id,
        number: 1,
        title: 'Add initial project structure',
        body: 'This PR adds the initial project structure with basic configuration.',
        state: 'merged',
        sourceBranch: 'feature/initial-structure',
        targetBranch: 'main',
        headSha: 'abc123def456',
        baseSha: '000000000000',
        mergeSha: 'merged123456',
        authorId: testUser.id,
        mergedAt: new Date(),
        mergedById: adminUser.id,
      })
      .returning();

    console.log(`  ✓ Created PR #${pr1.number}: ${pr1.title}`);

    const [pr2] = await db
      .insert(pullRequests)
      .values({
        repoId: userRepo.id,
        number: 2,
        title: 'Add user authentication',
        body: 'Implements user login and registration functionality.',
        state: 'open',
        sourceBranch: 'feature/auth',
        targetBranch: 'main',
        headSha: 'xyz789abc123',
        baseSha: 'merged123456',
        authorId: devUser.id,
        isDraft: false,
        isMergeable: true,
      })
      .returning();

    console.log(`  ✓ Created PR #${pr2.number}: ${pr2.title}`);

    // Update repository stats
    await db
      .update(repositories)
      .set({
        openIssuesCount: 1,
        openPrsCount: 1,
      })
      .where(eq(repositories.id, userRepo.id));

    console.log('\n✅ Database seeded successfully!');
    console.log('\nCreated:');
    console.log(`  - ${3} users`);
    console.log(`  - ${1} organization`);
    console.log(`  - ${3} repositories`);
    console.log(`  - ${defaultLabels.length * 2} labels`);
    console.log(`  - ${2} issues`);
    console.log(`  - ${2} pull requests`);

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await closeDatabase();
  }
}

// Allow running directly
seed().catch((error) => {
  console.error(error);
  process.exit(1);
});

export { seed };
