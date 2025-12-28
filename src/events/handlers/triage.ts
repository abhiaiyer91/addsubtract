/**
 * Triage Agent Event Handler
 * 
 * Listens for new and reopened issues and triggers the triage workflow when enabled.
 * Uses Mastra workflows for multi-step, orchestrated triage analysis.
 */

import { eventBus } from '../bus';
import type { IssueCreatedEvent, IssueReopenedEvent } from '../types';
import { 
  triageAgentConfigModel, 
  triageAgentRunModel,
  issueModel,
  repoModel,
  userModel,
  issueLabelModel,
} from '../../db/models';
import { runIssueTriageWorkflow, type IssueTriageInput } from '../../ai/index.js';
import { repoAiKeyModel } from '../../db/models/repo-ai-keys';

// Label name that indicates an issue has already been triaged
const AI_TRIAGE_LABEL = 'ai-triage';

/**
 * Register triage agent handlers
 */
export function registerTriageHandlers(): void {
  eventBus.on('issue.created', handleIssueCreated);
  eventBus.on('issue.reopened', handleIssueReopened);
  console.log('[EventBus] Triage workflow handlers registered');
}

/**
 * Handle new issue creation - trigger triage workflow if enabled
 */
async function handleIssueCreated(event: IssueCreatedEvent): Promise<void> {
  const { issueNumber, repoFullName } = event.payload;
  console.log(`[TriageHandler] Received issue.created event for ${repoFullName}#${issueNumber}`);
  await handleIssueTriage(event.payload, 'created');
}

/**
 * Handle issue reopened - trigger triage only if not already triaged
 */
async function handleIssueReopened(event: IssueReopenedEvent): Promise<void> {
  const { issueId, issueNumber, repoFullName } = event.payload;
  
  console.log(`[TriageHandler] Received issue.reopened event for ${repoFullName}#${issueNumber}`);
  
  // Check if the issue already has the ai-triage label
  const labels = await issueLabelModel.listByIssue(issueId);
  const hasTriageLabel = labels.some(label => label.name.toLowerCase() === AI_TRIAGE_LABEL);
  
  if (hasTriageLabel) {
    console.log(`[TriageHandler] Issue ${repoFullName}#${issueNumber} already has '${AI_TRIAGE_LABEL}' label, skipping triage`);
    return;
  }
  
  await handleIssueTriage(event.payload, 'reopened');
}

/**
 * Common handler for issue triage (for both created and reopened events)
 */
async function handleIssueTriage(
  payload: { issueId: string; issueNumber: number; issueTitle: string; repoId: string; repoFullName: string },
  trigger: 'created' | 'reopened'
): Promise<void> {
  const { issueId, issueNumber, issueTitle, repoId, repoFullName } = payload;
  
  try {
    // Check if triage agent is enabled for this repo
    const config = await triageAgentConfigModel.findByRepoId(repoId);
    console.log(`[TriageHandler] Config for repo ${repoId}:`, config ? { enabled: config.enabled, autoAssignLabels: config.autoAssignLabels, autoSetPriority: config.autoSetPriority } : 'NOT FOUND');
    
    if (!config?.enabled) {
      console.log(`[TriageHandler] Triage not enabled for ${repoFullName}, skipping`);
      return; // Triage agent not enabled
    }

    // Get the full issue details
    const issue = await issueModel.findById(issueId);
    if (!issue) {
      console.error(`[TriageWorkflow] Issue ${issueId} not found`);
      return;
    }

    // Get repo details for context
    const repo = await repoModel.findById(repoId);
    if (!repo) {
      console.error(`[TriageWorkflow] Repository ${repoId} not found`);
      return;
    }

    // Check if AI keys are available
    const aiAvailability = await repoAiKeyModel.checkAvailability(repoId);
    console.log(`[TriageHandler] AI availability for ${repoFullName}:`, aiAvailability);
    
    if (!aiAvailability.available) {
      console.log(`[TriageHandler] Skipping triage for ${repoFullName}#${issueNumber} - no AI keys available`);
      return;
    }

    // Get author info
    console.log(`[TriageHandler] Looking up author ${issue.authorId}`);
    const author = await userModel.findById(issue.authorId);
    if (!author) {
      console.error(`[TriageHandler] Author ${issue.authorId} not found`);
      return;
    }
    console.log(`[TriageHandler] Found author: ${author.username || author.name}`);

    // Get the owner info for the repo path
    const [ownerName] = repoFullName.split('/');

    // Build the workflow input
    const workflowInput: IssueTriageInput = {
      issueId,
      issueNumber,
      repoId,
      repoPath: repo.diskPath,
      title: issueTitle,
      body: issue.body || undefined,
      authorId: issue.authorId,
      authorUsername: author.username || 'unknown',
      autoAssignLabels: config.autoAssignLabels,
      autoAssignUser: config.autoAssignUsers,
      autoSetPriority: config.autoSetPriority,
      addTriageComment: config.addTriageComment,
      customPrompt: config.prompt || undefined,
    };

    console.log(`[TriageHandler] Running triage workflow for ${repoFullName}#${issueNumber}`);
    console.log(`[TriageHandler] Workflow input:`, JSON.stringify(workflowInput, null, 2));

    // Run the triage workflow
    const result = await runIssueTriageWorkflow(workflowInput);
    console.log(`[TriageHandler] Workflow result:`, JSON.stringify(result, null, 2));

    // Log the run
    await triageAgentRunModel.create({
      repoId,
      issueId,
      success: result.success,
      errorMessage: result.error,
      assignedLabels: result.appliedLabels ? JSON.stringify(result.appliedLabels) : null,
      assignedUserId: result.assignedTo ? undefined : undefined, // Would need to look up user ID
      assignedPriority: result.priority,
      reasoning: result.reasoning,
      tokensUsed: undefined, // Not tracked by workflow currently
    });

    if (result.success) {
      console.log(`[TriageWorkflow] Successfully triaged ${repoFullName}#${issueNumber}`);
      console.log(`  Type: ${result.issueType}, Priority: ${result.priority}`);
      console.log(`  Labels: ${result.appliedLabels?.join(', ') || 'none'}`);
      if (result.similarIssues.length > 0) {
        console.log(`  Found ${result.similarIssues.length} similar issues`);
      }
    } else {
      console.error(`[TriageWorkflow] Failed to triage ${repoFullName}#${issueNumber}: ${result.error}`);
    }
  } catch (error) {
    console.error(`[TriageHandler] Error processing issue ${issueId}:`, error);
    console.error(`[TriageHandler] Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
    
    // Log the failed run
    try {
      await triageAgentRunModel.create({
        repoId,
        issueId,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    } catch (logError) {
      console.error('[TriageWorkflow] Failed to log run:', logError);
    }
  }
}
