# Linear Clone Implementation - Task Breakdown

This document contains atomic, parallelizable tasks for implementing Linear-style issue tracking in wit. Each task is self-contained and can be assigned to a coding agent.

---

## Phase 1: Core Issue Enhancements (Foundation)

### 1.1 Priority Field
**Files:** `src/db/schema.ts`, `src/db/models/issue.ts`, `src/api/trpc/routers/issues.ts`, `src/commands/issue.ts`

#### Task 1.1.1: Add Priority Enum and Column to Schema
```
Location: src/db/schema.ts
Action: 
1. Add new enum: export const issuePriorityEnum = pgEnum('issue_priority', ['none', 'low', 'medium', 'high', 'urgent']);
2. Add priority column to issues table: priority: issuePriorityEnum('priority').notNull().default('none')
3. Export IssuePriority type
```

#### Task 1.1.2: Add Priority to Issue Model
```
Location: src/db/models/issue.ts
Action:
1. Export ISSUE_PRIORITIES array: ['none', 'low', 'medium', 'high', 'urgent']
2. Update create() to accept priority
3. Add updatePriority(id, priority) method
4. Update listByRepo to support priority filtering
5. Add listByPriority(repoId, priority) method
```

#### Task 1.1.3: Add Priority to Issues API
```
Location: src/api/trpc/routers/issues.ts
Action:
1. Update create mutation to accept priority field
2. Update update mutation to accept priority field
3. Add updatePriority mutation
4. Update list query to support priority filter
5. Add priorities query that returns available priority values
```

#### Task 1.1.4: Add Priority to Issue CLI
```
Location: src/commands/issue.ts
Action:
1. Add --priority / -p flag to 'issue create' command
2. Add --priority filter to 'issue list' command
3. Add 'issue priority <number> <priority>' subcommand
4. Display priority in 'issue view' output with colored indicators
```

---

### 1.2 Due Dates
**Files:** `src/db/schema.ts`, `src/db/models/issue.ts`, `src/api/trpc/routers/issues.ts`, `src/commands/issue.ts`

#### Task 1.2.1: Add Due Date Column to Schema
```
Location: src/db/schema.ts
Action:
1. Add to issues table: dueDate: timestamp('due_date', { withTimezone: true })
```

#### Task 1.2.2: Add Due Date to Issue Model
```
Location: src/db/models/issue.ts
Action:
1. Update create() to accept dueDate
2. Add setDueDate(id, dueDate) method
3. Add clearDueDate(id) method
4. Add listOverdue(repoId) method - issues where dueDate < now and state = 'open'
5. Add listDueSoon(repoId, days) method - issues due within N days
6. Update listByRepo to support dueDate sorting and filtering
```

#### Task 1.2.3: Add Due Date to Issues API
```
Location: src/api/trpc/routers/issues.ts
Action:
1. Update create mutation to accept dueDate
2. Update update mutation to accept dueDate
3. Add setDueDate mutation
4. Add clearDueDate mutation
5. Add listOverdue query
6. Add listDueSoon query
7. Update list query to support dueDate filter (before/after/overdue)
```

#### Task 1.2.4: Add Due Date to Issue CLI
```
Location: src/commands/issue.ts
Action:
1. Add --due / -d flag to 'issue create' (accepts date string)
2. Add 'issue due <number> <date>' subcommand
3. Add 'issue due <number> --clear' to remove due date
4. Add --overdue flag to 'issue list'
5. Display due date in 'issue view' with overdue highlighting (red if past)
```

---

### 1.3 Estimates
**Files:** `src/db/schema.ts`, `src/db/models/issue.ts`, `src/api/trpc/routers/issues.ts`, `src/commands/issue.ts`

#### Task 1.3.1: Add Estimate Column to Schema
```
Location: src/db/schema.ts
Action:
1. Add to issues table: estimate: integer('estimate') // Story points or hours
```

#### Task 1.3.2: Add Estimate to Issue Model
```
Location: src/db/models/issue.ts
Action:
1. Update create() to accept estimate
2. Add setEstimate(id, estimate) method
3. Add clearEstimate(id) method
4. Add getTotalEstimate(repoId, filters) - sum of estimates for filtered issues
```

