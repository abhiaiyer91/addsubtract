/**
 * Gamification Event Handlers
 *
 * Listens to activity events and awards XP, checks for achievements,
 * and updates user progression.
 */

import { gamificationModel, XP_REWARDS } from '../db/models/gamification';
import {
  getAchievementKeyForMilestone,
  getAchievementThresholds,
} from '../db/models/achievement-definitions';

/**
 * Process a commit activity
 */
export async function onCommit(
  userId: string,
  repoId: string,
  options?: {
    commitMessage?: string;
    isAiGenerated?: boolean;
    hour?: number;
  }
): Promise<void> {
  // Record activity and get streak
  const { streakUpdated, newStreak } = await gamificationModel.recordActivity(userId, 'commit');
  
  // Award base XP
  let xpAmount: number = XP_REWARDS.commit;
  let description = 'Made a commit';
  
  // Bonus for good commit messages (over 50 chars)
  if (options?.commitMessage && options.commitMessage.length > 50) {
    xpAmount = XP_REWARDS.commitWithGoodMessage;
    description = 'Made a commit with detailed message';
  }
  
  await gamificationModel.awardXp(userId, xpAmount, 'commit', description, repoId);
  
  // Check for commit-based achievements
  const profile = await gamificationModel.getOrCreateUserGamification(userId);
  const thresholds = getAchievementThresholds('commits');
  
  for (const threshold of thresholds) {
    if (profile.totalCommits >= threshold) {
      const key = getAchievementKeyForMilestone('commits', threshold);
      if (key) {
        await gamificationModel.unlockAchievement(userId, key, `Reached ${threshold} commits`);
      }
    }
  }
  
  // Check streak achievements
  if (streakUpdated) {
    await checkStreakAchievements(userId, newStreak);
  }
  
  // Check for special time-based achievements
  if (options?.hour !== undefined) {
    await checkTimeBasedAchievements(userId, options.hour);
  }
  
  // Track AI commit achievement
  if (options?.isAiGenerated) {
    // This would need separate tracking - for now just note it
  }
  
  // Check for level-up achievements
  await checkLevelAchievements(userId);
}

/**
 * Process a PR opened event
 */
export async function onPrOpened(
  userId: string,
  repoId: string,
  prId: string
): Promise<void> {
  await gamificationModel.recordActivity(userId, 'pr_opened');
  await gamificationModel.awardXp(userId, XP_REWARDS.prOpened, 'pr_opened', 'Opened a pull request', prId);
  
  // Check for first PR achievement
  const profile = await gamificationModel.getOrCreateUserGamification(userId);
  if (profile.totalPrsOpened === 1) {
    await gamificationModel.unlockAchievement(userId, 'first_pr', `PR in repo ${repoId}`);
  }
}

/**
 * Process a PR merged event
 */
export async function onPrMerged(
  userId: string,
  repoId: string,
  prId: string,
  options?: {
    openedAt?: Date;
    isExternalContribution?: boolean;
  }
): Promise<void> {
  await gamificationModel.recordActivity(userId, 'pr_merged');
  await gamificationModel.awardXp(userId, XP_REWARDS.prMerged, 'pr_merged', 'Pull request merged', prId);
  
  // Check for PR merged achievements
  const profile = await gamificationModel.getOrCreateUserGamification(userId);
  const thresholds = getAchievementThresholds('prs_merged');
  
  for (const threshold of thresholds) {
    if (profile.totalPrsMerged >= threshold) {
      const key = getAchievementKeyForMilestone('prs_merged', threshold);
      if (key) {
        await gamificationModel.unlockAchievement(userId, key, `Merged ${threshold} PRs`);
      }
    }
  }
  
  // Check for speedrun achievement (PR merged within 10 minutes)
  if (options?.openedAt) {
    const timeDiff = Date.now() - options.openedAt.getTime();
    if (timeDiff < 10 * 60 * 1000) { // 10 minutes
      await gamificationModel.unlockAchievement(userId, 'speedrun', `PR merged in ${Math.round(timeDiff / 1000)}s`);
    }
  }
  
  // Check for community contributor
  if (options?.isExternalContribution) {
    await gamificationModel.unlockAchievement(userId, 'community_contributor', `External contribution to ${repoId}`);
  }
}

