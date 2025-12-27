# Table Stakes - API to UI Parity

**Category:** Feature Parity  
**Priority:** Medium-High  
**Owner:** Agent Team

---

## Strategic Context

These features already exist in our API. They work. They just don't have UI.

This is low-hanging fruit. The backend work is done - we just need to expose it. Every feature here brings us closer to being a viable GitHub replacement.

None of these are differentiators. They're table stakes. But you can't play without them.

---

## Current API Coverage

| Feature | API Router | UI Built |
|---------|------------|----------|
| Releases | `releases.ts` | No |
| Branch Protection | `branch-protection.ts` | No |
| Webhooks | `webhooks.ts` | No |
| Collaborators | `repos.ts` (methods exist) | No |
| Milestones | `milestones.ts` | No |
| Organizations | `organizations.ts` | No |
| SSH Keys | `ssh-keys.ts` | No |
| Tokens | `tokens.ts` | No |

---

## Tasks

### TASK-PARITY-001: Releases Management UI

**Priority:** P1  
**Effort:** Medium (6-8 hours)  
**Dependencies:** None

#### Current API

```typescript
// src/api/trpc/routers/releases.ts
releases.create({ repoId, tagName, name, body, isDraft, isPrerelease })
releases.update({ id, name, body, isDraft, isPrerelease })
releases.delete({ id })
releases.publish({ id })  // Publish draft
releases.list({ repoId })
releases.get({ id })
releases.getLatest({ repoId })
releases.getByTag({ repoId, tagName })
```

#### Pages to Create

| Route | Purpose |
|-------|---------|
| `/:owner/:repo/releases` | List all releases |
| `/:owner/:repo/releases/new` | Create release form |
| `/:owner/:repo/releases/tag/:tag` | Release detail |
| `/:owner/:repo/releases/:id/edit` | Edit release |

#### Files to Create

- `apps/web/src/pages/releases/index.tsx` - List page
- `apps/web/src/pages/releases/new.tsx` - Create page
- `apps/web/src/pages/releases/[tag].tsx` - Detail page
- `apps/web/src/components/releases/ReleaseCard.tsx`
- `apps/web/src/components/releases/ReleaseForm.tsx`

#### UI Design

**List Page:**
```
┌─────────────────────────────────────────────────────────────┐
│ Releases                                    [Draft release] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ v2.0.0                                       Latest     │ │
│ │ Major release with breaking changes                     │ │
│ │ @john · Released 2 days ago                             │ │
│ │                                                         │ │
│ │ Assets                                                  │ │
│ │ 📦 wit-linux-x64.tar.gz      12.4 MB    1,234 downloads│ │
│ │ 📦 wit-darwin-x64.tar.gz     11.2 MB      892 downloads│ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ v1.9.0                                    Pre-release   │ │
│ │ Beta release for testing                                │ │
│ │ @jane · Released 1 week ago                             │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Create Form:**
```
┌─────────────────────────────────────────────────────────────┐
│ Create a new release                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Tag version                                                 │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ v2.1.0                                                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│ Choose an existing tag, or create a new one on publish      │
│                                                             │
│ Release title                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Version 2.1.0                                           │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Describe this release                                       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ## What's New                                           │ │
│ │ - Feature A                                             │ │
│ │ - Feature B                                             │ │
│ │                                                         │ │
│ │ ## Bug Fixes                                            │ │
│ │ - Fix #123                                              │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ☐ This is a pre-release                                     │
│ ☐ Save as draft                                             │
│                                                             │
│ Attach binaries (drag and drop)                             │
│ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│   Drop files here or click to upload                        │
│ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
│                                                             │
│                              [Cancel] [Publish release]     │
└─────────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria

- [ ] Can list all releases for a repo
- [ ] Can create release with tag, title, body
- [ ] Can mark as draft/prerelease
- [ ] Can edit existing release
- [ ] Can delete release
- [ ] Can publish draft
- [ ] Release notes render as markdown
- [ ] Download count shown for assets