#### Task 1.3.3: Add Estimate to Issues API
```
Location: src/api/trpc/routers/issues.ts
Action:
1. Update create mutation to accept estimate
2. Update update mutation to accept estimate
3. Add setEstimate mutation
4. Add getTotalEstimate query
```

#### Task 1.3.4: Add Estimate to Issue CLI
```
Location: src/commands/issue.ts
Action:
1. Add --estimate / -e flag to 'issue create'
2. Add 'issue estimate <number> <points>' subcommand
3. Display estimate in 'issue view' output
```

---

## Phase 2: Issue Relations & Hierarchy

### 2.1 Issue Relations (Blocking/Related/Duplicate)
**Files:** `src/db/schema.ts`, `src/db/models/issue-relations.ts` (new), `src/api/trpc/routers/issues.ts`, `src/commands/issue.ts`

#### Task 2.1.1: Create Issue Relations Schema
```
Location: src/db/schema.ts
Action:
1. Add enum: export const issueRelationTypeEnum = pgEnum('issue_relation_type', ['blocks', 'blocked_by', 'relates_to', 'duplicates', 'duplicated_by']);
2. Add table:
   export const issueRelations = pgTable('issue_relations', {
     id: uuid('id').primaryKey().defaultRandom(),
     issueId: uuid('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
     relatedIssueId: uuid('related_issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
     type: issueRelationTypeEnum('type').notNull(),
     createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
     createdById: text('created_by_id').notNull(),
   }, (table) => ({
     uniqueRelation: unique().on(table.issueId, table.relatedIssueId, table.type),
   }));
```

#### Task 2.1.2: Create Issue Relations Model
```
Location: src/db/models/issue-relations.ts (NEW FILE)
Action:
1. Create issueRelationModel with methods:
   - addRelation(issueId, relatedIssueId, type, createdById) - creates bidirectional relation
   - removeRelation(issueId, relatedIssueId, type)
   - getRelations(issueId) - returns all relations grouped by type
   - getBlocking(issueId) - issues this issue blocks
   - getBlockedBy(issueId) - issues blocking this issue
   - getRelated(issueId) - related issues
   - getDuplicates(issueId) - duplicate issues
   - isBlocked(issueId) - returns true if any open issue blocks this
   - markAsDuplicate(issueId, canonicalIssueId, userId) - marks as duplicate and closes
```

#### Task 2.1.3: Add Issue Relations to API
```
Location: src/api/trpc/routers/issues.ts
Action:
1. Add addRelation mutation (issueId, relatedIssueId, type)
2. Add removeRelation mutation
3. Add getRelations query
4. Add markAsDuplicate mutation (closes issue and creates relation)
5. Update get/getById to include relations
```

#### Task 2.1.4: Add Issue Relations to CLI
```
Location: src/commands/issue.ts
Action:
1. Add 'issue block <number> <blocked-number>' - mark issue as blocking another
2. Add 'issue unblock <number> <blocked-number>'
3. Add 'issue relate <number> <related-number>'
4. Add 'issue unrelate <number> <related-number>'
5. Add 'issue duplicate <number> <canonical-number>' - mark as duplicate and close
6. Display relations in 'issue view' output
```

---

### 2.2 Parent/Sub-Issues
**Files:** `src/db/schema.ts`, `src/db/models/issue.ts`, `src/api/trpc/routers/issues.ts`, `src/commands/issue.ts`

#### Task 2.2.1: Add Parent Issue Column to Schema
```
Location: src/db/schema.ts
Action:
1. Add to issues table: parentId: uuid('parent_id').references(() => issues.id, { onDelete: 'set null' })
2. Add index on parentId for performance
```

#### Task 2.2.2: Add Parent/Sub-Issue Methods to Model
```
Location: src/db/models/issue.ts
Action:
1. Add setParent(issueId, parentId) method
2. Add removeParent(issueId) method
3. Add getSubIssues(parentId) method
4. Add getParent(issueId) method
5. Add getSubIssueCount(parentId) method
6. Add getSubIssueProgress(parentId) - returns {total, completed, percentage}
7. Add autoCloseParent(parentId) - closes parent if all sub-issues done (configurable)
8. Update close() to optionally close all sub-issues
```