/**
 * Process a review submitted event
 */
export async function onReviewSubmitted(
  userId: string,
  prId: string,
  reviewState: 'approved' | 'changes_requested' | 'commented'
): Promise<void> {
  await gamificationModel.recordActivity(userId, 'review');
  
  let xpAmount: number;
  let description: string;
  
  switch (reviewState) {
    case 'approved':
      xpAmount = XP_REWARDS.reviewApproved;
      description = 'Approved a pull request';
      break;
    case 'changes_requested':
      xpAmount = XP_REWARDS.reviewChangesRequested;
      description = 'Requested changes on a pull request';
      break;
    case 'commented':
      xpAmount = XP_REWARDS.reviewComment;
      description = 'Commented on a pull request review';
      break;
  }
  
  await gamificationModel.awardXp(userId, xpAmount, 'review', description, prId);
  
  // Check for review achievements
  const profile = await gamificationModel.getOrCreateUserGamification(userId);
  const thresholds = getAchievementThresholds('reviews');
  
  for (const threshold of thresholds) {
    if (profile.totalReviews >= threshold) {
      const key = getAchievementKeyForMilestone('reviews', threshold);
      if (key) {
        await gamificationModel.unlockAchievement(userId, key, `Submitted ${threshold} reviews`);
      }
    }
  }
}

/**
 * Process an issue opened event
 */
export async function onIssueOpened(
  userId: string,
  repoId: string,
  issueId: string
): Promise<void> {
  await gamificationModel.recordActivity(userId, 'issue_opened');
  await gamificationModel.awardXp(userId, XP_REWARDS.issueOpened, 'issue_opened', 'Opened an issue', issueId);
  
  // Check achievements
  const profile = await gamificationModel.getOrCreateUserGamification(userId);
  const thresholds = getAchievementThresholds('issues_opened');
  
  for (const threshold of thresholds) {
    if (profile.totalIssuesOpened >= threshold) {
      const key = getAchievementKeyForMilestone('issues_opened', threshold);
      if (key) {
        await gamificationModel.unlockAchievement(userId, key, `Opened ${threshold} issues`);
      }
    }
  }
}

/**
 * Process an issue closed event
 */
export async function onIssueClosed(
  userId: string,
  issueId: string
): Promise<void> {
  await gamificationModel.recordActivity(userId, 'issue_closed');
  await gamificationModel.awardXp(userId, XP_REWARDS.issueClosed, 'issue_closed', 'Closed an issue', issueId);
  
  // Check achievements
  const profile = await gamificationModel.getOrCreateUserGamification(userId);
  const thresholds = getAchievementThresholds('issues_closed');
  
  for (const threshold of thresholds) {
    if (profile.totalIssuesClosed >= threshold) {
      const key = getAchievementKeyForMilestone('issues_closed', threshold);
      if (key) {
        await gamificationModel.unlockAchievement(userId, key, `Closed ${threshold} issues`);
      }
    }
  }
}

/**
 * Process a comment event
 */
export async function onComment(
  userId: string,
  targetId: string,
  targetType: 'pr' | 'issue'
): Promise<void> {
  await gamificationModel.recordActivity(userId, 'comment');
  await gamificationModel.awardXp(userId, XP_REWARDS.comment, 'comment', `Commented on ${targetType}`, targetId);
  
  // Check achievements
  const profile = await gamificationModel.getOrCreateUserGamification(userId);
  const thresholds = getAchievementThresholds('comments');
  
  for (const threshold of thresholds) {
    if (profile.totalComments >= threshold) {
      const key = getAchievementKeyForMilestone('comments', threshold);
      if (key) {
        await gamificationModel.unlockAchievement(userId, key, `Made ${threshold} comments`);
      }
    }
  }
}

/**
 * Process a repo created event
 */
export async function onRepoCreated(
  userId: string,
  repoId: string
): Promise<void> {
  await gamificationModel.awardXp(userId, XP_REWARDS.firstRepo, 'repo_created', 'Created a repository', repoId);
  
  // Unlock first repo achievement
  await gamificationModel.unlockAchievement(userId, 'first_repo', `Created repo ${repoId}`);
}

/**
 * Process a release published event
 */
