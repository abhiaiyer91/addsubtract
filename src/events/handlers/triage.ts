/**
 * Triage Agent Event Handler
 * 
 * Listens for new issues and triggers the triage workflow when enabled.
 * Uses Mastra workflows for multi-step, orchestrated triage analysis.
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
import { runIssueTriageWorkflow, type IssueTriageInput } from '../../ai/index.js';
import { repoAiKeyModel } from '../../db/models/repo-ai-keys';

/**
 * Register triage agent handlers
 */
export function registerTriageHandlers(): void {
  eventBus.on('issue.created', handleIssueCreated);
  console.log('[EventBus] Triage workflow handlers registered');
}

/**
 * Handle new issue creation - trigger triage workflow if enabled
 */
async function handleIssueCreated(event: IssueCreatedEvent): Promise<void> {
  const { issueId, issueNumber, issueTitle, repoId, repoFullName } = event.payload;
  
  console.log(`[TriageHandler] Received issue.created event for ${repoFullName}#${issueNumber}`);
  
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