#### Task 2.2.3: Add Parent/Sub-Issues to API
```
Location: src/api/trpc/routers/issues.ts
Action:
1. Add setParent mutation
2. Add removeParent mutation
3. Add getSubIssues query
4. Add createSubIssue mutation (creates issue with parentId set)
5. Update get/getById to include parent and sub-issue info
6. Add getSubIssueProgress query
7. Update list to support filtering by hasParent/hasSubIssues
```

#### Task 2.2.4: Add Parent/Sub-Issues to CLI
```
Location: src/commands/issue.ts
Action:
1. Add --parent / -P flag to 'issue create' 
2. Add 'issue sub <parent-number>' to create sub-issue interactively
3. Add 'issue parent <number> <parent-number>' to set parent
4. Add 'issue parent <number> --remove' to remove parent
5. Add 'issue subs <number>' to list sub-issues
6. Display parent/sub-issue info in 'issue view'
7. Add --subs flag to 'issue list' to show sub-issues inline
```

---

## Phase 3: Projects (Expand Milestones)

### 3.1 Projects Table
**Files:** `src/db/schema.ts`, `src/db/models/project.ts` (new)

#### Task 3.1.1: Create Projects Schema
```
Location: src/db/schema.ts
Action:
1. Add enum: export const projectStatusEnum = pgEnum('project_status', ['backlog', 'planned', 'in_progress', 'paused', 'completed', 'canceled']);
2. Add table:
   export const projects = pgTable('projects', {
     id: uuid('id').primaryKey().defaultRandom(),
     repoId: uuid('repo_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
     name: text('name').notNull(),
     description: text('description'),
     icon: text('icon'), // emoji or icon identifier
     color: text('color').default('888888'),
     status: projectStatusEnum('status').notNull().default('backlog'),
     leadId: text('lead_id'), // project lead user
     startDate: timestamp('start_date', { withTimezone: true }),
     targetDate: timestamp('target_date', { withTimezone: true }),
     completedAt: timestamp('completed_at', { withTimezone: true }),
     createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
     updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
   });
3. Add project members junction table:
   export const projectMembers = pgTable('project_members', {
     projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
     userId: text('user_id').notNull(),
     role: text('role').default('member'), // 'lead', 'member'
     createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
   }, (table) => ({
     pk: primaryKey({ columns: [table.projectId, table.userId] }),
   }));
4. Add projectId column to issues table: projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' })
```

#### Task 3.1.2: Create Project Model
```
Location: src/db/models/project.ts (NEW FILE)
Action:
Create projectModel with methods:
1. findById(id)
2. findByRepoAndName(repoId, name)
3. create(data)
4. update(id, data)
5. delete(id)
6. listByRepo(repoId, options) - with status filter
7. getProgress(id) - {totalIssues, completedIssues, percentage}
8. setLead(id, userId)
9. addMember(id, userId, role)
10. removeMember(id, userId)
11. getMembers(id)
12. complete(id) - sets completedAt and status
13. getIssues(id, options) - issues in this project
14. addIssue(issueId, projectId)
15. removeIssue(issueId)
```

#### Task 3.1.3: Create Projects API Router
```
Location: src/api/trpc/routers/projects.ts (NEW FILE)
Action:
Create projectsRouter with:
1. list query
2. get query (by id)
3. getByName query
4. create mutation
5. update mutation
6. delete mutation
7. setLead mutation
8. addMember mutation
9. removeMember mutation
10. getMembers query
11. getProgress query
12. getIssues query
13. addIssue mutation
14. removeIssue mutation
15. complete mutation
16. listStatuses query
```

#### Task 3.1.4: Register Projects Router
```
Location: src/api/trpc/index.ts (or router index)
Action:
1. Import projectsRouter
2. Add to appRouter: projects: projectsRouter
```