export async function onReleasePublished(
  userId: string,
  repoId: string,
  releaseTag: string
): Promise<void> {
  await gamificationModel.awardXp(userId, XP_REWARDS.releasePublished, 'release', `Published release ${releaseTag}`, repoId);
  
  // Unlock release achievement
  await gamificationModel.unlockAchievement(userId, 'first_release', `Released ${releaseTag}`);
}

/**
 * Process a fork event
 */
export async function onRepoForked(
  userId: string,
  repoId: string,
  forkedFromId: string
): Promise<void> {
  await gamificationModel.awardXp(userId, XP_REWARDS.firstFork, 'fork', 'Forked a repository', repoId);
  
  // Unlock fork achievement
  await gamificationModel.unlockAchievement(userId, 'first_fork', `Forked from ${forkedFromId}`);
}

/**
 * Process a star received event
 */
export async function onStarReceived(
  userId: string,
  repoId: string,
  totalStars: number
): Promise<void> {
  await gamificationModel.awardXp(userId, XP_REWARDS.firstStar, 'star_received', 'Repository starred', repoId);
  
  // Check star achievements
  if (totalStars === 1) {
    await gamificationModel.unlockAchievement(userId, 'first_star_received', `First star on ${repoId}`);
  }
  if (totalStars >= 100) {
    await gamificationModel.unlockAchievement(userId, 'stars_received_100', `100 stars across repos`);
  }
}

/**
 * Check and award streak achievements
 */
async function checkStreakAchievements(userId: string, streak: number): Promise<void> {
  const thresholds = getAchievementThresholds('streak');
  
  for (const threshold of thresholds) {
    if (streak >= threshold) {
      const key = getAchievementKeyForMilestone('streak', threshold);
      if (key) {
        await gamificationModel.unlockAchievement(userId, key, `${threshold}-day streak`);
      }
    }
  }
  
  // Award streak bonus XP
  if (streak === 7) {
    await gamificationModel.awardXp(userId, XP_REWARDS.weeklyStreak, 'streak_bonus', 'Weekly streak bonus');
  } else if (streak === 30) {
    await gamificationModel.awardXp(userId, XP_REWARDS.monthlyStreak, 'streak_bonus', 'Monthly streak bonus');
  }
}

/**
 * Check and award level achievements
 */
async function checkLevelAchievements(userId: string): Promise<void> {
  const profile = await gamificationModel.getOrCreateUserGamification(userId);
  const thresholds = getAchievementThresholds('level');
  
  for (const threshold of thresholds) {
    if (profile.level >= threshold) {
      const key = getAchievementKeyForMilestone('level', threshold);
      if (key) {
        await gamificationModel.unlockAchievement(userId, key, `Reached level ${threshold}`);
      }
    }
  }
}

/**
 * Check and award time-based achievements
 */
async function checkTimeBasedAchievements(userId: string, hour: number): Promise<void> {
  // Night owl (midnight to 4 AM)
  if (hour >= 0 && hour < 4) {
    await gamificationModel.unlockAchievement(userId, 'night_owl', `Commit at ${hour}:00`);
  }
  
  // Early bird (5 AM to 7 AM)
  if (hour >= 5 && hour < 7) {
    await gamificationModel.unlockAchievement(userId, 'early_bird', `Commit at ${hour}:00`);
  }
  
  // Check for special date achievements
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  
  // New Year
  if (month === 1 && day === 1) {
    await gamificationModel.unlockAchievement(userId, 'new_year_commit', 'Commit on January 1st');
  }
  
  // Halloween
  if (month === 10 && day === 31) {
    await gamificationModel.unlockAchievement(userId, 'halloween_commit', 'Commit on Halloween');
  }
}

/**
 * Get a user's full gamification profile
 */
export async function getGamificationProfile(userId: string) {
  const profile = await gamificationModel.getUserProfile(userId);
  const rank = await gamificationModel.getUserRank(userId);
  const xpHistory = await gamificationModel.getXpHistory(userId, 30);
  
  return {
    ...profile,
    rank,
    xpHistory,
  };
}

/**
 * Get leaderboard
 */
export async function getLeaderboard(
  timeframe: 'all' | 'month' | 'week' = 'all',
  limit = 50
) {
  return gamificationModel.getLeaderboard(limit, timeframe);
}