---

### TASK-PARITY-002: Branch Protection Rules UI

**Priority:** P1  
**Effort:** Medium (5-6 hours)  
**Dependencies:** None

#### Current API

```typescript
// src/api/trpc/routers/branch-protection.ts
branchProtection.create({ repoId, pattern, requirePullRequest, ... })
branchProtection.update({ id, ... })
branchProtection.delete({ id })
branchProtection.list({ repoId })
branchProtection.get({ id })
```

#### Location

Repository Settings → Branches (`/:owner/:repo/settings/branches`)

#### Files to Create

- `apps/web/src/pages/repo/settings/branches.tsx`
- `apps/web/src/components/settings/BranchRuleForm.tsx`
- `apps/web/src/components/settings/BranchRuleCard.tsx`

#### UI Design

```
┌─────────────────────────────────────────────────────────────┐
│ Settings / Branches                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Branch protection rules                    [Add rule]       │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ main                                           [Edit] [×]│ │
│ │ ├ ✓ Require pull request before merging                 │ │
│ │ ├ ✓ Require 2 approving reviews                         │ │
│ │ ├ ✓ Require status checks: ci/build, ci/test            │ │
│ │ ├ ✗ Allow force pushes                                  │ │
│ │ └ ✗ Allow deletions                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ release/*                                      [Edit] [×]│ │
│ │ ├ ✓ Require pull request before merging                 │ │
│ │ ├ ✓ Require 1 approving review                          │ │
│ │ └ ✗ Allow force pushes                                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Add/Edit Rule Form:**
```
┌─────────────────────────────────────────────────────────────┐
│ Add branch protection rule                             [×]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Branch name pattern                                         │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ main                                                    │ │
│ └─────────────────────────────────────────────────────────┘ │
│ Use * for wildcards (e.g., release/*)                       │
│                                                             │
│ ☑ Require a pull request before merging                     │
│   ├ Required approving reviews: [2 ▾]                       │
│   └ ☐ Dismiss stale reviews when new commits pushed         │
│                                                             │
│ ☑ Require status checks to pass before merging              │
│   └ Status checks: [ci/build] [ci/test] [+ Add]             │
│                                                             │
│ ☐ Block force pushes                                        │
│ ☐ Block branch deletion                                     │
│                                                             │
│                                   [Cancel] [Save rule]      │
└─────────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria

- [ ] Can view existing branch protection rules
- [ ] Can create new rule with pattern
- [ ] Pattern supports wildcards
- [ ] Can configure require PR, required reviews
- [ ] Can configure required status checks
- [ ] Can configure force push/deletion
- [ ] Can edit existing rules
- [ ] Can delete rules

---

### TASK-PARITY-003: Webhooks Management UI

**Priority:** P2  
**Effort:** Medium (5-6 hours)  
**Dependencies:** None

#### Current API

```typescript
// src/api/trpc/routers/webhooks.ts
webhooks.create({ repoId, url, secret, events })
webhooks.update({ id, url, secret, events, isActive })
webhooks.delete({ id })
webhooks.list({ repoId })
webhooks.get({ id })
webhooks.test({ id })  // Send ping
```

#### Location

Repository Settings → Webhooks (`/:owner/:repo/settings/webhooks`)

#### Events Available

- push, pull_request, pull_request_review
- issue, issue_comment
- create, delete, fork, star

#### Files to Create

- `apps/web/src/pages/repo/settings/webhooks.tsx`
- `apps/web/src/components/settings/WebhookForm.tsx`
- `apps/web/src/components/settings/WebhookCard.tsx`

#### UI Design

```
┌─────────────────────────────────────────────────────────────┐
│ Settings / Webhooks                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Webhooks                                     [Add webhook]  │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ https://ci.example.com/webhook          ● Active        │ │
│ │ Events: push, pull_request                              │ │
│ │ Last delivery: 2 hours ago · ✓ 200 OK                   │ │
│ │                                    [Test] [Edit] [×]    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ https://slack.com/webhook/xxx           ○ Inactive      │ │
│ │ Events: issue, issue_comment                            │ │
│ │ Last delivery: 3 days ago · ✗ 500 Error                 │ │
│ │                                    [Test] [Edit] [×]    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Add Webhook Form:**
```
┌─────────────────────────────────────────────────────────────┐
│ Add webhook                                            [×]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Payload URL                                                 │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ https://                                                │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Secret (optional)                                           │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ••••••••••••                                            │ │
│ └─────────────────────────────────────────────────────────┘ │
│ Used to sign webhook payloads                               │
│                                                             │
│ Which events trigger this webhook?                          │
│                                                             │
│ ○ Just the push event                                       │
│ ○ Send me everything                                        │
│ ● Let me select individual events:                          │
│                                                             │
│   ☑ Push                    ☐ Fork                          │
│   ☑ Pull request            ☐ Star                          │
│   ☐ Pull request review     ☐ Create                        │
│   ☐ Issue                   ☐ Delete                        │
│   ☐ Issue comment                                           │
│                                                             │
│ ☑ Active                                                    │
│                                                             │
│                                [Cancel] [Add webhook]       │
└─────────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria

- [ ] Can list existing webhooks
- [ ] Can create webhook with URL and events
- [ ] Can add optional secret
- [ ] Can select events individually
- [ ] Can test webhook (ping)
- [ ] Can edit existing webhook
- [ ] Can toggle active/inactive
- [ ] Can delete webhook
- [ ] Shows last delivery status

---

### TASK-PARITY-004: Collaborators Management UI

**Priority:** P1  
**Effort:** Low (3-4 hours)  
**Dependencies:** None

#### Current API

```typescript
// src/api/trpc/routers/repos.ts
repos.addCollaborator({ repoId, username, permission })
repos.removeCollaborator({ repoId, userId })
repos.listCollaborators({ repoId })
// permission: 'read' | 'write' | 'admin'
```

#### Location

Repository Settings → Collaborators (`/:owner/:repo/settings/collaborators`)

#### Files to Create

- `apps/web/src/pages/repo/settings/collaborators.tsx`
- `apps/web/src/components/settings/CollaboratorRow.tsx`
- `apps/web/src/components/settings/InviteForm.tsx`

#### UI Design

```
┌─────────────────────────────────────────────────────────────┐
│ Settings / Collaborators                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Invite a collaborator                                       │
│ ┌────────────────────────────────┐ ┌──────────┐            │
│ │ Search by username...          │ │ Write  ▾ │ [Invite]   │
│ └────────────────────────────────┘ └──────────┘            │
│                                                             │
│ Collaborators                                               │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 👤 john        @johndoe                                 │ │
│ │    Owner                                                │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 👤 jane        @janesmith           [Admin ▾]     [×]   │ │
│ │    Added 3 days ago                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 👤 alex        @alexdev             [Write ▾]     [×]   │ │
│ │    Added 1 week ago                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Permission levels:                                          │
│ • Read - Can view and clone                                 │
│ • Write - Can push to branches                              │
│ • Admin - Full access including settings                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria

- [ ] Can list current collaborators
- [ ] Shows permission level for each
- [ ] Can invite by username
- [ ] Can select permission level
- [ ] Can change collaborator permission
- [ ] Can remove collaborator
- [ ] Owner cannot be removed

---

### TASK-PARITY-005: Milestones UI

**Priority:** P2  
**Effort:** Low (4-5 hours)  
**Dependencies:** None

#### Current API

```typescript
// src/api/trpc/routers/milestones.ts
milestones.create({ repoId, title, description, dueDate })
milestones.update({ id, title, description, dueDate, state })
milestones.delete({ id })
milestones.list({ repoId })
milestones.get({ id })
milestones.close({ id })
milestones.reopen({ id })
```

#### Location

Issues tab → Milestones (`/:owner/:repo/milestones`)

#### Files to Create

- `apps/web/src/pages/milestones/index.tsx`
- `apps/web/src/pages/milestones/[id].tsx`
- `apps/web/src/components/milestones/MilestoneCard.tsx`
- `apps/web/src/components/milestones/MilestoneForm.tsx`

#### UI Design

**List:**
```
┌─────────────────────────────────────────────────────────────┐
│ Milestones                          [Open ▾] [New milestone]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🎯 v2.0 Release                                         │ │
│ │    Ship the new dashboard                               │ │
│ │                                                         │ │
│ │    ████████████░░░░░░░░░░░░░░░░░░   75% complete       │ │
│ │    12 open · 36 closed                                  │ │
│ │                                                         │ │
│ │    📅 Due: Jan 15, 2025 (19 days left)                 │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🎯 Bug Bash                                             │ │
│ │    Fix critical bugs before release                     │ │
│ │                                                         │ │
│ │    ██████░░░░░░░░░░░░░░░░░░░░░░░░   20% complete       │ │
│ │    8 open · 2 closed                                    │ │
│ │                                                         │ │
│ │    📅 Due: Jan 10, 2025 (14 days left)                 │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria

- [ ] Can list milestones with progress
- [ ] Progress bar shows open/closed ratio
- [ ] Due date displayed with countdown
- [ ] Can create new milestone
- [ ] Can edit milestone
- [ ] Can close/reopen milestone
- [ ] Can delete milestone
- [ ] Can filter issues by milestone (in issues list)

---

### TASK-PARITY-006: Organization Management UI

**Priority:** P2  
**Effort:** High (8-10 hours)  
**Dependencies:** None

#### Current API

```typescript
// src/api/trpc/routers/organizations.ts
organizations.create({ name, displayName, description })
organizations.update({ id, displayName, description, avatarUrl })
organizations.delete({ id })
organizations.get({ slug })
organizations.listForUser()
organizations.addMember({ orgId, userId, role })
organizations.removeMember({ orgId, userId })
organizations.updateMember({ orgId, userId, role })
organizations.listMembers({ orgId })

// Teams
organizations.createTeam({ orgId, name, description })
organizations.deleteTeam({ teamId })
organizations.addTeamMember({ teamId, userId })
organizations.removeTeamMember({ teamId, userId })
```

#### Pages to Create

| Route | Purpose |
|-------|---------|
| `/orgs/new` | Create org |
| `/org/:slug` | Org profile |
| `/org/:slug/members` | Member list |
| `/org/:slug/teams` | Team management |
| `/org/:slug/settings` | Org settings |

#### Files to Create

- `apps/web/src/pages/orgs/new.tsx`
- `apps/web/src/pages/org/[slug]/index.tsx`
- `apps/web/src/pages/org/[slug]/members.tsx`
- `apps/web/src/pages/org/[slug]/teams.tsx`
- `apps/web/src/pages/org/[slug]/settings.tsx`
- `apps/web/src/components/org/OrgHeader.tsx`
- `apps/web/src/components/org/MemberRow.tsx`
- `apps/web/src/components/org/TeamCard.tsx`

#### Acceptance Criteria

- [ ] Can create organization
- [ ] Org profile page works
- [ ] Can invite members
- [ ] Can set member roles (member/admin/owner)
- [ ] Can remove members
- [ ] Can create teams
- [ ] Can add members to teams
- [ ] Can update org settings
- [ ] Can delete org (owner only)

---

### TASK-PARITY-007: User Settings - SSH Keys & Tokens

**Priority:** P1  
**Effort:** Low (4-5 hours)  
**Dependencies:** None

#### Current API

```typescript
// src/api/trpc/routers/ssh-keys.ts
sshKeys.create({ title, publicKey })
sshKeys.delete({ id })
sshKeys.list()

// src/api/trpc/routers/tokens.ts
tokens.create({ name, scopes, expiresAt })
tokens.revoke({ id })
tokens.list()
// scopes: 'repo', 'user', 'org', 'webhook', 'admin'
```

#### Location

User Settings (`/settings/keys` and `/settings/tokens`)

#### Files to Create

- `apps/web/src/pages/settings/keys.tsx`
- `apps/web/src/pages/settings/tokens.tsx`
- `apps/web/src/components/settings/SSHKeyRow.tsx`
- `apps/web/src/components/settings/TokenRow.tsx`
- `apps/web/src/components/settings/CreateTokenForm.tsx`

#### UI Design

**SSH Keys:**
```
┌─────────────────────────────────────────────────────────────┐
│ Settings / SSH Keys                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ SSH Keys                                        [Add key]   │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🔑 MacBook Pro                                          │ │
│ │    SHA256:abc123...xyz789                               │ │
│ │    Added Dec 15, 2024                           [Delete]│ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🔑 Work Desktop                                         │ │
│ │    SHA256:def456...uvw012                               │ │
│ │    Added Nov 2, 2024                            [Delete]│ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Personal Access Tokens:**
```
┌─────────────────────────────────────────────────────────────┐
│ Settings / Personal Access Tokens                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Tokens                                    [Generate token]  │
│                                                             │
│ ⚠️ Tokens are shown only once. Store them securely.         │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🎫 CI Pipeline                                          │ │
│ │    Scopes: repo, webhook                                │ │
│ │    Created Dec 20, 2024 · Expires Jan 20, 2025          │ │
│ │    Last used: 2 hours ago                       [Revoke]│ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🎫 Local Dev                                            │ │
│ │    Scopes: repo, user                                   │ │
│ │    Created Dec 1, 2024 · Never expires                  │ │
│ │    Last used: 5 days ago                        [Revoke]│ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Create Token (shows token ONCE):**
```
┌─────────────────────────────────────────────────────────────┐
│ ✓ Token created successfully!                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Your new personal access token:                             │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ wit_pat_abc123xyz456def789...                    [Copy] │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ⚠️ Make sure to copy your token now.                        │
│    You won't be able to see it again!                       │
│                                                             │
│                                                    [Done]   │
└─────────────────────────────────────────────────────────────┘
```

#### Acceptance Criteria

- [ ] Can list SSH keys
- [ ] Can add SSH key (paste public key)
- [ ] Shows key fingerprint
- [ ] Can delete SSH key
- [ ] Can list tokens (masked)
- [ ] Can create token with name, scopes, expiry
- [ ] Token shown once on creation
- [ ] Can copy token
- [ ] Can revoke token

---

## Agent Prompt

```
You are implementing feature parity for wit, a GitHub alternative.

Context:
- All backend APIs already exist in src/api/trpc/routers/
- Your job is to build the UI that calls these APIs
- Follow existing patterns in apps/web/src/
- Use shadcn/ui components and Tailwind
- Match the existing dark theme aesthetic

Your task: [TASK-ID]

Requirements:
[Copy requirements from above]

Steps:
1. Check the API router to understand available methods
2. Create page components for each route
3. Create reusable form/card components
4. Wire up tRPC queries and mutations
5. Add proper loading/error states
6. Test the full flow

Patterns to follow:
- Use trpc.useQuery for fetching
- Use trpc.useMutation for actions
- Invalidate queries after mutations
- Use shadcn/ui form components
- Add toast notifications for success/error
```

---

## Dependencies

All tasks are independent and can be parallelized.

```
TASK-PARITY-001 ─────────────────────────► (none)
TASK-PARITY-002 ─────────────────────────► (none)
TASK-PARITY-003 ─────────────────────────► (none)
TASK-PARITY-004 ─────────────────────────► (none)
TASK-PARITY-005 ─────────────────────────► (none)
TASK-PARITY-006 ─────────────────────────► (none)
TASK-PARITY-007 ─────────────────────────► (none)
```

---

## Success Metrics

- All features accessible from UI
- No "you need to use the API for this" situations
- Settings pages are discoverable
- Forms have good validation and error messages