#### Task 3.1.5: Create Projects CLI Command
```
Location: src/commands/project.ts (NEW FILE)
Action:
Create 'wit project' command with subcommands:
1. project create <name> [--description] [--lead] [--start] [--target]
2. project list [--status]
3. project view <name-or-id>
4. project update <name-or-id> [--name] [--description] [--status]
5. project delete <name-or-id>
6. project issues <name-or-id> [--status]
7. project progress <name-or-id>
8. project complete <name-or-id>
```

#### Task 3.1.6: Register Project Command
```
Location: src/cli.ts
Action:
1. Import project command
2. Register with CLI
```

---

### 3.2 Project Updates/Check-ins
**Files:** `src/db/schema.ts`, `src/db/models/project-updates.ts` (new)

#### Task 3.2.1: Create Project Updates Schema
```
Location: src/db/schema.ts
Action:
1. Add enum: export const projectHealthEnum = pgEnum('project_health', ['on_track', 'at_risk', 'off_track']);
2. Add table:
   export const projectUpdates = pgTable('project_updates', {
     id: uuid('id').primaryKey().defaultRandom(),
     projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
     authorId: text('author_id').notNull(),
     body: text('body').notNull(),
     health: projectHealthEnum('health'),
     createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
     updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
   });
```

#### Task 3.2.2: Create Project Updates Model
```
Location: src/db/models/project-updates.ts (NEW FILE)
Action:
1. findById(id)
2. create(data)
3. update(id, data)
4. delete(id)
5. listByProject(projectId, limit)
6. getLatest(projectId)
```

#### Task 3.2.3: Add Project Updates to API
```
Location: src/api/trpc/routers/projects.ts
Action:
1. Add createUpdate mutation
2. Add updateUpdate mutation
3. Add deleteUpdate mutation
4. Add listUpdates query
5. Add getLatestUpdate query
```

---

## Phase 4: Cycles/Sprints

### 4.1 Cycles Table
**Files:** `src/db/schema.ts`, `src/db/models/cycle.ts` (new)

#### Task 4.1.1: Create Cycles Schema
```
Location: src/db/schema.ts
Action:
1. Add table:
   export const cycles = pgTable('cycles', {
     id: uuid('id').primaryKey().defaultRandom(),
     repoId: uuid('repo_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
     name: text('name').notNull(), // "Sprint 1", "Cycle 23", etc.
     number: integer('number').notNull(), // Auto-incrementing per repo
     description: text('description'),
     startDate: timestamp('start_date', { withTimezone: true }).notNull(),
     endDate: timestamp('end_date', { withTimezone: true }).notNull(),
     createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
     updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
   });
2. Add cycleId to issues table: cycleId: uuid('cycle_id').references(() => cycles.id, { onDelete: 'set null' })
```

#### Task 4.1.2: Create Cycle Model
```
Location: src/db/models/cycle.ts (NEW FILE)
Action:
Create cycleModel with methods:
1. findById(id)
2. findByNumber(repoId, number)
3. create(data) - auto-increment number
4. update(id, data)
5. delete(id)
6. listByRepo(repoId, options) - past/current/upcoming filter
7. getCurrent(repoId) - cycle where now is between start and end
8. getUpcoming(repoId) - next cycle after current
9. getProgress(id) - {totalIssues, completedIssues, scopeChange, burndown}
10. getIssues(id, options)
11. addIssue(cycleId, issueId)
12. removeIssue(issueId)
13. getVelocity(repoId, cycleCount) - avg completed points over last N cycles
14. getUnfinishedIssues(id) - open issues when cycle ends
```

#### Task 4.1.3: Create Cycles API Router
```
Location: src/api/trpc/routers/cycles.ts (NEW FILE)
Action:
Create cyclesRouter with:
1. list query
2. get query
3. getCurrent query
4. getUpcoming query
5. create mutation
6. update mutation
7. delete mutation
8. getProgress query
9. getIssues query
10. addIssue mutation
11. removeIssue mutation
12. getVelocity query
```

#### Task 4.1.4: Register Cycles Router
```
Location: src/api/trpc/index.ts
Action:
1. Import cyclesRouter
2. Add to appRouter
```

