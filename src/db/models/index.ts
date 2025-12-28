// User models (uses better-auth user table)
export { userModel, type User, type NewUser } from './user';

// SSH Keys model
export { sshKeyModel } from './ssh-keys';

// Personal Access Tokens model
export { tokenModel, TOKEN_SCOPES, type TokenScope, type TokenWithValue } from './tokens';

// Branch Protection model
export { branchProtectionModel, matchesPattern } from './branch-protection';

// Organization models
export { orgModel, orgMemberModel, teamModel, teamMemberModel } from './organization';

// Repository models
export {
  repoModel,
  collaboratorModel,
  starModel,
  watchModel,
} from './repository';

// Pull request models
export {
  prModel,
  prReviewModel,
  prCommentModel,
  prLabelModel,
  prReviewerModel,
  inboxModel,
  type InboxPr,
} from './pull-request';

// Issue models
export {
  issueModel,
  issueCommentModel,
  labelModel,
  issueLabelModel,
  issueInboxModel,
  ISSUE_STATUSES,
  ISSUE_PRIORITIES,
  PRIORITY_CONFIG,
} from './issue';

// Issue relations model
export { issueRelationModel } from './issue-relations';

// Issue activity model
export { issueActivityModel, type ActivityAction } from './issue-activity';

// Issue template model
export { issueTemplateModel } from './issue-template';

// Issue view model
export { issueViewModel, type ViewFilters, type ViewDisplayOptions } from './issue-view';

// Project models
export { projectModel, projectUpdateModel, PROJECT_STATUSES, PROJECT_HEALTH, PROJECT_STATUS_CONFIG } from './project';

// Cycle model
export { cycleModel } from './cycle';

// Activity model
export { activityModel, activityHelpers, type ActivityType, type ActivityPayload } from './activity';

// Webhook model
export {
  webhookModel,
  webhookDelivery,
  type WebhookEvent,
} from './webhook';

// Milestone model
export { milestoneModel, type MilestoneWithProgress } from './milestones';

// Release models
export { releaseModel, releaseAssetModel } from './releases';

// Notification models
export { notificationModel, notificationHelpers, type NotificationWithActor } from './notification';

// Email notification preferences model
export { emailPreferencesModel } from './email-preferences';

// Workflow/CI models
export {
  workflowRunModel,
  jobRunModel,
  stepRunModel,
  getWorkflowRunWithDetails,
  type WorkflowRunWithJobs,
} from './workflow';

// Stack models (stacked diffs)
export {
  stackModel,
  stackBranchModel,
  type StackBranchWithPR,
  type StackWithDetails,
} from './stack';

// Agent models (coding agent sessions and messages)
export {
  agentSessionModel,
  agentMessageModel,
  agentFileChangeModel,
} from './agent';

// Repository AI Keys model
export { repoAiKeyModel, type RepoAiKeyInfo } from './repo-ai-keys';

// User Stats model (dashboard data)
export {
  userStatsModel,
  type ContributionDay,
  type ContributionStreak,
  type UserContributionStats,
  type DashboardSummary,
  type DashboardRepo,
  type ActivityFeedItem,
} from './user-stats';

// Journal models (Notion-like documentation)
export {
  journalPageModel,
  journalCommentModel,
  journalPageHistoryModel,
  generateSlug,
  JOURNAL_PAGE_STATUSES,
  JOURNAL_STATUS_CONFIG,
} from './journal';

// Wrapped model (monthly activity insights)
export {
  wrappedModel,
  type WrappedData,
  type WrappedPeriod,
  type ActivityBreakdown,
  type DailyActivity,
  type HourlyDistribution,
  type DayOfWeekDistribution,
  type TopRepository,
  type TopCollaborator,
  type StreakInfo,
  type FunStats,
  type AIUsageStats,
  type CIStats,
} from './wrapped';

// Triage Agent models
export {
  triageAgentConfigModel,
  triageAgentRunModel,
} from './triage-agent';

// Package registry models
export {
  packageModel,
  packageVersionModel,
  distTagModel,
  maintainerModel,
  parsePackageName,
  getFullPackageName,
  generatePackageMetadata,
} from './packages';
