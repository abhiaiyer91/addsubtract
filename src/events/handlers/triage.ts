/**
 * Triage Agent Event Handler
 * 
 * Listens for new issues and triggers the triage agent when enabled.
 */

import { eventBus } from '../bus';
import type { IssueCreatedEvent } from '../types';
import { 
  triageAgentConfigModel, 
  triageAgentRunModel,
  issueModel,
  repoModel,
  userModel,
} from '../../db/models';
import { runTriageAgent, type TriageContext } from '../../ai/agents/triage-agent.js';
import { repoAiKeyModel } from '../../db/models/repo-ai-keys';

/**
 * Register triage agent handlers
 */
export function registerTriageHandlers(): void {
  eventBus.on('issue.created', handleIssueCreated);
  console.log('[EventBus] Triage agent handlers registered');
}

/**
 * Handle new issue creation - trigger triage agent if enabled
 */
async function handleIssueCreated(event: IssueCreatedEvent): Promise<void> {
  const { issueId, issueNumber, issueTitle, repoId, repoFullName } = event.payload;
  
  try {
    // Check if triage agent is enabled for this repo
    const config = await triageAgentConfigModel.findByRepoId(repoId);
    if (!config?.enabled) {
      return; // Triage agent not enabled
    }

    // Get the full issue details
    const issue = await issueModel.findById(issueId);
    if (!issue) {
      console.error(`[TriageAgent] Issue ${issueId} not found`);
      return;
    }

    // Get repo details for context
    const repo = await repoModel.findById(repoId);
    if (!repo) {
      console.error(`[TriageAgent] Repository ${repoId} not found`);
      return;
    }

    // Check if AI keys are available
    const aiAvailability = await repoAiKeyModel.checkAvailability(repoId);
    if (!aiAvailability.available) {
      console.log(`[TriageAgent] Skipping triage for ${repoFullName}#${issueNumber} - no AI keys available`);
      return;
    }

    // Get the owner info for the repo path
    const [ownerName] = repoFullName.split('/');

    // Build the triage context
    const triageContext: TriageContext = {
      repoId,
      owner: ownerName,
      repoName: repo.name,
      repoPath: repo.diskPath,
      userId: config.updatedById, // Use the user who configured the agent
      mode: 'pm', // Triage is a PM-like activity
      issueId,
      issueNumber,
      issueTitle,
      issueBody: issue.body || '',
      customPrompt: config.prompt || undefined,
      autoAssignLabels: config.autoAssignLabels,
      autoAssignUsers: config.autoAssignUsers,
      autoSetPriority: config.autoSetPriority,
      addTriageComment: config.addTriageComment,
    };

    console.log(`[TriageAgent] Running triage for ${repoFullName}#${issueNumber}`);

    // Run the triage agent
    const result = await runTriageAgent(triageContext);

    // Log the run
    await triageAgentRunModel.create({
      repoId,
      issueId,
      success: result.success,
      errorMessage: result.error,
      assignedLabels: result.labels ? JSON.stringify(result.labels) : null,
      assignedUserId: result.assigneeId,
      assignedPriority: result.priority,
      reasoning: result.reasoning,
      tokensUsed: result.tokensUsed,
    });

    if (result.success) {
      console.log(`[TriageAgent] Successfully triaged ${repoFullName}#${issueNumber}`);
    } else {
      console.error(`[TriageAgent] Failed to triage ${repoFullName}#${issueNumber}: ${result.error}`);
    }
  } catch (error) {
    console.error(`[TriageAgent] Error processing issue ${issueId}:`, error);
    
    // Log the failed run
    try {
      await triageAgentRunModel.create({
        repoId,
        issueId,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    } catch (logError) {
      console.error('[TriageAgent] Failed to log run:', logError);
    }
  }
}