#### Task 4.1.5: Create Cycles CLI Command
```
Location: src/commands/cycle.ts (NEW FILE)
Action:
Create 'wit cycle' command:
1. cycle create <name> --start <date> --end <date>
2. cycle list [--past] [--current] [--upcoming]
3. cycle view <number>
4. cycle current
5. cycle progress [number]
6. cycle issues [number]
7. cycle add <issue-number> [cycle-number] - defaults to current
8. cycle remove <issue-number>
9. cycle velocity [--cycles N]
```

#### Task 4.1.6: Register Cycle Command
```
Location: src/cli.ts
Action:
1. Import cycle command
2. Register with CLI
```

---

## Phase 5: Triage & Workflows

### 5.1 Triage Status
**Files:** `src/db/schema.ts`, `src/db/models/issue.ts`, `src/api/trpc/routers/issues.ts`

#### Task 5.1.1: Add Triage to Status Enum
```
Location: src/db/schema.ts
Action:
1. Update issueStatusEnum to add 'triage' as first option:
   export const issueStatusEnum = pgEnum('issue_status', [
     'triage',
     'backlog',
     'todo', 
     'in_progress',
     'in_review',
     'done',
     'canceled',
   ]);
```

#### Task 5.1.2: Update Issue Model for Triage
```
Location: src/db/models/issue.ts
Action:
1. Update ISSUE_STATUSES to include 'triage'
2. Add listTriage(repoId) method
3. Add triageToBacklog(issueId) method
4. Add triageToDone(issueId, reason) method - for rejecting triage items
```

#### Task 5.1.3: Add Triage API Endpoints
```
Location: src/api/trpc/routers/issues.ts
Action:
1. Add listTriage query
2. Add acceptTriage mutation (moves to backlog/todo)
3. Add rejectTriage mutation (moves to canceled with reason)
```

#### Task 5.1.4: Add Triage CLI Commands
```
Location: src/commands/issue.ts
Action:
1. Add 'issue triage' to list triage items
2. Add 'issue accept <number>' to move from triage to backlog
3. Add 'issue reject <number> [reason]' to reject triage item
```

---

### 5.2 Custom Workflows (Per-Repo Status Configuration)
**Files:** `src/db/schema.ts`, `src/db/models/workflow.ts` (new)

#### Task 5.2.1: Create Workflow Statuses Schema
```
Location: src/db/schema.ts
Action:
1. Add table for custom statuses:
   export const workflowStatuses = pgTable('workflow_statuses', {
     id: uuid('id').primaryKey().defaultRandom(),
     repoId: uuid('repo_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
     name: text('name').notNull(),
     color: text('color').notNull().default('888888'),
     category: text('category').notNull(), // 'triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled'
     position: integer('position').notNull(), // order within category
     isDefault: boolean('is_default').notNull().default(false),
     createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
   }, (table) => ({
     uniqueName: unique().on(table.repoId, table.name),
   }));
```

#### Task 5.2.2: Create Workflow Model
```
Location: src/db/models/workflow.ts (NEW FILE)
Action:
Create workflowModel with methods:
1. getStatuses(repoId)
2. createStatus(repoId, data)
3. updateStatus(id, data)
4. deleteStatus(id)
5. reorderStatus(id, newPosition)
6. setDefaultStatus(repoId, statusId)
7. getDefaultStatus(repoId)
8. initializeDefaults(repoId) - creates default workflow statuses
```

---

## Phase 6: Issue Templates

### 6.1 Issue Templates
**Files:** `src/db/schema.ts`, `src/db/models/issue-template.ts` (new)

#### Task 6.1.1: Create Issue Templates Schema
```
Location: src/db/schema.ts
Action:
1. Add table:
   export const issueTemplates = pgTable('issue_templates', {
     id: uuid('id').primaryKey().defaultRandom(),
     repoId: uuid('repo_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
     name: text('name').notNull(),
     description: text('description'),
     titleTemplate: text('title_template'),
     bodyTemplate: text('body_template'),
     defaultLabels: text('default_labels'), // JSON array of label IDs
     defaultAssigneeId: text('default_assignee_id'),
     defaultPriority: text('default_priority'),
     createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
     updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
   });
```

#### Task 6.1.2: Create Issue Template Model
```
Location: src/db/models/issue-template.ts (NEW FILE)
Action:
1. findById(id)
2. findByName(repoId, name)
3. create(data)
4. update(id, data)
5. delete(id)
6. listByRepo(repoId)
7. applyTemplate(templateId, issueData) - merges template with provided data
```

#### Task 6.1.3: Add Issue Templates to API
```
Location: src/api/trpc/routers/issues.ts
Action:
1. Add listTemplates query
2. Add getTemplate query
3. Add createTemplate mutation
4. Add updateTemplate mutation
5. Add deleteTemplate mutation
6. Update create mutation to accept templateId
```

#### Task 6.1.4: Add Issue Templates to CLI
```
Location: src/commands/issue.ts
Action:
1. Add 'issue template list'
2. Add 'issue template create <name>'
3. Add 'issue template view <name>'
4. Add 'issue template delete <name>'
5. Add --template / -T flag to 'issue create'
```

---

## Phase 7: Views & Filters

### 7.1 Saved Views
**Files:** `src/db/schema.ts`, `src/db/models/view.ts` (new)

#### Task 7.1.1: Create Views Schema
```
Location: src/db/schema.ts
Action:
1. Add table:
   export const issueViews = pgTable('issue_views', {
     id: uuid('id').primaryKey().defaultRandom(),
     repoId: uuid('repo_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
     creatorId: text('creator_id').notNull(),
     name: text('name').notNull(),
     description: text('description'),
     filters: text('filters').notNull(), // JSON filter configuration
     displayOptions: text('display_options'), // JSON: groupBy, sortBy, viewType (list/board)
     isShared: boolean('is_shared').notNull().default(false),
     createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
     updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
   });
```

#### Task 7.1.2: Create Views Model
```
Location: src/db/models/view.ts (NEW FILE)
Action:
1. findById(id)
2. create(data)
3. update(id, data)
4. delete(id)
5. listByRepo(repoId, userId) - shared views + user's private views
6. listByUser(userId, repoId)
7. share(id) / unshare(id)
8. duplicate(id, userId)
```

#### Task 7.1.3: Add Views to API
```
Location: src/api/trpc/routers/issues.ts
Action:
1. Add listViews query
2. Add getView query
3. Add createView mutation
4. Add updateView mutation
5. Add deleteView mutation
6. Add shareView mutation
7. Add executeView query - applies view filters and returns issues
```

---

## Phase 8: Activity & History

### 8.1 Issue Activity Log
**Files:** `src/db/schema.ts`, `src/db/models/issue-activity.ts` (new)

#### Task 8.1.1: Create Issue Activity Schema
```
Location: src/db/schema.ts
Action:
1. Add table:
   export const issueActivities = pgTable('issue_activities', {
     id: uuid('id').primaryKey().defaultRandom(),
     issueId: uuid('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
     actorId: text('actor_id').notNull(),
     action: text('action').notNull(), // 'created', 'updated', 'status_changed', 'assigned', 'labeled', etc.
     field: text('field'), // which field changed
     oldValue: text('old_value'),
     newValue: text('new_value'),
     metadata: text('metadata'), // JSON for additional context
     createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
   });
2. Add index on issueId and createdAt
```

#### Task 8.1.2: Create Issue Activity Model
```
Location: src/db/models/issue-activity.ts (NEW FILE)
Action:
1. log(data) - create activity entry
2. listByIssue(issueId, limit, offset)
3. listByRepo(repoId, limit, offset)
4. listByActor(actorId, limit, offset)
5. Helper functions to log specific actions:
   - logCreated(issueId, actorId)
   - logStatusChanged(issueId, actorId, oldStatus, newStatus)
   - logAssigned(issueId, actorId, assigneeId)
   - logUnassigned(issueId, actorId, previousAssigneeId)
   - logLabelAdded(issueId, actorId, labelId)
   - logLabelRemoved(issueId, actorId, labelId)
   - logPriorityChanged(issueId, actorId, oldPriority, newPriority)
   - logEstimateChanged(issueId, actorId, oldEstimate, newEstimate)
   - logParentSet(issueId, actorId, parentId)
   - logProjectChanged(issueId, actorId, oldProjectId, newProjectId)
   - logCycleChanged(issueId, actorId, oldCycleId, newCycleId)
```

#### Task 8.1.3: Integrate Activity Logging
```
Location: src/db/models/issue.ts
Action:
1. Update all mutation methods to call activity logging
2. Import issueActivityModel
3. After each create/update/close/assign/etc, log the activity
```

#### Task 8.1.4: Add Activity to API
```
Location: src/api/trpc/routers/issues.ts
Action:
1. Add getActivity query
2. Add getRepoActivity query
```

#### Task 8.1.5: Add Activity to CLI
```
Location: src/commands/issue.ts
Action:
1. Add 'issue activity <number>' to show issue history
2. Add 'issue activity' (no number) to show recent repo activity
```

---

## Phase 9: UI Enhancements

### 9.1 Update Issue Board UI
**Files:** `src/ui/issue-board.ts`

#### Task 9.1.1: Add Priority Indicators to Board
```
Location: src/ui/issue-board.ts
Action:
1. Add priority color indicators (urgent=red, high=orange, medium=yellow, low=blue, none=gray)
2. Add priority icon/badge to issue cards
3. Add priority column to list view
4. Add priority filter dropdown
```

#### Task 9.1.2: Add Due Date Display to Board
```
Location: src/ui/issue-board.ts
Action:
1. Show due date on issue cards
2. Highlight overdue issues in red
3. Add "due soon" indicator (yellow) for issues due within 3 days
4. Add due date filter (overdue, due today, due this week)
```

#### Task 9.1.3: Add Sub-Issue Indicators to Board
```
Location: src/ui/issue-board.ts
Action:
1. Show sub-issue count on parent issue cards
2. Show progress bar for parent issues (X of Y complete)
3. Add expand/collapse for sub-issues in list view
4. Indent sub-issues under parents
```

#### Task 9.1.4: Add Relations Display to Board
```
Location: src/ui/issue-board.ts
Action:
1. Show blocking/blocked indicator on cards
2. Show "blocked" badge on blocked issues
3. Add relations section to issue detail panel
4. Allow adding/removing relations from UI
```

#### Task 9.1.5: Add Project/Cycle Display to Board
```
Location: src/ui/issue-board.ts
Action:
1. Add project badge/indicator on cards
2. Add cycle indicator on cards
3. Add project filter dropdown
4. Add cycle filter dropdown
5. Add project progress in sidebar
```

---

## Phase 10: Database Migrations

### 10.1 Create Migration Files

#### Task 10.1.1: Create Phase 1 Migration
```
Location: drizzle/migrations/ (or migrations folder)
Action:
Create migration for:
1. Add issue_priority enum
2. Add priority column to issues
3. Add due_date column to issues
4. Add estimate column to issues
```

#### Task 10.1.2: Create Phase 2 Migration
```
Action:
Create migration for:
1. Add issue_relation_type enum
2. Create issue_relations table
3. Add parent_id column to issues
```

#### Task 10.1.3: Create Phase 3 Migration
```
Action:
Create migration for:
1. Add project_status enum
2. Create projects table
3. Create project_members table
4. Add project_id column to issues
5. Add project_health enum
6. Create project_updates table
```

#### Task 10.1.4: Create Phase 4 Migration
```
Action:
Create migration for:
1. Create cycles table
2. Add cycle_id column to issues
```

#### Task 10.1.5: Create Phase 5 Migration
```
Action:
Create migration for:
1. Update issue_status enum to add 'triage'
2. Create workflow_statuses table
```

#### Task 10.1.6: Create Phase 6 Migration
```
Action:
Create migration for:
1. Create issue_templates table
```

#### Task 10.1.7: Create Phase 7 Migration
```
Action:
Create migration for:
1. Create issue_views table
```

#### Task 10.1.8: Create Phase 8 Migration
```
Action:
Create migration for:
1. Create issue_activities table
```

---

## Phase 11: Tests

### 11.1 Unit Tests

#### Task 11.1.1: Priority Tests
```
Location: src/__tests__/issue-priority.test.ts (NEW FILE)
Action:
Test priority CRUD, filtering, validation
```

#### Task 11.1.2: Due Date Tests
```
Location: src/__tests__/issue-due-date.test.ts (NEW FILE)
Action:
Test due date CRUD, overdue detection, filtering
```

#### Task 11.1.3: Issue Relations Tests
```
Location: src/__tests__/issue-relations.test.ts (NEW FILE)
Action:
Test blocking, related, duplicate relations
```

#### Task 11.1.4: Sub-Issues Tests
```
Location: src/__tests__/issue-sub-issues.test.ts (NEW FILE)
Action:
Test parent/child relationships, progress calculation
```

#### Task 11.1.5: Projects Tests
```
Location: src/__tests__/projects.test.ts (NEW FILE)
Action:
Test project CRUD, members, progress
```

#### Task 11.1.6: Cycles Tests
```
Location: src/__tests__/cycles.test.ts (NEW FILE)
Action:
Test cycle CRUD, velocity, issue assignment
```

---

## Dependency Graph

```
Phase 1 (Foundation) - No dependencies, can all run in parallel
├── 1.1 Priority
├── 1.2 Due Dates  
├── 1.3 Estimates

Phase 2 (Relations) - Depends on Phase 1 schema being stable
├── 2.1 Issue Relations
├── 2.2 Parent/Sub-Issues

Phase 3 (Projects) - Independent of Phase 2
├── 3.1 Projects Table
├── 3.2 Project Updates (depends on 3.1)

Phase 4 (Cycles) - Independent of Phase 2, 3
├── 4.1 Cycles

Phase 5 (Workflows) - Can run in parallel with 3, 4
├── 5.1 Triage Status
├── 5.2 Custom Workflows

Phase 6 (Templates) - Depends on Phase 1 (priority field)
├── 6.1 Issue Templates

Phase 7 (Views) - Can run in parallel with 6
├── 7.1 Saved Views

Phase 8 (Activity) - Depends on all other model changes
├── 8.1 Issue Activity Log

Phase 9 (UI) - Depends on all API changes
├── 9.1 Board enhancements

Phase 10 (Migrations) - Should be created alongside schema changes
Phase 11 (Tests) - Should be created alongside each feature
```

---

## Task Assignment Strategy

**Parallel Track A (Schema + Models):**
- Agent 1: Tasks 1.1.1, 1.2.1, 1.3.1 (schema additions)
- Agent 2: Tasks 2.1.1, 2.2.1 (relations schema)
- Agent 3: Task 3.1.1 (projects schema)
- Agent 4: Task 4.1.1 (cycles schema)

**Parallel Track B (Models):**
- Agent 5: Tasks 1.1.2, 1.2.2, 1.3.2 (issue model updates)
- Agent 6: Task 2.1.2 (issue relations model)
- Agent 7: Task 3.1.2 (project model)
- Agent 8: Task 4.1.2 (cycle model)

**Parallel Track C (API):**
- Agent 9: Tasks 1.1.3, 1.2.3, 1.3.3 (issue API updates)
- Agent 10: Task 2.1.3 (relations API)
- Agent 11: Task 3.1.3 (projects API)
- Agent 12: Task 4.1.3 (cycles API)

**Parallel Track D (CLI):**
- Agent 13: Tasks 1.1.4, 1.2.4, 1.3.4 (issue CLI updates)
- Agent 14: Task 2.1.4 (relations CLI)
- Agent 15: Task 3.1.5 (projects CLI)
- Agent 16: Task 4.1.5 (cycles CLI)

**Parallel Track E (UI):**
- Agent 17: Tasks 9.1.1-9.1.5 (board enhancements)

**Parallel Track F (Tests):**
- Agent 18: All test tasks (11.1.x)
